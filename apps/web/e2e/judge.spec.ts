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
  await expect(page.getByRole("heading", { level: 1, name: "The card game nobody can peek at." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Play on Sepolia", exact: true }).first()).toHaveAttribute("href", "/new");
  await expect(page.getByRole("link", { name: "Practice offline", exact: true }).first()).toHaveAttribute("href", "/play");
  await expect(page.getByRole("link", { name: "How it stays secret" }).first()).toHaveAttribute("href", "/secret");
  await page.locator("#moves").scrollIntoViewIfNeeded();
  await expect(page.getByRole("heading", { name: "Four moves for sealed cards" })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test("the privacy page shows what an open contract would leak", async ({ page }) => {
  await page.goto("/secret");
  const mira = page.getByRole("list", { name: /^Mira:/ });
  await expect(mira).toHaveAttribute("aria-label", /sealed cards/);
  await expect(page.getByRole("list", { name: /^You:/ })).not.toHaveAttribute("aria-label", /sealed/);
  const toggle = page.getByRole("switch", { name: /Show what an open contract would leak/ });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(mira).not.toHaveAttribute("aria-label", /sealed/);
  await expect(page.getByText("readable by anyone").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "What is hidden, from whom, until when" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hidden information is the game" })).toBeVisible();
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
  expect(await seriousViolations(page, [".kc-baize", ".kc-print"])).toEqual([]);
});

test("a new table can start as a guest without a wallet", async ({ page }) => {
  await page.goto("/new");
  await expect(page.getByRole("heading", { level: 1, name: "How do you want to play?" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Kryphochroma home" })).toHaveAttribute("href", "/");
  await expect(page.getByRole("link", { name: "Back to Home" })).toHaveAttribute("href", "/");
  await expect(page.getByRole("button", { name: /Deal me in/ })).toBeEnabled();
  await expect(page.getByRole("button", { name: /Get an invite link/ })).toBeEnabled();
  await expect(page.getByRole("button", { name: /Fill empty seats with bots/ })).toBeEnabled();
  await expect(page.getByRole("heading", { name: "Join a table" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Practice offline" })).toHaveAttribute("href", "/play");
  expect(await seriousViolations(page)).toEqual([]);
});

test("the table view is picked before the game and the table opens in it", async ({ page }) => {
  await page.goto("/new");
  const picker = page.getByRole("radiogroup", { name: "How the table looks" });
  await expect(picker.getByRole("radio", { name: /2D table/ })).toHaveAttribute("aria-checked", "true");
  await picker.getByRole("radio", { name: /3D table/ }).click();
  await expect(picker.getByRole("radio", { name: /3D table/ })).toHaveAttribute("aria-checked", "true");
  expect(await page.evaluate(() => window.localStorage.getItem("kc-table-view"))).toBe("3d");
  await page.reload();
  await expect(page.getByRole("radiogroup", { name: "How the table looks" }).getByRole("radio", { name: /3D table/ })).toHaveAttribute("aria-checked", "true");
  await page.getByLabel("Table code or invite link").fill("not a code");
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.locator("#table-code-error")).toContainText("not a table code");
  await page.getByLabel("Table code or invite link").fill("https://kryphochroma.unitynodes.com/j/red-otter");
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page).toHaveURL(/\/j\/red-otter$/);
});

test("the docs open on every page with navigation", async ({ page }) => {
  await page.goto("/docs");
  await expect(page).toHaveURL(/\/docs\/overview$/);
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  await page.goto("/docs/mechanics");
  await expect(page.getByRole("heading", { level: 2, name: "Veil" })).toBeVisible();
  await page.getByRole("link", { name: /Privacy model/ }).last().click();
  await expect(page).toHaveURL(/\/docs\/privacy$/);
  expect(await seriousViolations(page)).toEqual([]);
});

test("a practice table offers the veil and can go back to the menu", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("kc-howto-seen", "1"));
  await page.goto("/play?seats=2");
  await expect(page.locator(".kc-status")).toHaveText(/Your turn|Play the drawn card|doubt it/, { timeout: 20_000 });
  await expect(page.getByTitle(/Your secret colour/).filter({ visible: true }).first()).toBeVisible();
  const veil = page.getByRole("button", { name: "Veil" });
  if (await veil.isVisible()) {
    await veil.click();
    const dialog = page.getByRole("dialog", { name: "Veil a card" });
    await dialog.getByRole("button", { name: /^Hide / }).first().click();
    await dialog.getByRole("button", { name: /^Name it / }).first().click();
    await expect(page.locator(".kc-feed").getByText(/^You veiled a card as/)).toBeVisible({ timeout: 20_000 });
  }
  await page.getByRole("link", { name: /back to the menu/ }).click();
  await expect(page).toHaveURL(/\/$/);
});

