import type { ChatRequest, ChatResponse, ChatChunk } from "@ai-agent/shared";

export interface LLMProvider {
  id: string;
  chat(req: ChatRequest): Promise<ChatResponse>;
  stream(req: ChatRequest): AsyncIterable<ChatChunk>;
}

export interface EmbeddingProvider {
  id: string;
  embed(texts: string[]): Promise<number[][]>;
  dimensions?: number;
}
