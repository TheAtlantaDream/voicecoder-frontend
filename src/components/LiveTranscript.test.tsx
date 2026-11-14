import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { PartialStoreContext } from "../app/contexts";
import { createPartialStore } from "../app/partialStore";
import { LiveTranscript } from "./LiveTranscript";

function setup(queued = false) {
  const store = createPartialStore();
  const utils = render(
    <PartialStoreContext value={store}>
      <LiveTranscript queued={queued} />
    </PartialStoreContext>,
  );
  return { store, ...utils };
}

describe("LiveTranscript", () => {
  it("shows the partial transcript as it changes", () => {
    const { store } = setup();
    expect(screen.getByText("…")).toBeInTheDocument();
    act(() => store.set("add a"));
    expect(screen.getByText("add a")).toBeInTheDocument();
    act(() => store.set("add a function"));
    expect(screen.getByText("add a function")).toBeInTheDocument();
  });

  it("is not a live region, so fragments are not read out", () => {
    const { container } = setup();
    expect(container.querySelector("[aria-live], [role=log], [role=status], [role=alert]")).toBeNull();
  });

  it("says when the speech will be queued", () => {
    setup(true);
    expect(screen.getByText(/will be queued/i)).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container, store } = setup();
    act(() => store.set("hello"));
    expect(await axe(container)).toHaveNoViolations();
  });
});
