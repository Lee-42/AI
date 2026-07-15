import "dotenv/config";

export type ProviderName = "openai" | "deepseek";

export type ActiveModelConfig = {
  provider: ProviderName;
  model: string;
  advancedModel: string;
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

export const config = {
  llm: {
    provider: optionalEnv("LLM_PROVIDER")
  },
  openai: {
    apiKey: optionalEnv("OPENAI_API_KEY"),
    model: optionalEnv("OPENAI_MODEL") ?? optionalEnv("LANGCHAIN_MODEL") ?? "gpt-4o-mini",
    advancedModel: optionalEnv("OPENAI_ADVANCED_MODEL") ?? optionalEnv("OPENAI_MODEL") ?? "gpt-4o"
  },
  deepseek: {
    apiKey: optionalEnv("DEEPSEEK_API_KEY"),
    baseURL: optionalEnv("DEEPSEEK_BASE_URL") ?? "https://api.deepseek.com",
    model: optionalEnv("DEEPSEEK_MODEL") ?? "deepseek-v4-flash",
    advancedModel: optionalEnv("DEEPSEEK_ADVANCED_MODEL") ?? optionalEnv("DEEPSEEK_MODEL") ?? "deepseek-v4-pro"
  },
  langsmith: {
    tracing: optionalEnv("LANGSMITH_TRACING") ?? "false",
    apiKey: optionalEnv("LANGSMITH_API_KEY")
  }
} as const;

export function getDefaultProvider(): ProviderName {
  const provider = config.llm.provider;

  if (provider === "openai" || provider === "deepseek") {
    return provider;
  }

  if (provider) {
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
      advancedModel: config.deepseek.advancedModel,
      apiKey: config.deepseek.apiKey,
      apiKeyName: "DEEPSEEK_API_KEY",
      baseURL: config.deepseek.baseURL
    };
  }

  return {
    provider,
    model: config.openai.model,
    advancedModel: config.openai.advancedModel,
    apiKey: config.openai.apiKey,
    apiKeyName: "OPENAI_API_KEY"
  };
}
