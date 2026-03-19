import type { z } from "zod";
import { Observable } from "./observable";

// --- Transport ---

export type Transport = {
  send(data: string): void;
  onMessage(handler: (data: string) => void): void;
};

// --- Wire protocol (internal) ---

type WireMessage =
  | { kind: "resource:update"; key: string; data: unknown }
  | { kind: "resource:key-set"; key: string; entryKey: string; data: unknown }
  | { kind: "resource:key-delete"; key: string; entryKey: string }
  | { kind: "request"; id: string; type: string; params: unknown }
  | { kind: "response"; id: string; result?: unknown; error?: string }
  | { kind: "event"; type: string; payload: unknown };

// --- Schema definition ---

export const defineBridgeSchema = <
  R extends Record<string, z.ZodType>,
  E extends Record<string, z.ZodType>,
  Q extends Record<string, { params: z.ZodType; result: z.ZodType }>,
>(schema: {
  resources: R;
  events: E;
  requests: Q;
}) => schema;

// --- Type helpers ---

type RecordValue<T> = T extends Record<string, infer V> ? V : never;

type ObservableHandle<T> = {
  subscribe(listener: (data: T) => void): () => void;
  getValue(): T;
  setValue(data: T): void;
};

type RecordHandle<T> = ObservableHandle<T> & {
  setKey(entryKey: string, value: RecordValue<T>): void;
  deleteKey(entryKey: string): void;
};

type ResourceHandle<T> =
  T extends Record<string, unknown> ? RecordHandle<T> : ObservableHandle<T>;

type ResourceObservables<R extends Record<string, z.ZodType>> = {
  [K in keyof R]: ResourceHandle<z.infer<R[K]>>;
};

type ResourceValues<R extends Record<string, z.ZodType>> = {
  [K in keyof R]: z.infer<R[K]>;
};

// --- Peer (duplex) ---

export type BridgePeer<
  R extends Record<string, z.ZodType>,
  E extends Record<string, z.ZodType>,
  Q extends Record<string, { params: z.ZodType; result: z.ZodType }>,
> = {
  resources: ResourceObservables<R>;
  request<K extends string & keyof Q>(
    type: K,
    params: z.infer<Q[K]["params"]>,
  ): Promise<z.infer<Q[K]["result"]>>;
  onRequest<K extends string & keyof Q>(
    type: K,
    handler: (
      params: z.infer<Q[K]["params"]>,
    ) => Promise<z.infer<Q[K]["result"]>>,
  ): void;
  emit<K extends string & keyof E>(type: K, payload: z.infer<E[K]>): void;
  on<K extends string & keyof E>(
    type: K,
    handler: (payload: z.infer<E[K]>) => void,
  ): void;
};

export const createBridgePeer = <
  R extends Record<string, z.ZodType>,
  E extends Record<string, z.ZodType>,
  Q extends Record<string, { params: z.ZodType; result: z.ZodType }>,
>(
  schema: { resources: R; events: E; requests: Q },
  transport: Transport,
  initialResources: ResourceValues<R>,
): BridgePeer<R, E, Q> => {
  const sendWire = (msg: WireMessage) => {
    transport.send(JSON.stringify(msg));
  };

  // Resources — observable per key, synced over wire
  let receivingFromWire = false;
  let keyPatching = false;
  const resources = {} as ResourceObservables<R>;
  for (const key in schema.resources) {
    const observable = new Observable(initialResources[key]);
    observable.subscribe((data) => {
      if (!receivingFromWire && !keyPatching) {
        sendWire({ kind: "resource:update", key, data });
      }
    });
    const handle: RecordHandle<unknown> = {
      subscribe: observable.subscribe,
      getValue: observable.getValue,
      setValue: observable.setValue,
      setKey(entryKey: string, value: unknown) {
        const current = observable.getValue();
        if (typeof current !== "object" || current === null) return;
        const updated = { ...current, [entryKey]: value };
        keyPatching = true;
        try {
          observable.setValue(updated);
        } finally {
          keyPatching = false;
        }
        sendWire({ kind: "resource:key-set", key, entryKey, data: value });
      },
      deleteKey(entryKey: string) {
        const current = observable.getValue();
        if (typeof current !== "object" || current === null) return;
        const { [entryKey]: _, ...rest } = current as Record<string, unknown>;
        keyPatching = true;
        try {
          observable.setValue(rest as typeof current);
        } finally {
          keyPatching = false;
        }
        sendWire({ kind: "resource:key-delete", key, entryKey });
      },
    };
    // biome-ignore lint: generic boundary cast
    (resources as any)[key] = handle;
  }

  // Requests — can both send and handle
  const requestHandlers = new Map<
    string,
    (params: unknown) => Promise<unknown>
  >();
  const pendingRequests = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (err: Error) => void }
  >();

  // Events — bidirectional
  const eventListeners = new Map<string, ((payload: unknown) => void)[]>();

  // Handle incoming messages
  transport.onMessage((raw) => {
    let msg: WireMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.kind) {
      case "resource:update": {
        const handle = (resources as Record<string, ResourceHandle<unknown>>)[
          msg.key
        ];
        if (handle) {
          receivingFromWire = true;
          try {
            handle.setValue(msg.data);
          } finally {
            receivingFromWire = false;
          }
        }
        break;
      }

      case "resource:key-set": {
        const handle = (resources as Record<string, ResourceHandle<unknown>>)[
          msg.key
        ];
        if (handle) {
          const current = handle.getValue();
          if (typeof current === "object" && current !== null) {
            receivingFromWire = true;
            try {
              handle.setValue({ ...current, [msg.entryKey]: msg.data });
            } finally {
              receivingFromWire = false;
            }
          }
        }
        break;
      }

      case "resource:key-delete": {
        const handle = (resources as Record<string, ResourceHandle<unknown>>)[
          msg.key
        ];
        if (handle) {
          const current = handle.getValue();
          if (typeof current === "object" && current !== null) {
            const { [msg.entryKey]: _, ...rest } = current as Record<
              string,
              unknown
            >;
            receivingFromWire = true;
            try {
              handle.setValue(rest);
            } finally {
              receivingFromWire = false;
            }
          }
        }
        break;
      }

      case "request": {
        const handler = requestHandlers.get(msg.type);
        if (handler) {
          handler(msg.params)
            .then((result) =>
              sendWire({ kind: "response", id: msg.id, result }),
            )
            .catch((err) =>
              sendWire({ kind: "response", id: msg.id, error: String(err) }),
            );
        } else {
          sendWire({
            kind: "response",
            id: msg.id,
            error: `No handler for: ${msg.type}`,
          });
        }
        break;
      }

      case "response": {
        const pending = pendingRequests.get(msg.id);
        if (pending) {
          pendingRequests.delete(msg.id);
          if (msg.error) {
            pending.reject(new Error(msg.error));
          } else {
            pending.resolve(msg.result);
          }
        }
        break;
      }

      case "event": {
        const listeners = eventListeners.get(msg.type);
        if (listeners) {
          for (const listener of listeners) listener(msg.payload);
        }
        break;
      }
    }
  });

  return {
    resources,

    request(type, params) {
      const id = crypto.randomUUID();
      return new Promise<unknown>((resolve, reject) => {
        pendingRequests.set(id, { resolve, reject });
        sendWire({ kind: "request", id, type, params });
      }) as never;
    },

    onRequest(type, handler) {
      requestHandlers.set(
        type,
        handler as (params: unknown) => Promise<unknown>,
      );
    },

    emit(type, payload) {
      sendWire({ kind: "event", type, payload });
    },

    on(type, handler) {
      const listeners = eventListeners.get(type) ?? [];
      listeners.push(handler as (payload: unknown) => void);
      eventListeners.set(type, listeners);
    },
  };
};
