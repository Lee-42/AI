import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "minimal-calculator-server",
  version: "1.0.0"
});

server.registerTool(
  "add",
  {
    description: "计算两个数字之和。",
    inputSchema: {
      a: z.number().describe("第一个数字"),
      b: z.number().describe("第二个数字")
    }
  },
  async ({ a, b }) => ({
    content: [
      {
        type: "text",
        text: String(a + b)
      }
    ]
  })
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("MCP server failed:", error);
  process.exitCode = 1;
});
