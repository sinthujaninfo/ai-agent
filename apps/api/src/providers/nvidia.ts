import type { ChatChunk, ChatRequest, ChatResponse } from "@ai-agent/shared";
import type { EmbeddingProvider, LLMProvider } from "./types.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60_000);
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) {
        await sleep(500 * 2 ** i);
        lastErr = new Error(`NIM HTTP ${res.status}`);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      await sleep(500 * 2 ** i);
    }
  }
  throw lastErr;
}

export class NvidiaNimProvider implements LLMProvider {
  id = "nvidia";

  private headers() {
    if (!env.NIM_API_KEY) throw new Error("NIM_API_KEY is not configured");
    return {
      Authorization: `Bearer ${env.NIM_API_KEY}`,
      "Content-Type": "application/json",
    };
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const body: Record<string, unknown> = {
      model: env.NIM_CHAT_MODEL,
      messages: req.messages,
      temperature: req.temperature ?? 0.2,
      max_tokens: req.maxTokens ?? 2048,
    };
    if (req.jsonMode) {
      body.response_format = { type: "json_object" };
    }
    const res = await fetchWithRetry(`${env.NIM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      logger.error({ status: res.status, text }, "NIM chat failed");
      throw new Error(`NIM chat failed: ${res.status}`);
    }
    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    return {
      content: data.choices?.[0]?.message?.content ?? "",
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens,
      },
      raw: data,
    };
  }

  async *stream(req: ChatRequest): AsyncIterable<ChatChunk> {
    if (!env.NIM_API_KEY) throw new Error("NIM_API_KEY is not configured");
    const res = await fetchWithRetry(`${env.NIM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model: env.NIM_CHAT_MODEL,
        messages: req.messages,
        temperature: req.temperature ?? 0.2,
        max_tokens: req.maxTokens ?? 2048,
        stream: true,
      }),
    });
    if (!res.ok || !res.body) {
      throw new Error(`NIM stream failed: ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") {
          yield { delta: "", done: true };
          return;
        }
        try {
          const json = JSON.parse(payload) as {
            choices: Array<{ delta?: { content?: string } }>;
          };
          const delta = json.choices?.[0]?.delta?.content ?? "";
          if (delta) yield { delta };
        } catch {
          // ignore partial JSON
        }
      }
    }
    yield { delta: "", done: true };
  }
}

export class NvidiaEmbeddingProvider implements EmbeddingProvider {
  id = "nvidia-embed";
  dimensions = 1024;

  async embed(texts: string[]): Promise<number[][]> {
    if (!env.NIM_API_KEY) {
      // deterministic local fallback for offline/dev without key
      return texts.map((t) => localHashEmbed(t, this.dimensions));
    }
    const res = await fetchWithRetry(`${env.NIM_BASE_URL}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.NIM_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.NIM_EMBED_MODEL,
        input: texts,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      logger.warn({ status: res.status, text }, "NIM embed failed; using local fallback");
      return texts.map((t) => localHashEmbed(t, this.dimensions));
    }
    const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
    return data.data.map((d) => d.embedding);
  }
}

/** Lightweight hash embedding for offline/dev and Hostinger without key. */
export function localHashEmbed(text: string, dims = 256): number[] {
  const vec = new Array<number>(dims).fill(0);
  const tokens = text.toLowerCase().split(/\W+/).filter(Boolean);
  for (const tok of tokens) {
    let h = 2166136261;
    for (let i = 0; i < tok.length; i++) {
      h ^= tok.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % dims;
    vec[idx] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export class MockLLMProvider implements LLMProvider {
  id = "mock";

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const last = req.messages[req.messages.length - 1]?.content ?? "";
    if (req.jsonMode) {
      return {
        content: JSON.stringify({
          goal: last.slice(0, 200),
          summary: "Mock plan",
          steps: [
            {
              id: "1",
              action: "Answer the user directly using available context",
              risk: "safe",
              needsApproval: false,
            },
          ],
        }),
      };
    }
    return { content: `Mock response to: ${last.slice(0, 500)}` };
  }

  async *stream(req: ChatRequest): AsyncIterable<ChatChunk> {
    const { content } = await this.chat(req);
    for (const word of content.split(" ")) {
      yield { delta: word + " " };
    }
    yield { delta: "", done: true };
  }
}

export class MockEmbeddingProvider implements EmbeddingProvider {
  id = "mock-embed";
  dimensions = 256;
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => localHashEmbed(t, this.dimensions));
  }
}
