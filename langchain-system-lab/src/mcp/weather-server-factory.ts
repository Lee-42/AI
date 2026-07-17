import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

type Weather = {
  city: string;
  condition: string;
  temperatureC: number;
  humidityPercent: number;
  wind: string;
  outdoorAdvice: string;
  dataSource: string;
};

const weatherByCity = new Map<string, Weather>([
  [
    "上海",
    {
      city: "上海",
      condition: "多云",
      temperatureC: 24,
      humidityPercent: 68,
      wind: "东南风 2 级",
      outdoorAdvice: "适合散步，建议随身带伞。",
      dataSource: "课程内置演示数据，非实时天气"
    }
  ],
  [
    "北京",
    {
      city: "北京",
      condition: "晴",
      temperatureC: 29,
      humidityPercent: 35,
      wind: "西北风 3 级",
      outdoorAdvice: "适合短时间户外活动，注意防晒补水。",
      dataSource: "课程内置演示数据，非实时天气"
    }
  ],
  [
    "深圳",
    {
      city: "深圳",
      condition: "阵雨",
      temperatureC: 31,
      humidityPercent: 82,
      wind: "南风 2 级",
      outdoorAdvice: "不建议长时间散步，外出请带伞。",
      dataSource: "课程内置演示数据，非实时天气"
    }
  ]
]);

const aliases = new Map<string, string>([
  ["shanghai", "上海"],
  ["beijing", "北京"],
  ["shenzhen", "深圳"]
]);

function normalizeCity(city: string): string {
  const normalized = city.trim().replace(/市$/u, "").toLowerCase();
  return aliases.get(normalized) ?? normalized;
}

export function createWeatherMcpServer(): McpServer {
  const server = new McpServer({
    name: "course-weather-server",
    version: "1.0.0"
  });

  server.registerTool(
    "get_weather",
    {
      description: "查询城市天气。当前提供上海、北京和深圳的课程演示数据，不代表实时天气。",
      inputSchema: {
        city: z.string().min(1).describe("要查询的城市，例如：上海")
      }
    },
    async ({ city }) => {
      const weather = weatherByCity.get(normalizeCity(city));

      if (!weather) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `暂时没有“${city}”的演示天气数据，可查询：上海、北京、深圳。`
            }
          ]
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(weather, null, 2)
          }
        ]
      };
    }
  );

  return server;
}
