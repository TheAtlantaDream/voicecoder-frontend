import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { PauseCountdown } from "./PauseCountdown";

afterEach(() => vi.useRealTimers());

describe("PauseCountdown", () => {
  it("counts down to sending with a labelled progress bar", () => {
    vi.useFakeTimers({ now: 10_000 });
    render(<PauseCountdown startedAt={10_000} durationMs={1500} />);
    const bar = screen.getByRole("progressbar", { name: /sending in 1.5 s/i });
    expect(bar).toHaveAttribute("max", "1500");
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("progressbar", { name: /sending in 0.5 s/i })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByRole("progressbar", { name: /sending in 0.0 s/i })).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = render(<PauseCountdown startedAt={Date.now()} durationMs={1500} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
