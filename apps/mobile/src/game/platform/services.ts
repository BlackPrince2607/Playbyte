/**
 * App-side wiring of the pure SDK services to React Native storage, network and file system.
 * Nothing here runs at import time beyond creating lightweight objects.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { submitPlay, type SubmitPlayResponse } from "./submit";
import { createEventBus } from "../analytics/bus";
import { createLevelStore, createSessionStore } from "../session/store";
import { createSubmitQueue } from "../session/submitQueue";
import { randomSeed } from "../core/rng";

export const gameBus = createEventBus((e) => {
  if (__DEV__) console.warn("[game] analytics sink failed", e);
});

export const sessionStore = createSessionStore(AsyncStorage);
export const levelStore = createLevelStore(AsyncStorage);
export const submitQueue = createSubmitQueue<SubmitPlayResponse>(AsyncStorage, submitPlay);

export function newSessionId(): string {
  return randomSeed();
}
