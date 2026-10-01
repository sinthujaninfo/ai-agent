import { env } from "../config/env.js";
import type { EmbeddingProvider, LLMProvider } from "./types.js";
import {
  MockEmbeddingProvider,
  MockLLMProvider,
  NvidiaEmbeddingProvider,
  NvidiaNimProvider,
} from "./nvidia.js";

export function createLLMProvider(): LLMProvider {
  if (env.LLM_PROVIDER === "mock") return new MockLLMProvider();
  if (env.LLM_PROVIDER === "nvidia") {
    if (!env.NIM_API_KEY) return new MockLLMProvider();
    return new NvidiaNimProvider();
  }
  return new MockLLMProvider();
}

export function createEmbeddingProvider(): EmbeddingProvider {
  if (env.LLM_PROVIDER === "mock") return new MockEmbeddingProvider();
  if (!env.NIM_API_KEY) return new MockEmbeddingProvider();
  return new NvidiaEmbeddingProvider();
}

export type { LLMProvider, EmbeddingProvider } from "./types.js";
