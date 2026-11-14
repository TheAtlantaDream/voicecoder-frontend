import { use, useSyncExternalStore } from "react";
import type { AgentRun, State } from "../domain/session";
import {
  ActionsContext,
  PartialStoreContext,
  ServicesContext,
  SessionStateContext,
  type Actions,
  type Services,
} from "./contexts";

function required<T>(value: T | null, name: string): T {
  if (value === null) throw new Error(`${name} is missing: wrap the app in its provider`);
  return value;
}

/** Internal: only SessionProvider may use services. */
export function useServices(): Services {
  return required(use(ServicesContext), "ServicesProvider");
}

export function useSession(): State {
  return required(use(SessionStateContext), "SessionProvider");
}

export function useActions(): Actions {
  return required(use(ActionsContext), "SessionProvider");
}

export function useAgentRuns(): AgentRun[] {
  return useSession().runs;
}

/** The live partial transcript. Re-renders only the subscriber, not the whole log. */
export function usePartialTranscript(): string {
  const store = required(use(PartialStoreContext), "SessionProvider");
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
