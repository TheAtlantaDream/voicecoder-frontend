import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, expect } from "vitest";
import * as axeMatchers from "vitest-axe/matchers";
import type { AxeMatchers } from "vitest-axe/matchers";

expect.extend(axeMatchers);
afterEach(() => cleanup());

// vitest-axe 0.1 still augments the old global `Vi` namespace; Vitest 5 reads `Matchers`.
declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown> extends AxeMatchers {}
}
