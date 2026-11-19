import { expect, test } from "@playwright/test";

const SCENE_TIMEOUT = 60_000;

test.use({ launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] } });
test.describe.configure({ timeout: 150_000 });

test("the 3d table plays a card through the hidden hand and switches back to 2d", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  await page.goto("/play?view=3d&seats=2");
  const howTo = page.getByRole("dialog", { name: "How to play" });
  await expect(howTo).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(howTo).toBeHidden();

  const chip = page.getByRole("button", { name: "3D table" });
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  const canvas = page.locator(".kc-table canvas");
  await expect(canvas).toBeVisible({ timeout: SCENE_TIMEOUT });

  const status = page.locator(".kc-status");
  await expect(status).toHaveText(/Your turn|Play the drawn card or pass/, { timeout: 20_000 });
  const before = await status.innerText();

  const hand = page.getByRole("group", { name: /Your hand/ });
  const playable = hand.getByRole("button", { name: /, playable$/ });
  if ((await playable.count()) > 0) {
    await playable.first().focus();
    await page.keyboard.press("Enter");
    const picker = page.getByRole("dialog", { name: "Pick a colour" });
    const peek = page.getByRole("dialog", { name: "Spyglass" });
    if (await picker.isVisible().catch(() => false)) await picker.getByRole("button").first().click();
    else if (await peek.isVisible().catch(() => false)) await peek.getByRole("button", { name: /^Peek at/ }).first().click();
  } else {
    await page.keyboard.press("d");
  }
  await expect(status).not.toHaveText(before, { timeout: 20_000 });
  await expect(page.locator(".kc-feed").getByText(/^You (played|drew)/).first()).toBeAttached({ timeout: 20_000 });

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);

  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "false");
  await expect(canvas).toHaveCount(0);
  await expect(page.locator("button.kc-deck")).toBeVisible();
  await expect(hand.getByRole("button").first()).toBeVisible();
});

test("the 3d table falls back to 2d when the browser gives no graphics context", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("kc-howto-seen", "1");
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
      return kind.includes("webgl") ? null : Reflect.apply(original, this, [kind, ...rest]);
    } as typeof original;
  });
  await page.goto("/play?view=3d&seats=2");
  const chip = page.getByRole("button", { name: "3D table" });
  await expect(chip).toHaveAttribute("aria-pressed", "false", { timeout: SCENE_TIMEOUT });
  await expect(page.getByText("The 3D table could not start in this browser, showing the 2D table")).toBeVisible();
  await expect(page.locator(".kc-table canvas")).toHaveCount(0);
  await expect(page.locator("button.kc-deck")).toBeVisible();
  await expect(page.locator(".kc-status")).toHaveText(/Your turn|Play the drawn card or pass/, { timeout: 20_000 });
});

test("the 3d table goes back to 2d when its graphics context is lost", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("kc-howto-seen", "1"));
  await page.goto("/play?view=3d&seats=2");
  const canvas = page.locator(".kc-table canvas");
  await expect(canvas).toBeVisible({ timeout: SCENE_TIMEOUT });
  await canvas.evaluate((el: HTMLCanvasElement) => {
    const gl = el.getContext("webgl2") ?? el.getContext("webgl");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  });
  await expect(page.getByRole("button", { name: "3D table" })).toHaveAttribute("aria-pressed", "false", { timeout: 20_000 });
  await expect(canvas).toHaveCount(0);
  await expect(page.locator("button.kc-deck")).toBeVisible();
});

test("the stored view is used and the address beats it", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("kc-howto-seen", "1");
    window.localStorage.setItem("kc-table-view", "3d");
    window.sessionStorage.setItem("kc-view-asked:/play", "1");
  });
  await page.goto("/play?seats=2");
  const chip = page.getByRole("button", { name: "3D table" });
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await page.goto("/play?seats=2&view=2d");
  await expect(chip).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("button.kc-deck")).toBeVisible();
});
