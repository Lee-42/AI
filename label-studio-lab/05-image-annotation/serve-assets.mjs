#!/usr/bin/env node

import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const host = "127.0.0.1";
const port = 8001;
const assetDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "assets");
const allowedFiles = new Set([
  "scene-001.svg",
  "scene-002.svg",
  "scene-003.svg",
]);

const contentTypes = new Map([[".svg", "image/svg+xml; charset=utf-8"]]);

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url || "/", `http://${host}:${port}`);
  const filename = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "");

  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Cache-Control", "no-store");

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    });
    response.end();
    return;
  }

  if (!allowedFiles.has(filename)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found\n");
    return;
  }

  const filePath = resolve(assetDirectory, filename);
  if (!existsSync(filePath)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Asset missing\n");
    return;
  }

  response.writeHead(200, {
    "Content-Type": contentTypes.get(extname(filename)) || "application/octet-stream",
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`图片资源服务已启动：http://${host}:${port}`);
  for (const filename of allowedFiles) {
    console.log(`- http://${host}:${port}/${filename}`);
  }
  console.log("按 Ctrl+C 停止服务。");
});
