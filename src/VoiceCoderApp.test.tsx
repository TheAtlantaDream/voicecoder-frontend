import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import VoiceCoderApp from "./VoiceCoderApp";
import { ServicesProvider } from "./app/ServicesContext";
import { SessionProvider } from "./app/SessionProvider";
import { FakeAudio } from "./services/audio/FakeAudio";
import type { MicResult } from "./services/audio/AudioSource";
import { FakeTransport } from "./services/transport/FakeTransport";
import { emailValidatorScript, type ScriptStep } from "./services/transport/scripts";

function setup(script: ScriptStep[] = emailValidatorScript, mic: MicResult = "granted") {
  const audio = new FakeAudio(mic);
  const transport = new FakeTransport(script, audio);
  const utils = render(
    <ServicesProvider services={{ audio, transport }}>
      <SessionProvider>
        <VoiceCoderApp fake workspace="demo" />
      </SessionProvider>
    </ServicesProvider>,
  );
  return { audio, transport, ...utils };
}

const advance = (ms: number) => act(async () => vi.advanceTimersByTimeAsync(ms));
const status = () => screen.getByText((_, el) => el?.classList.contains("status-text") ?? false);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("VoiceCoderApp (fake services)", () => {
  it("runs the whole flow: listening -> transcript -> countdown -> cleaned -> streaming -> listening", async () => {
    const { transport } = setup();
    await advance(400);
    expect(status()).toHaveTextContent("Listening");
    expect(screen.getByRole("button", { name: /mic on/i })).toHaveAttribute("aria-pressed", "true");
    expect(transport.sent).toContainEqual({ type: "mic.start" });

    // speech + live partial transcript (outside the log)
    await advance(1500 + 180 * 5);
    expect(status()).toHaveTextContent("Hearing you");
    expect(screen.getByText(/^um so can you add/)).toBeInTheDocument();
    expect(screen.getByRole("log")).not.toHaveTextContent("um so can you");

    // silence -> countdown
    await advance(180 * 20 + 200);
    expect(status()).toHaveTextContent(/sending soon/i);
    expect(screen.getByRole("progressbar", { name: /sending in/i })).toBeInTheDocument();

    // countdown ends -> utterance.end -> cleaned
    await advance(1500);
    expect(transport.sent).toContainEqual({ type: "utterance.end" });
    await advance(700);
    const log = screen.getByRole("log");
    expect(within(log).getByRole("region", { name: "Sent to agent" })).toHaveTextContent(
      /checks whether an email address is valid/,
    );
    expect(status()).toHaveTextContent(/thinking/i);

    // agent streams text
    await advance(400 + 1600 + 60 * 5);
    const reply = within(log).getByRole("region", { name: "Agent reply" });
    expect(reply).toHaveAttribute("aria-busy", "true");
    expect(status()).toHaveTextContent(/responding/i);

    // done
    await advance(60 * 200 + 300);
    expect(reply).toHaveAttribute("aria-busy", "false");
    expect(reply).toHaveTextContent(/isValidEmail/);
    expect(screen.getByRole("status")).toHaveTextContent("Agent finished");
    expect(status()).toHaveTextContent("Listening");
  });

  it("turning the mic off pauses and tells the bridge", async () => {
    const { transport } = setup([]);
    await advance(400);
    await act(async () => screen.getByRole("button", { name: /mic on/i }).click());
    expect(screen.getByRole("button", { name: /mic off/i })).toHaveAttribute("aria-pressed", "false");
    expect(status()).toHaveTextContent(/mic off/i);
    expect(screen.getByRole("status")).toHaveTextContent("Microphone off");
    expect(transport.sent.at(-1)).toEqual({ type: "mic.stop" });
  });

  it("shows an explicit message when the page is not a secure context", async () => {
    setup([], "insecure_context");
    await advance(400);
    expect(status()).toHaveTextContent(/needs https/i);
  });

  it("has no axe violations", async () => {
    vi.useRealTimers();
    const { container } = setup([]);
    expect(await axe(container)).toHaveNoViolations();
  });
});
