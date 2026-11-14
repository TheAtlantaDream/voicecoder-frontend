import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { QueuedRequest } from "./QueuedRequest";

describe("QueuedRequest", () => {
  it("shows the queued request", () => {
    render(<QueuedRequest text="also add tests" />);
    const card = screen.getByRole("region", { name: "Queued request" });
    expect(card).toHaveTextContent("Queued: also add tests");
    expect(card).toHaveTextContent(/sends when the agent finishes/i);
  });

  it("has no axe violations", async () => {
    const { container } = render(<QueuedRequest text="also add tests" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
