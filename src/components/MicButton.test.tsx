import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { MicButton } from "./MicButton";

describe("MicButton", () => {
  it("is a pressed toggle labelled 'Mic on' when on", () => {
    render(<MicButton on onToggle={() => {}} />);
    const button = screen.getByRole("button", { name: /mic on/i });
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  it("is an unpressed toggle labelled 'Mic off' when off", () => {
    render(<MicButton on={false} onToggle={() => {}} />);
    expect(screen.getByRole("button", { name: /mic off/i })).toHaveAttribute("aria-pressed", "false");
  });

  it("toggles with click and with the keyboard", async () => {
    const onToggle = vi.fn();
    render(<MicButton on onToggle={onToggle} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /mic/i }));
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onToggle).toHaveBeenCalledTimes(3);
  });

  it("has no axe violations in either state", async () => {
    const { container, rerender } = render(<MicButton on onToggle={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
    rerender(<MicButton on={false} onToggle={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
