import { EventEmitter } from "node:events";
import type { SseEvent } from "@ai-agent/shared";

class RunEventBus {
  private emitters = new Map<string, EventEmitter>();

  private get(runId: string): EventEmitter {
    let ee = this.emitters.get(runId);
    if (!ee) {
      ee = new EventEmitter();
      ee.setMaxListeners(50);
      this.emitters.set(runId, ee);
    }
    return ee;
  }

  emit(runId: string, event: SseEvent): void {
    this.get(runId).emit("event", event);
  }

  subscribe(runId: string, handler: (event: SseEvent) => void): () => void {
    const ee = this.get(runId);
    ee.on("event", handler);
    return () => {
      ee.off("event", handler);
      if (ee.listenerCount("event") === 0) this.emitters.delete(runId);
    };
  }
}

export const runEvents = new RunEventBus();
