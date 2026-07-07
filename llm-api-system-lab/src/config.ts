import "dotenv/config";

export type ProviderName = "openai" | "deepseek";

// Empty strings should behave like missing env vars.
function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();

  if (!value || value.startsWith("your_")) {
    return undefined;
  }

  return value;
}

// Use this for secrets that must exist before calling a provider.
export function requireEnv(name: string): string {
  const value = optionalEnv(name);

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

// Keep provider defaults in one place so examples stay focused on API usage.
export const config = {
  llm: {
    provider: optionalEnv("LLM_PROVIDER")
  },
  openai: {
    apiKey: optionalEnv("OPENAI_API_KEY"),
    model: optionalEnv("OPENAI_MODEL") ?? "gpt-4.1-mini",
    visionModel: optionalEnv("OPENAI_VISION_MODEL") ?? optionalEnv("OPENAI_MODEL") ?? "gpt-4.1-mini"
  },
  deepseek: {
    apiKey: optionalEnv("DEEPSEEK_API_KEY"),
    baseURL: optionalEnv("DEEPSEEK_BASE_URL") ?? "https://api.deepseek.com",
    model: optionalEnv("DEEPSEEK_MODEL") ?? "deepseek-chat",
    visionModel: optionalEnv("DEEPSEEK_VISION_MODEL") ?? optionalEnv("DEEPSEEK_MODEL") ?? "deepseek-chat"
  },
  examples: {
    imageUrl: optionalEnv("IMAGE_URL")
  }
} as const;

// Prefer explicit LLM_PROVIDER, otherwise pick the provider with a configured key.
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
