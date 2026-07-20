import "dotenv/config";

export type ProviderName = "openai" | "deepseek";

export type ActiveModelConfig = {
  provider: ProviderName;
  model: string;
  apiKey: string | undefined;
  apiKeyName: "OPENAI_API_KEY" | "DEEPSEEK_API_KEY";
  baseURL?: string;
};

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();

  if (!value || value.startsWith("your_")) {
    return undefined;
  }

  return value;
}

const config = {
  provider: optionalEnv("LLM_PROVIDER"),
  openai: {
    apiKey: optionalEnv("OPENAI_API_KEY"),
    model: optionalEnv("OPENAI_MODEL") ?? "gpt-4o-mini"
  },
  deepseek: {
    apiKey: optionalEnv("DEEPSEEK_API_KEY"),
    model: optionalEnv("DEEPSEEK_MODEL") ?? "deepseek-v4-flash",
    baseURL: optionalEnv("DEEPSEEK_BASE_URL") ?? "https://api.deepseek.com"
  }
} as const;

function getDefaultProvider(): ProviderName {
  if (config.provider === "openai" || config.provider === "deepseek") {
    return config.provider;
  }

  if (config.provider) {
    throw new Error("Invalid LLM_PROVIDER. Expected 'openai' or 'deepseek'.");
  }

  if (config.openai.apiKey) {
    return "openai";
  }

  if (config.deepseek.apiKey) {
    return "deepseek";
  }

  return "openai";
}

export function getActiveModelConfig(): ActiveModelConfig {
  const provider = getDefaultProvider();

  if (provider === "deepseek") {
    return {
      provider,
      model: config.deepseek.model,
      apiKey: config.deepseek.apiKey,
      apiKeyName: "DEEPSEEK_API_KEY",
      baseURL: config.deepseek.baseURL
    };
  }

  return {
    provider,
    model: config.openai.model,
    apiKey: config.openai.apiKey,
    apiKeyName: "OPENAI_API_KEY"
  };
}
