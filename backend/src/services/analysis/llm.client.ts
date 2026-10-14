import { env } from "../../config/env";

/**
 * Error thrown for any Command Code Provider API failure. `status` is the
 * HTTP status the analysis controller should return to the client.
 */
export class LlmError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = "LlmError";
        this.status = status;
    }
}

export interface ChatMessage {
    role: "system" | "user";
    content: string;
}

interface ChatCompletionResponse {
    choices?: Array<{
        message?: {
            content?: string;
        };
    }>;
    error?: {
        message?: string;
    };
}

/**
 * Minimal OpenAI-compatible chat completion client for the Command Code
 * Provider API (https://commandcode.ai/docs/provider). Uses the global
 * fetch (Node 18+) — no additional dependency.
 */
export async function chatComplete(
    messages: ChatMessage[],
    options: {
        maxTokens?: number;
        temperature?: number;
    } = {}
): Promise<string> {

    const apiKey = env.cmdApi.key;

    if (!apiKey) {
        throw new LlmError(
            "The Command Code API key is not configured. Set CMD_API_KEY in backend/.env.",
            503
        );
    }

    const controller = new AbortController();
    const timeout = setTimeout(
        () => controller.abort(),
        env.cmdApi.timeoutMs
    );

    try {

        const response = await fetch(
            `${env.cmdApi.baseUrl}/chat/completions`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: env.cmdApi.model,
                    messages,
                    temperature: options.temperature ?? 0.2,
                    max_tokens: options.maxTokens ?? 1200
                }),
                signal: controller.signal
            }
        );

        if (!response.ok) {

            const body =
                (await response.json().catch(() => null)) as
                    | ChatCompletionResponse
                    | null;

            const detail = body?.error?.message ?? response.statusText;

            if (response.status === 401) {
                throw new LlmError(
                    `The Command Code API rejected the key (401): ${detail}`,
                    502
                );
            }

            if (response.status === 403) {
                throw new LlmError(
                    "Command Code API access is not available on this plan " +
                    "(403). The $1 Go plan has no API access — upgrade to " +
                    "GOAT, Pro, Max, or the pay-as-you-go Provider plan.",
                    502
                );
            }

            throw new LlmError(
                `Command Code API error (${response.status}): ${detail}`,
                502
            );
        }

        const data =
            (await response.json()) as ChatCompletionResponse;

        const content = data.choices?.[0]?.message?.content;

        if (typeof content !== "string" || content.trim() === "") {
            throw new LlmError(
                "The Command Code API returned an empty completion.",
                502
            );
        }

        return content;

    } catch (error) {

        if (error instanceof LlmError) {
            throw error;
        }

        if ((error as Error).name === "AbortError") {
            throw new LlmError(
                "The Command Code API request timed out.",
                504
            );
        }

        throw new LlmError(
            `Could not reach the Command Code API: ${(error as Error).message}`,
            502
        );

    } finally {

        clearTimeout(timeout);
    }
}

/**
 * Extracts a JSON object from a model completion that may wrap it in
 * markdown fences or prose.
 */
export function parseJsonCompletion<T>(completion: string): T {

    let text = completion.trim();

    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);

    if (fence) {
        text = fence[1].trim();
    }

    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");

    if (start === -1 || end === -1 || end <= start) {
        throw new LlmError(
            "The analysis model did not return a JSON object.",
            502
        );
    }

    try {
        return JSON.parse(text.slice(start, end + 1)) as T;
    } catch (error) {
        throw new LlmError(
            `Could not parse the analysis model output as JSON: ${(error as Error).message}`,
            502
        );
    }
}
