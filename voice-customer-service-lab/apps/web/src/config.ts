const DEFAULT_LOCAL_API_BASE_URL = "http://localhost:8000";

function parseApiBaseUrl(value: string): string {
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("VITE_API_BASE_URL must use http or https");
  }
  return parsed.toString().replace(/\/$/, "");
}

export const publicConfig = Object.freeze({
  // VITE_* values are public. Session tokens must come from the API at runtime.
  apiBaseUrl: parseApiBaseUrl(import.meta.env.VITE_API_BASE_URL ?? DEFAULT_LOCAL_API_BASE_URL),
});
