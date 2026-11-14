import { createContext } from "react";
import type { State } from "../domain/session";
import type { AudioSource } from "../services/audio/AudioSource";
import type { Transport } from "../services/transport/Transport";
import type { PartialStore } from "./partialStore";

export interface Services {
  transport: Transport;
  audio: AudioSource;
}

export interface Actions {
  /** Turns the mic on/off; while audio is suspended by autoplay it resumes instead. */
  toggleMic(): void;
  /** Skips the reconnect backoff wait. */
  retryConnection(): void;
}

export const ServicesContext = createContext<Services | null>(null);
export const SessionStateContext = createContext<State | null>(null);
export const ActionsContext = createContext<Actions | null>(null);
export const PartialStoreContext = createContext<PartialStore | null>(null);
