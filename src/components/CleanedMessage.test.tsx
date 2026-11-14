import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { CleanedMessage } from "./CleanedMessage";

describe("CleanedMessage", () => {
  it("shows what was sent to the agent as plain text", () => {
    render(<CleanedMessage text="Add a **validator** <b>now</b>." />);
    const card = screen.getByRole("region", { name: "Sent to agent" });
    expect(card).toHaveTextContent("Add a **validator** <b>now</b>.");
    expect(card.querySelector("b, strong")).toBeNull();
  });

  it("has no axe violations", async () => {
    const { container } = render(<CleanedMessage text="Add a validator." />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
