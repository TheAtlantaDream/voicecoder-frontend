import { expect, test } from "@playwright/test";

test("fake flow: speech -> cleaned request -> streamed reply -> listening", async ({ page }) => {
  await page.goto("/voicecoder.html");
  const status = page.locator(".status-text");
  await expect(page.getByRole("button", { name: /mic on/i })).toHaveAttribute("aria-pressed", "true");
  await expect(status).toContainText("Listening");

  await expect(status).toContainText("Hearing you", { timeout: 5_000 });
  await expect(page.getByRole("progressbar", { name: /sending in/i })).toBeVisible({ timeout: 10_000 });

  const log = page.getByRole("log");
  await expect(log.getByRole("region", { name: "Sent to agent" })).toContainText("email address is valid", {
    timeout: 10_000,
  });
  const reply = log.getByRole("region", { name: "Agent reply" });
  await expect(reply).toHaveAttribute("aria-busy", "true", { timeout: 10_000 });
  await expect(reply).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  await expect(reply).toContainText("isValidEmail");
  await expect(page.getByRole("status")).toHaveText("Agent finished");
  await expect(status).toContainText("Listening");
});

test("keyboard only: every control is reachable and the mic toggles", async ({ page }) => {
  await page.goto("/voicecoder.html");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: /mic on/i })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /mic off/i })).toHaveAttribute("aria-pressed", "false");

  await page.keyboard.press("Tab");
  await expect(page.getByRole("region", { name: "Activity stream" })).toBeFocused();
  await page.keyboard.press("Tab");
  const focusPanel = page.getByRole("button", { name: /focus voice panel/i });
  await expect(focusPanel).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Activity stream" })).toBeFocused();
});

test("narrow / 200% zoom: panes wrap with no horizontal scroll", async ({ page }) => {
  // 1280px wide at 200% zoom behaves like a 640 CSS-px viewport.
  await page.setViewportSize({ width: 640, height: 720 });
  await page.goto("/voicecoder.html");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const panel = await page.getByRole("region", { name: "Activity stream" }).boundingBox();
  const editor = await page.getByRole("region", { name: "Code editor" }).boundingBox();
  expect(editor!.y).toBeGreaterThan(panel!.y);
});

test("forced colors and reduced motion render without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.goto("/voicecoder.html");
  await expect(page.getByRole("button", { name: /mic on/i })).toBeVisible();
  expect(errors).toEqual([]);
});
