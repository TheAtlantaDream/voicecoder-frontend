import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { EDITOR_SRC, EditorFrame } from "./EditorFrame";

afterEach(() => vi.useRealTimers());

describe("EditorFrame", () => {
  it("embeds VS Code Web with a title and shows loading until load", () => {
    const { container } = render(<EditorFrame fake={false} onFocusPanel={() => {}} />);
    const frame = screen.getByTitle("Code editor");
    expect(frame.tagName).toBe("IFRAME");
    expect(frame).toHaveAttribute("src", EDITOR_SRC);
    expect(screen.getByText("Loading editor…")).toBeInTheDocument();
    fireEvent.load(frame);
    expect(screen.queryByText("Loading editor…")).not.toBeInTheDocument();
    expect(container.querySelector("a")).toBeNull();
  });

  it("offers a new-tab link if it has not loaded after the timeout", () => {
    vi.useFakeTimers();
    render(<EditorFrame fake={false} onFocusPanel={() => {}} timeoutMs={8000} />);
    act(() => vi.advanceTimersByTime(7999));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    const link = screen.getByRole("link", { name: /open the editor in a new tab/i });
    expect(link).toHaveAttribute("href", EDITOR_SRC);
    expect(screen.queryByText("Loading editor…")).not.toBeInTheDocument();
  });

  it("renders a placeholder in fake mode", () => {
    render(<EditorFrame fake onFocusPanel={() => {}} />);
    expect(screen.getByText("VS Code Web")).toBeInTheDocument();
    expect(screen.queryByTitle("Code editor")).not.toBeInTheDocument();
  });

  it("has a visible 'Focus voice panel' control", async () => {
    const onFocusPanel = vi.fn();
    render(<EditorFrame fake onFocusPanel={onFocusPanel} />);
    await userEvent.click(screen.getByRole("button", { name: /focus voice panel/i }));
    expect(onFocusPanel).toHaveBeenCalledOnce();
  });

  it("has no axe violations", async () => {
    const { container, unmount } = render(<EditorFrame fake={false} onFocusPanel={() => {}} />);
    // jsdom cannot host the cross-frame axe run, so check the page around the iframe only.
    expect(await axe(container, { iframes: false })).toHaveNoViolations();
    unmount();
    const fake = render(<EditorFrame fake onFocusPanel={() => {}} />);
    expect(await axe(fake.container)).toHaveNoViolations();
  });
});
