import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createWeatherMcpServer } from "./weather-server-factory.js";

const host = process.env.MCP_WEATHER_HOST?.trim() || "127.0.0.1";
const port = Number(process.env.MCP_WEATHER_PORT ?? "3001");

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("MCP_WEATHER_PORT must be an integer between 1 and 65535.");
}

const app = createMcpExpressApp({ host });

app.get("/health", (_request, response) => {
  response.json({ status: "ok", service: "course-weather-mcp" });
});

app.post("/mcp", async (request, response) => {
  const server = createWeatherMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  response.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
  } catch (error) {
    console.error("Failed to handle MCP request:", error);

    if (!response.headersSent) {
      response.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error"
        },
        id: null
      });
    }
  }
});

app.get("/mcp", (_request, response) => {
  response.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed in stateless JSON response mode."
    },
    id: null
  });
});

app.delete("/mcp", (_request, response) => {
  response.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed in stateless mode."
    },
    id: null
  });
});

const httpServer = app.listen(port, host, () => {
  console.log(`Weather MCP Server: http://${host}:${port}/mcp`);
  console.log(`Health check: http://${host}:${port}/health`);
});

function shutdown(signal: string) {
  console.log(`\nReceived ${signal}, shutting down...`);
  httpServer.close((error) => {
    if (error) {
      console.error("Failed to close HTTP server:", error);
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
