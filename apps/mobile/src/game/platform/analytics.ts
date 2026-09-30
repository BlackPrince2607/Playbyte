import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import { api, isApiError } from "../../api";
import { createBatchSink } from "../analytics/batchSink";
import type { GameEvent } from "../analytics/events";
import { gameBus } from "./services";

async function sendEvents(events: GameEvent[]) {
  try {
    await api("/v1/events", { method: "POST", body: JSON.stringify({ events }) });
  } catch (e) {
    if (isApiError(e) && (e.status === 400 || e.status === 413 || e.status === 422)) {
      throw Object.assign(e, { permanent: true });
    }
    throw e;
  }
}

let started = false;

/** Ships game analytics to the backend in batches; queued events survive restarts. Idempotent. */
export function startGameAnalytics() {
  if (started) return;
  started = true;
  const batch = createBatchSink({ storage: AsyncStorage, send: sendEvents });
  gameBus.addSink(batch.sink);
  AppState.addEventListener("change", (s) => {
    if (s === "active") return;
    void batch.persist();
    void batch.flush();
  });
  void batch.flush();
}
