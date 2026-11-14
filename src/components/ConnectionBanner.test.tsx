import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { ConnectionBanner } from "./ConnectionBanner";

describe("ConnectionBanner", () => {
  it("explains the problem and when it retries", () => {
    render(<ConnectionBanner retryInMs={4000} onRetry={() => {}} />);
    const banner = screen.getByRole("region", { name: "Connection problem" });
    expect(banner).toHaveTextContent(/connection lost/i);
    expect(banner).toHaveTextContent(/retrying in about 4 s/i);
  });

  it("offers a reconnect button", async () => {
    const onRetry = vi.fn();
    render(<ConnectionBanner retryInMs={null} onRetry={onRetry} />);
    await userEvent.click(screen.getByRole("button", { name: /reconnect now/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("has no axe violations", async () => {
    const { container } = render(<ConnectionBanner retryInMs={1000} onRetry={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
