import AxeBuilder from "@axe-core/playwright";
import { type Page, expect, test } from "@playwright/test";

async function seriousViolations(page: Page, exclude: readonly string[] = []) {
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]);
  for (const selector of exclude) builder = builder.exclude(selector);
  const { violations } = await builder.analyze();
  return violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
}

test("landing points to play, practice and the privacy page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kryphochroma" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Play on Sepolia" })).toHaveAttribute("href", "/new");
  await expect(page.getByRole("link", { name: "Practice offline" })).toHaveAttribute("href", "/play");
  await expect(page.getByRole("link", { name: "How it stays secret" })).toHaveAttribute("href", "/secret");
  expect(await seriousViolations(page)).toEqual([]);
});

test("the privacy page shows what an open contract would leak", async ({ page }) => {
  await page.goto("/secret");
  const mira = page.getByRole("list", { name: /^Mira:/ });
  await expect(mira).toHaveAttribute("aria-label", /sealed cards/);
  await expect(page.getByRole("list", { name: /^You:/ })).not.toHaveAttribute("aria-label", /sealed/);
  const toggle = page.getByRole("switch", { name: "Show what an open contract would leak" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(mira).not.toHaveAttribute("aria-label", /sealed/);
  await expect(page.getByText("readable by anyone").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "What is hidden, from whom, until when" })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test("a practice game teaches the rules, plays a move and keeps the table accessible", async ({ page }) => {
  await page.goto("/play?seats=2");
  const howTo = page.getByRole("dialog", { name: "How to play" });
  await expect(howTo).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(howTo).toBeHidden();

  const status = page.locator(".kc-status");
  await expect(status).toHaveText(/Your turn|Play the drawn card or pass/, { timeout: 20_000 });

  const sound = page.getByRole("button", { name: /Sound (on|off)/ });
  const before = await sound.getAttribute("aria-pressed");
  await sound.click();
  await expect(sound).not.toHaveAttribute("aria-pressed", before ?? "");

  const hand = page.getByRole("group", { name: /Your hand/ });
  const cards = hand.getByRole("button");
  await cards.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(cards.nth(1)).toBeFocused();

  const playable = hand.getByRole("button", { name: /, playable$/ });
  if ((await playable.count()) > 0) {
    await playable.first().click();
    const picker = page.getByRole("dialog", { name: "Pick a colour" });
    if (await picker.isVisible().catch(() => false)) await picker.getByRole("button").first().click();
  } else {
    await page.keyboard.press("d");
  }
  await expect(page.locator(".kc-feed").getByText(/^You (played|drew)/).first()).toBeVisible({ timeout: 20_000 });
  expect(await seriousViolations(page, [".kc-rays", ".kc-grain"])).toEqual([]);
});

test("a new table can start as a guest without a wallet", async ({ page }) => {
  await page.goto("/new");
  await expect(page.getByText("No browser wallet found")).toBeVisible();
  await expect(page.getByRole("button", { name: "Quick game" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Own table" })).toBeEnabled();
  expect(await seriousViolations(page)).toEqual([]);
});
