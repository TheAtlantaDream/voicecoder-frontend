import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { AppShell } from "./AppShell";

const parts = {
  header: <header>header</header>,
  panel: <section aria-label="panel">panel</section>,
  editor: <section aria-label="editor">editor</section>,
};

describe("AppShell", () => {
  it("mounts the status announcer even with nothing to announce", () => {
    render(<AppShell {...parts} announcement={null} />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("keeps the same status element and replaces its content per announcement", () => {
    const { rerender } = render(<AppShell {...parts} announcement={{ id: 1, text: "Agent finished" }} />);
    const status = screen.getByRole("status");
    const first = status.firstElementChild;
    expect(status).toHaveTextContent("Agent finished");
    rerender(<AppShell {...parts} announcement={{ id: 2, text: "Agent finished" }} />);
    expect(screen.getByRole("status")).toBe(status);
    expect(status.firstElementChild).not.toBe(first);
  });

  it("has no axe violations", async () => {
    const { container } = render(<AppShell {...parts} announcement={{ id: 1, text: "Listening" }} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
