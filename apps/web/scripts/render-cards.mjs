import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { cardBack, cardFace, sharedDefs } from "@kryphochroma/cards";
import { COLOR_NAMES, RANK, colorOf, fullDeck, isDrawFour, isWild, rankOf } from "@kryphochroma/rules";

const WIDTH = 400;
const HEIGHT = 600;
const QUALITY = 0.9;
const RANK_NAMES = { [RANK.skip]: "skip", [RANK.reverse]: "reverse", [RANK.drawTwo]: "draw2", [RANK.spyglass]: "spyglass" };
const FONTS = [
  { family: "Tanker", weight: 400, file: "Tanker-Regular.woff2" },
  { family: "Chillax", weight: 600, file: "Chillax-Semibold.woff2" },
];

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, "..", "public");
const outDir = join(publicDir, "cards");

function faceName(card) {
  if (isWild(card)) return isDrawFour(card) ? "wild-draw4" : "wild";
  const colour = (COLOR_NAMES[colorOf(card)] ?? "").toLowerCase();
  return `${colour}-${RANK_NAMES[rankOf(card)] ?? String(rankOf(card))}`;
}

async function fontFaces() {
  const rules = await Promise.all(
    FONTS.map(async ({ family, weight, file }) => {
      const data = await readFile(join(publicDir, "fonts", file));
      return `@font-face{font-family:"${family}";font-weight:${weight};src:url(data:font/woff2;base64,${data.toString("base64")}) format("woff2")}`;
    }),
  );
  return rules.join("");
}

async function render(page, svg) {
  await page.evaluate((markup) => {
    globalThis.document.getElementById("card").innerHTML = markup;
  }, svg);
  const png = await page.locator("#card svg").screenshot({ omitBackground: true });
  const webp = await page.evaluate(
    async ({ source, width, height, quality }) => {
      const image = new globalThis.Image();
      image.src = source;
      await image.decode();
      const canvas = globalThis.document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(image, 0, 0, width, height);
      return canvas.toDataURL("image/webp", quality);
    },
    { source: `data:image/png;base64,${png.toString("base64")}`, width: WIDTH, height: HEIGHT, quality: QUALITY },
  );
  return Buffer.from(webp.slice(webp.indexOf(",") + 1), "base64");
}

async function main() {
  const cards = [...new Set(fullDeck())].sort((a, b) => a - b);
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH + 40, height: HEIGHT + 40 }, deviceScaleFactor: 1 });
    await page.setContent(
      `<!doctype html><style>${await fontFaces()}html,body{margin:0;background:transparent}#card svg{display:block;width:${WIDTH}px;height:${HEIGHT}px}</style>${sharedDefs()}<div id="card"></div>`,
    );
    await page.evaluate(async (families) => {
      await Promise.all(families.map(({ family, weight }) => globalThis.document.fonts.load(`${weight} 40px "${family}"`)));
      await globalThis.document.fonts.ready;
    }, FONTS);
    await mkdir(join(outDir, "shapes"), { recursive: true });
    await writeFile(join(outDir, "back.webp"), await render(page, cardBack()));
    let written = 1;
    for (const card of cards) {
      const name = faceName(card);
      await writeFile(join(outDir, `${name}.webp`), await render(page, cardFace(card)));
      written += 1;
      if (isWild(card)) continue;
      await writeFile(join(outDir, "shapes", `${name}.webp`), await render(page, cardFace(card, { colorBlind: true })));
      written += 1;
    }
    console.warn(`rendered ${written} card images into ${outDir}`);
  } finally {
    await browser.close();
  }
}

await main();
