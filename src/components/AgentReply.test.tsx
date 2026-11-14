import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import type { AgentRun } from "../domain/session";
import { AgentReply } from "./AgentReply";

const base: AgentRun = {
  runId: "r1",
  requestId: "u1",
  cleaned: "Add a validator.",
  text: "",
  status: "thinking",
  startedAt: 0,
};

describe("AgentReply", () => {
  it("is busy while thinking and responding, with a text status", () => {
    const { rerender } = render(<AgentReply run={base} />);
    const card = screen.getByRole("region", { name: "Agent reply" });
    expect(card).toHaveAttribute("aria-busy", "true");
    expect(card).toHaveTextContent("Thinking…");
    rerender(<AgentReply run={{ ...base, status: "responding", text: "Working" }} />);
    expect(card).toHaveAttribute("aria-busy", "true");
    expect(card).toHaveTextContent("Responding…");
  });

  it("is not busy when done or failed", () => {
    const { rerender } = render(<AgentReply run={{ ...base, status: "done", text: "Ok", endedAt: 1 }} />);
    const card = screen.getByRole("region", { name: "Agent reply" });
    expect(card).toHaveAttribute("aria-busy", "false");
    expect(card).toHaveTextContent("Done");
    rerender(<AgentReply run={{ ...base, status: "failed", endedAt: 1 }} />);
    expect(card).toHaveTextContent("Failed");
  });

  it("renders Markdown but never raw HTML or images", () => {
    const text = 'Added **isValidEmail** in `validation.ts`.\n\n<script>alert(1)</script><b>raw</b>\n\n![x](http://evil/x.png)';
    const { container } = render(<AgentReply run={{ ...base, status: "done", text }} />);
    expect(container.querySelector("strong")).toHaveTextContent("isValidEmail");
    expect(container.querySelector("code")).toHaveTextContent("validation.ts");
    expect(container.querySelector("script, b, img")).toBeNull();
  });

  it("opens links in a new tab and says so", () => {
    render(<AgentReply run={{ ...base, status: "done", text: "See [docs](https://example.com)." }} />);
    const link = screen.getByRole("link", { name: /docs\s*\(opens in a new tab\)/i });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <AgentReply run={{ ...base, status: "done", text: "Hello\n\n- one\n- two\n\n```ts\nconst a = 1;\n```" }} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
