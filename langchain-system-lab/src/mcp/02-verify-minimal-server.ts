import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

const serverFile = fileURLToPath(new URL("./01-minimal-server.ts", import.meta.url));

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["--import", "tsx", serverFile]
});

const client = new Client({
  name: "minimal-server-verifier",
  version: "1.0.0"
});

async function main() {
  try {
    await client.connect(transport);

    const tools = await client.listTools();
    console.log("## tools/list");
    console.log(JSON.stringify(tools, null, 2));

    const result = await client.callTool({
      name: "add",
      arguments: {
        a: 7,
        b: 5
      }
    });

    console.log("\n## tools/call");
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("MCP verification failed:", error);
  process.exitCode = 1;
});
