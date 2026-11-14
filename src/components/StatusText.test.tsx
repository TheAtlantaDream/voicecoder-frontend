import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { StatusText } from "./StatusText";

describe("StatusText", () => {
  it("shows the status and is not a live region (the Announcer is)", () => {
    const { container } = render(<StatusText text="Agent is thinking…" />);
    expect(screen.getByText("Agent is thinking…")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(container.querySelector("[aria-live]")).toBeNull();
  });

  it("has no axe violations", async () => {
    const { container } = render(<StatusText text="Listening" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
