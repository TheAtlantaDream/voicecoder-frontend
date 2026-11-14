import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { IntroMessage } from "./IntroMessage";

describe("IntroMessage", () => {
  it("explains how to talk to the agent", () => {
    render(<IntroMessage />);
    expect(screen.getByText(/i'm listening/i)).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = render(<IntroMessage />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
