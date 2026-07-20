import assert from "node:assert/strict";
import { InMemoryStore, type Item } from "@langchain/langgraph";

type Collection = "preferences" | "memories";

function userNamespace(
  organizationId: string,
  userId: string,
  collection: Collection
): string[] {
  return ["organizations", organizationId, "users", userId, collection];
}

function namespaceHasPrefix(namespace: string[], prefix: string[]): boolean {
  return (
    namespace.length >= prefix.length &&
    prefix.every((segment, index) => namespace[index] === segment)
  );
}

function itemAddress(item: Item): string {
  return `${item.namespace.join(" / ")} :: ${item.key}`;
}

function sortItems(items: Item[]): Item[] {
  return [...items].sort((left, right) =>
    itemAddress(left).localeCompare(itemAddress(right))
  );
}

function sortNamespaces(namespaces: string[][]): string[][] {
  return [...namespaces].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right))
  );
}

function requireItem(item: Item | null, label: string): Item {
  if (item === null) {
    throw new Error(`${label}: expected an Item, received null`);
  }

  return item;
}

async function searchByNamespacePrefix(
  store: InMemoryStore,
  prefix: string[]
): Promise<Item[]> {
  const candidates = await store.search(prefix, { limit: 100 });

  // A namespace is not an authorization boundary. Verify every segment before
  // using prefix results in tenant- or user-scoped application code.
  return candidates.filter((item) =>
    namespaceHasPrefix(item.namespace, prefix)
  );
}

async function main() {
  const store = new InMemoryStore();
  const recordKey = "profile";

  const acmeAlicePreferences = userNamespace(
    "org-acme",
    "user-alice",
    "preferences"
  );
  const acmeAliceMemories = userNamespace(
    "org-acme",
    "user-alice",
    "memories"
  );
  const acmeBobPreferences = userNamespace(
    "org-acme",
    "user-bob",
    "preferences"
  );
  const betaAlicePreferences = userNamespace(
    "org-beta",
    "user-alice",
    "preferences"
  );

  const records = [
    {
      namespace: acmeAlicePreferences,
      value: { kind: "preference", tone: "concise" }
    },
    {
      namespace: acmeAliceMemories,
      value: { kind: "memory", note: "喜欢 TypeScript 示例" }
    },
    {
      namespace: acmeBobPreferences,
      value: { kind: "preference", tone: "detailed" }
    },
    {
      namespace: betaAlicePreferences,
      value: { kind: "preference", tone: "formal" }
    }
  ];

  console.log("Store namespace basics (no Graph, no LLM, no embeddings)\n");
  console.log(
    "Schema: organizations / <orgId> / users / <userId> / <collection>"
  );

  console.log("\n1. The same key can exist in different namespaces");
  for (const record of records) {
    await store.put(record.namespace, recordKey, record.value);
    console.log(`saved: ${record.namespace.join(" / ")} :: ${recordKey}`);
  }

  console.log("\n2. get(namespace, key) performs an exact lookup");
  const acmeAlice = requireItem(
    await store.get(acmeAlicePreferences, recordKey),
    "Acme/Alice preferences"
  );
  const betaAlice = requireItem(
    await store.get(betaAlicePreferences, recordKey),
    "Beta/Alice preferences"
  );
  const parentLookup = await store.get(
    ["organizations", "org-acme"],
    recordKey
  );

  assert.equal(acmeAlice.value.tone, "concise");
  assert.equal(betaAlice.value.tone, "formal");
  assert.equal(parentLookup, null);

  console.log("Acme/Alice:", acmeAlice.value);
  console.log("Beta/Alice:", betaAlice.value);
  console.log("Parent namespace lookup:", parentLookup);

  console.log("\n3. search(prefix) recursively lists Items below that prefix");
  const acmePrefix = ["organizations", "org-acme"];
  const acmeAlicePrefix = [
    "organizations",
    "org-acme",
    "users",
    "user-alice"
  ];
  const acmeItems = sortItems(
    await searchByNamespacePrefix(store, acmePrefix)
  );
  const acmeAliceItems = sortItems(
    await searchByNamespacePrefix(store, acmeAlicePrefix)
  );

  assert.equal(acmeItems.length, 3);
  assert.ok(
    acmeItems.every((item) =>
      namespaceHasPrefix(item.namespace, acmePrefix)
    )
  );
  assert.deepStrictEqual(
    acmeAliceItems.map((item) => item.namespace.at(-1)),
    ["memories", "preferences"]
  );

  console.log(`Acme prefix count: ${acmeItems.length} (org-beta excluded)`);
  for (const item of acmeAliceItems) {
    console.log(`${itemAddress(item)} -> ${JSON.stringify(item.value)}`);
  }

  console.log("\n4. listNamespaces() returns namespace paths, not Items");
  const fullNamespaces = sortNamespaces(
    await store.listNamespaces({
      prefix: acmeAlicePrefix,
      limit: 100
    })
  );

  const acmeUserBranches = sortNamespaces(
    await store.listNamespaces({
      prefix: ["organizations", "org-acme", "users"],
      maxDepth: 4,
      limit: 100
    })
  );

  assert.deepStrictEqual(fullNamespaces, [
    acmeAliceMemories,
    acmeAlicePreferences
  ]);
  assert.deepStrictEqual(acmeUserBranches, [
    ["organizations", "org-acme", "users", "user-alice"],
    ["organizations", "org-acme", "users", "user-bob"]
  ]);

  console.log("Alice collections:");
  fullNamespaces.forEach((namespace) => {
    console.log(`- ${namespace.join(" / ")}`);
  });
  console.log("Acme user branches at maxDepth=4:");
  acmeUserBranches.forEach((namespace) => {
    console.log(`- ${namespace.join(" / ")}`);
  });

  console.log("\n5. Invalid namespace labels are rejected");
  try {
    await store.put(
      userNamespace("org-acme", "user.alice", "preferences"),
      recordKey,
      { invalid: true }
    );
    assert.fail("A namespace label containing '.' should be rejected");
  } catch (error: unknown) {
    if (!(error instanceof Error)) throw error;

    assert.equal(error.name, "InvalidNamespaceError");
    assert.match(error.message, /cannot contain periods/);
    console.log(`${error.name}: ${error.message}`);
  }

  console.log("\nSummary:");
  console.log("get(namespace, key)     -> exact Item address");
  console.log("search(namespacePrefix) -> Items below a hierarchy prefix");
  console.log("listNamespaces(options) -> namespace directory paths");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
