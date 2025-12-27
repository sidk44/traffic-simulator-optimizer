import { IntersectionId, SignalPhase, TrafficEvent, SignalPlan, StreamEventType, StreamPayloadMap } from "@/lib/types";

interface SSEClient {
  id: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  heartbeat: NodeJS.Timeout;
}

interface SSEConnection {
  id: string;
  stream: ReadableStream<Uint8Array>;
}

const defaultPlan: SignalPlan = {
  cycle: 60,
  minGreen: 10,
  maxGreen: 50,
  splits: {
    I1: { ns: 30, ew: 30 },
    I2: { ns: 30, ew: 30 },
    I3: { ns: 30, ew: 30 },
    I4: { ns: 30, ew: 30 },
  },
};

class SSEBroker {
  private clients = new Map<string, SSEClient>();
  private cache = new Map<StreamEventType, StreamPayloadMap[StreamEventType]>();
  private encoder = new TextEncoder();
  private heartbeatMs = 15000;

  constructor() {
    // Seed cache with default plan
    this.cache.set("plan", defaultPlan);
  }

  connect(): SSEConnection {
    const id = crypto.randomUUID();
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        const heartbeat = setInterval(() => {
          controller.enqueue(this.encoder.encode(`:heartbeat ${Date.now()}\n\n`));
        }, this.heartbeatMs);

        this.clients.set(id, { id, controller, heartbeat });
      },
      cancel: () => {
        this.disconnect(id);
      },
    });

    return { id, stream };
  }

  disconnect(id: string) {
    const client = this.clients.get(id);
    if (!client) {
      return;
    }

    clearInterval(client.heartbeat);
    this.clients.delete(id);
  }

  broadcast<T extends StreamEventType>(event: T, payload: StreamPayloadMap[T]) {
    this.cache.set(event, payload);
    const chunk = this.formatMessage(event, payload);

    this.clients.forEach((client) => {
      try {
        client.controller.enqueue(chunk);
      } catch {
        this.disconnect(client.id);
      }
    });
  }

  sendToClient<T extends StreamEventType>(
    clientId: string,
    event: T,
    payload: StreamPayloadMap[T] | Record<string, unknown>,
  ) {
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    client.controller.enqueue(this.formatMessage(event, payload));
  }

  getCached<T extends StreamEventType>(event: T) {
    return this.cache.get(event) as StreamPayloadMap[T] | undefined;
  }

  broadcastSystemEvent(
    message: string,
    intersectionId: IntersectionId = "I1",
    phase: SignalPhase = "NS"
  ) {
    const event: TrafficEvent = {
      ts: new Date().toISOString(),
      intersectionId,
      phase,
      type: "queue_update",
      queueLength: 0,
      speed: 0,
      note: message,
    };
    this.broadcast("event", event);
  }

  private formatMessage(event: StreamEventType, payload: unknown) {
    const data = JSON.stringify(payload ?? {});
    return this.encoder.encode(`event: ${event}\ndata: ${data}\n\n`);
  }
}

const globalBroker = globalThis as typeof globalThis & {
  __trafficBroker?: SSEBroker;
};

if (!globalBroker.__trafficBroker) {
  globalBroker.__trafficBroker = new SSEBroker();
}

export function getSSEBroker() {
  return globalBroker.__trafficBroker!;
}

