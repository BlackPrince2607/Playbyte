import { GameEvent } from "./events";

export type EventSink = (event: GameEvent) => void;

export type EventBus = {
  emit(event: GameEvent): void;
  addSink(sink: EventSink): () => void;
};

/** Fan-out to sinks; a failing sink never breaks gameplay or other sinks. */
export function createEventBus(onSinkError?: (e: unknown) => void): EventBus {
  const sinks = new Set<EventSink>();
  return {
    emit(event) {
      for (const sink of sinks) {
        try {
          sink(event);
        } catch (e) {
          onSinkError?.(e);
        }
      }
    },
    addSink(sink) {
      sinks.add(sink);
      return () => sinks.delete(sink);
    },
  };
}

/** Collects events in memory; used by tests and debugging tools. */
export function memorySink(): EventSink & { events: GameEvent[] } {
  const events: GameEvent[] = [];
  const sink = ((e: GameEvent) => {
    events.push(e);
  }) as EventSink & { events: GameEvent[] };
  sink.events = events;
  return sink;
}
