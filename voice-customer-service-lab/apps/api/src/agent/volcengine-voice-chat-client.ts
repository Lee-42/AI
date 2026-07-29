import type { SecretValue } from "../core/secret-value.js";
import { AgentGatewayError } from "./agent-gateway.js";
import { signVolcengineRequest } from "./volcengine-openapi-signature.js";

const RTC_HOST = "rtc.volcengineapi.com";
const RTC_REGION = "cn-north-1";
const RTC_SERVICE = "rtc";

export interface StartVoiceChatBody {
  readonly AppId: string;
  readonly RoomId: string;
  readonly TaskId: string;
  readonly Config: Readonly<Record<string, unknown>>;
  readonly AgentConfig: {
    readonly TargetUserId: readonly [string];
    readonly UserId: string;
    readonly IdleTimeout: number;
  };
}

export interface StopVoiceChatBody {
  readonly AppId: string;
  readonly RoomId: string;
  readonly TaskId: string;
}

interface VoiceChatResponse {
  readonly ResponseMetadata?: {
    readonly RequestId?: string;
    readonly Error?: {
      readonly Code?: string;
      readonly Message?: string;
    };
  };
  readonly Result?: string;
}

export interface VolcengineVoiceChatClientOptions {
  readonly accessKeyId: SecretValue;
  readonly secretAccessKey: SecretValue;
  readonly apiVersion: "2025-06-01";
  readonly timeoutMs?: number;
  readonly fetcher?: typeof fetch;
  readonly clock?: () => Date;
}

export class VolcengineVoiceChatClient {
  readonly #accessKeyId: SecretValue;
  readonly #secretAccessKey: SecretValue;
  readonly #apiVersion: "2025-06-01";
  readonly #timeoutMs: number;
  readonly #fetcher: typeof fetch;
  readonly #clock: () => Date;

  constructor(options: VolcengineVoiceChatClientOptions) {
    this.#accessKeyId = options.accessKeyId;
    this.#secretAccessKey = options.secretAccessKey;
    this.#apiVersion = options.apiVersion;
    this.#timeoutMs = options.timeoutMs ?? 8_000;
    this.#fetcher = options.fetcher ?? fetch;
    this.#clock = options.clock ?? (() => new Date());
  }

  start(body: StartVoiceChatBody): Promise<{ providerRequestId: string | null }> {
    return this.#request("StartVoiceChat", body);
  }

  stop(body: StopVoiceChatBody): Promise<{ providerRequestId: string | null }> {
    return this.#request("StopVoiceChat", body);
  }

  async #request(
    action: "StartVoiceChat" | "StopVoiceChat",
    body: StartVoiceChatBody | StopVoiceChatBody,
  ): Promise<{ providerRequestId: string | null }> {
    const serializedBody = JSON.stringify(body);
    const queryParams = {
      Action: action,
      Version: this.#apiVersion,
    };
    const signedHeaders = signVolcengineRequest({
      accessKeyId: this.#accessKeyId.reveal(),
      secretAccessKey: this.#secretAccessKey.reveal(),
      region: RTC_REGION,
      service: RTC_SERVICE,
      method: "POST",
      pathname: "/",
      query: queryParams,
      host: RTC_HOST,
      body: serializedBody,
      date: this.#clock(),
    });
    const query = new URLSearchParams(queryParams).toString();
    let response: Response;
    try {
      response = await this.#fetcher(`https://${RTC_HOST}/?${query}`, {
        method: "POST",
        headers: {
          ...signedHeaders,
          "Content-Type": "application/json",
        },
        body: serializedBody,
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (error) {
      if (isTimeout(error)) {
        throw new AgentGatewayError(
          "AGENT_PROVIDER_TIMEOUT",
          "The AI Agent provider request timed out.",
          504,
          true,
        );
      }
      throw new AgentGatewayError(
        "AGENT_PROVIDER_UNAVAILABLE",
        "The AI Agent provider is temporarily unavailable.",
        502,
        true,
      );
    }

    const payload = await readJson(response);
    const providerRequestId = payload.ResponseMetadata?.RequestId ?? null;
    if (!response.ok || payload.ResponseMetadata?.Error || payload.Result?.toLowerCase() !== "ok") {
      throw new AgentGatewayError(
        "AGENT_PROVIDER_REJECTED",
        `The AI Agent provider rejected ${action}; request_id=${providerRequestId ?? "unknown"}.`,
        502,
        false,
      );
    }

    return { providerRequestId };
  }
}

async function readJson(response: Response): Promise<VoiceChatResponse> {
  try {
    return (await response.json()) as VoiceChatResponse;
  } catch {
    throw new AgentGatewayError(
      "AGENT_PROVIDER_UNAVAILABLE",
      "The AI Agent provider returned an unreadable response.",
      502,
      true,
    );
  }
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name);
}
