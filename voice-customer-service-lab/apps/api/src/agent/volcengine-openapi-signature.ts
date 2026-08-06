import { createHash, createHmac } from "node:crypto";

export interface VolcengineSignatureInput {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly region: string;
  readonly service: string;
  readonly method: string;
  readonly pathname: string;
  readonly query: Readonly<Record<string, string>>;
  readonly host: string;
  readonly body: string;
  readonly date: Date;
}

export interface VolcengineSignedHeaders {
  readonly Host: string;
  readonly "X-Date": string;
  readonly "X-Content-Sha256": string;
  readonly Authorization: string;
}

export function signVolcengineRequest(input: VolcengineSignatureInput): VolcengineSignedHeaders {
  const requestDate = formatRequestDate(input.date);
  const shortDate = requestDate.slice(0, 8);
  const payloadHash = sha256(input.body);
  const signedHeaders = "host;x-content-sha256;x-date";
  const canonicalHeaders = [
    `host:${input.host}`,
    `x-content-sha256:${payloadHash}`,
    `x-date:${requestDate}`,
  ].join("\n");
  const canonicalRequest = [
    input.method.toUpperCase(),
    input.pathname,
    canonicalQuery(input.query),
    `${canonicalHeaders}\n`,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${shortDate}/${input.region}/${input.service}/request`;
  const stringToSign = ["HMAC-SHA256", requestDate, credentialScope, sha256(canonicalRequest)].join(
    "\n",
  );

  const dateKey = hmac(input.secretAccessKey, shortDate);
  const regionKey = hmac(dateKey, input.region);
  const serviceKey = hmac(regionKey, input.service);
  const signingKey = hmac(serviceKey, "request");
  const signature = hmac(signingKey, stringToSign).toString("hex");

  return {
    Host: input.host,
    "X-Date": requestDate,
    "X-Content-Sha256": payloadHash,
    Authorization:
      `HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

function canonicalQuery(query: Readonly<Record<string, string>>): string {
  return Object.entries(query)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${rfc3986(key)}=${rfc3986(value)}`)
    .join("&");
}

function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function formatRequestDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}
