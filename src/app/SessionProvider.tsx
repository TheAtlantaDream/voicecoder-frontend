import { useCallback, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { END_OF_SPEECH_MS } from "../domain/config";
import { initialState, reducer, speechPhase } from "../domain/session";
import { ActionsContext, PartialStoreContext, SessionStateContext, type Actions } from "./contexts";
import { useServices } from "./hooks";
import { createPartialStore } from "./partialStore";

/** Elements that handle the autoplay resume themselves (the mic toggle). */
const OWN_GESTURE_SELECTOR = "[data-mic-toggle]";

/**
 * Connects services <-> reducer. The only place that talks to the transport
 * and the microphone. Every effect cleans up fully (StrictMode runs them twice).
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const { transport, audio } = useServices();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [partials] = useState(createPartialStore);

  const micWanted = state.stage !== "paused";
  const micLive = micWanted && state.mic === "granted";
  const open = state.connection.status === "open";
  const phase = speechPhase(state);
  const pauseStartedAt = phase?.phase === "pausing" ? phase.pauseStartedAt : null;

  // Transport: connect once, route messages.
  useEffect(() => {
    const offStatus = transport.onStatus((s) => {
      if (s.status === "closed") partials.set("");
      dispatch({ type: "connection", status: s.status, retryInMs: s.retryInMs, at: Date.now() });
    });
    const offMessage = transport.onMessage((msg) => {
      if (msg.type === "transcript.partial") {
        partials.set(msg.text);
        return;
      }
      if (msg.type === "transcript.final") partials.set("");
      dispatch({ type: "server", msg, at: Date.now() });
    });
    transport.connect();
    return () => {
      offStatus();
      offMessage();
      transport.close();
    };
  }, [transport, partials]);

  // Microphone: running whenever the user wants it on.
  useEffect(() => {
    if (!micWanted) return;
    let cancelled = false;
    // sendAudio drops frames while the socket is not open, so nothing is replayed later.
    const offFrame = audio.onFrame((buf) => transport.sendAudio(buf));
    const offVoice = audio.onVoice((event) =>
      dispatch({ type: event === "start" ? "speech.start" : "speech.stop", at: Date.now() }),
    );
    void audio.start().then((status) => {
      if (!cancelled) dispatch({ type: "mic.status", status });
    });
    return () => {
      cancelled = true;
      offFrame();
      offVoice();
      audio.stop();
    };
  }, [micWanted, audio, transport]);

  // Tell the bridge when audio is (not) flowing; re-sent after every reconnect.
  useEffect(() => {
    if (!open || !micLive) return;
    transport.send({ type: "mic.start" });
    return () => transport.send({ type: "mic.stop" });
  }, [open, micLive, transport]);

  // The reducer bumps utteranceSeq whenever an utterance must be sent.
  useEffect(() => {
    if (state.utteranceSeq > 0) transport.send({ type: "utterance.end" });
  }, [state.utteranceSeq, transport]);

  // End-of-speech countdown.
  useEffect(() => {
    if (pauseStartedAt === null) return;
    const timer = setTimeout(
      () => {
        const text = partials.get();
        partials.set("");
        dispatch({ type: "countdown.ended", at: Date.now(), startedAt: pauseStartedAt, text });
      },
      Math.max(0, pauseStartedAt + END_OF_SPEECH_MS - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [pauseStartedAt, partials]);

  // Autoplay policy: resume audio on the first key press or pointer press anywhere.
  useEffect(() => {
    if (state.mic !== "suspended") return;
    const onGesture = (e: Event) => {
      if (e.target instanceof Element && e.target.closest(OWN_GESTURE_SELECTOR)) return;
      void audio.resume().then((ok) => {
        if (ok) dispatch({ type: "mic.status", status: "granted" });
      });
    };
    document.addEventListener("keydown", onGesture, true);
    document.addEventListener("pointerdown", onGesture, true);
    return () => {
      document.removeEventListener("keydown", onGesture, true);
      document.removeEventListener("pointerdown", onGesture, true);
    };
  }, [state.mic, audio]);

  const toggleMic = useCallback(() => {
    if (state.mic === "suspended") {
      void audio.resume().then((ok) => {
        if (ok) dispatch({ type: "mic.status", status: "granted" });
      });
      return;
    }
    const on = state.stage === "paused";
    if (!on) partials.set("");
    dispatch({ type: "mic.toggled", on });
  }, [state.mic, state.stage, audio, partials]);

  const actions = useMemo<Actions>(
    () => ({ toggleMic, retryConnection: () => transport.retryNow() }),
    [toggleMic, transport],
  );

  return (
    <SessionStateContext value={state}>
      <ActionsContext value={actions}>
        <PartialStoreContext value={partials}>{children}</PartialStoreContext>
      </ActionsContext>
    </SessionStateContext>
  );
}
