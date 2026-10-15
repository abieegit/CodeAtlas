import { env } from "../../config/env";

/**
 * Error thrown for any analysis-LLM API failure. `status` is the
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
 * Minimal OpenAI-compatible chat completion client for the analysis LLM
 * API (currently Groq, https://console.groq.com). Uses the global fetch
 * (Node 18+) — no additional dependency.
 */
export async function chatComplete(
    messages: ChatMessage[],
    options: {
        maxTokens?: number;
        temperature?: number;
    } = {}
): Promise<string> {

    const apiKey = env.llm.key;

    if (!apiKey) {
        throw new LlmError(
            "The LLM API key is not configured. Set LLM_API_KEY in backend/.env.",
            503
        );
    }

    const controller = new AbortController();
    const timeout = setTimeout(
        () => controller.abort(),
        env.llm.timeoutMs
    );

    try {

        const response = await fetch(
            `${env.llm.baseUrl}/chat/completions`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: env.llm.model,
                    messages,
                    temperature: options.temperature ?? 0.2,
                    max_tokens: options.maxTokens ?? 1200,
                    /*
                     * Reasoning-capable models (e.g. gpt-oss) otherwise
                     * spend the token budget on hidden reasoning and can
                     * return an empty `content` for bounded calls.
                     */
                    reasoning_effort: "low"
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
                    `The LLM API rejected the key (401): ${detail}`,
                    502
                );
            }

            if (response.status === 403) {
                throw new LlmError(
                    `The LLM API denied access for this key or plan (403): ${detail}`,
                    502
                );
            }

            if (response.status === 429) {
                throw new LlmError(
                    "The LLM API rate limit was reached (429). Wait a moment " +
                    "and try again.",
                    503
                );
            }

            throw new LlmError(
                `LLM API error (${response.status}): ${detail}`,
                502
            );
        }

        const data =
            (await response.json()) as ChatCompletionResponse;

        const content = data.choices?.[0]?.message?.content;

        if (typeof content !== "string" || content.trim() === "") {
            throw new LlmError(
                "The LLM API returned an empty completion.",
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
                "The LLM API request timed out.",
                504
            );
        }

        throw new LlmError(
            `Could not reach the LLM API: ${(error as Error).message}`,
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
