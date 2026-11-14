import { describe, expect, it } from "vitest";
import { mapMediaError } from "./MicAudio";

describe("mapMediaError", () => {
  it.each([
    ["NotAllowedError", "denied"],
    ["SecurityError", "denied"],
    ["NotFoundError", "no_device"],
    ["OverconstrainedError", "no_device"],
    ["NotReadableError", "error"],
  ])("%s -> %s", (name, expected) => {
    expect(mapMediaError(new DOMException("x", name))).toBe(expected);
  });

  it("maps unknown values to error", () => {
    expect(mapMediaError("boom")).toBe("error");
  });
});
