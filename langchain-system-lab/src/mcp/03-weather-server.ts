import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createWeatherMcpServer } from "./weather-server-factory.js";

async function main() {
  const server = createWeatherMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Weather MCP server failed:", error);
  process.exitCode = 1;
});
