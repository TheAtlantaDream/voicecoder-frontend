import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { ActivityPanel } from "./ActivityPanel";
import { IntroMessage } from "./IntroMessage";

describe("ActivityPanel", () => {
  it("always mounts the log, inside a keyboard-scrollable region", () => {
    render(
      <ActivityPanel contentVersion={0}>
        <IntroMessage />
      </ActivityPanel>,
    );
    const region = screen.getByRole("region", { name: "Activity stream" });
    expect(region).toHaveAttribute("tabindex", "0");
    const log = screen.getByRole("log", { name: /requests and agent replies/i });
    expect(log).toHaveTextContent(/i'm listening/i);
  });

  it("keeps live UI outside the log", () => {
    render(
      <ActivityPanel contentVersion={0} live={<p>partial words</p>}>
        <p>entry</p>
      </ActivityPanel>,
    );
    expect(screen.getByRole("log")).not.toHaveTextContent("partial words");
    expect(screen.getByText("partial words")).toBeInTheDocument();
  });

  it("does not show 'New activity' while already at the bottom", () => {
    const { rerender } = render(<ActivityPanel contentVersion={0}>a</ActivityPanel>);
    rerender(<ActivityPanel contentVersion={1}>b</ActivityPanel>);
    expect(screen.queryByRole("button", { name: /new activity/i })).not.toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <ActivityPanel contentVersion={0} live={<p>live</p>}>
        <IntroMessage />
      </ActivityPanel>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
