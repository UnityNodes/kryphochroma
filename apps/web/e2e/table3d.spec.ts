import { expect, test } from "@playwright/test";

test.use({ launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] } });

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
  await expect(canvas).toBeVisible({ timeout: 30_000 });

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
