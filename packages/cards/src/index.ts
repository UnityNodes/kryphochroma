import { type Card, RANK, colorOf, isWild, rankOf } from "@kryphochroma/rules";
import { CARD_COLORS, CARD_VIEWBOX, CLIP_ID, PALETTE, RING_ID } from "./tokens.js";

export { CARD_COLORS, CARD_VIEWBOX, CLIP_ID, PALETTE, RING_ID } from "./tokens.js";

const { cream: CREAM, ink: INK } = PALETTE;
const f = (n: number): string => String(Math.round(n * 1000) / 1000);

export interface FaceOptions {
  readonly colorBlind?: boolean;
}

export function sharedDefs(): string {
  return `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><clipPath id="${CLIP_ID}"><rect x="6" y="6" width="88" height="138" rx="9"/></clipPath><path id="${RING_ID}" d="M50 75 m-27 0 a27 27 0 1 1 54 0 a27 27 0 1 1 -54 0"/></defs></svg>`;
}

function quarters(cx: number, cy: number, r: number): string {
  const span = (Math.PI * 2) / CARD_COLORS.length;
  const wedges = CARD_COLORS.map((c, i) => {
    const a0 = i * span - Math.PI / 2;
    const a1 = a0 + span;
    return `<path d="M${f(cx)} ${f(cy)}L${f(cx + r * Math.cos(a0))} ${f(cy + r * Math.sin(a0))}A${f(r)} ${f(r)} 0 0 1 ${f(cx + r * Math.cos(a1))} ${f(cy + r * Math.sin(a1))}Z" fill="${c.base}"/>`;
  }).join("");
  return `${wedges}<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${INK}" stroke-width="${f(r / 9)}"/>`;
}

function text(t: string, cx: number, cy: number, size: number, fill: string): string {
  const o = size / 22;
  const y = cy + size * 0.35;
  const common = `font-size="${f(size)}" text-anchor="middle" font-family="Tanker, sans-serif"`;
  return `<text x="${f(cx + o)}" y="${f(y + o)}" ${common} fill="${INK}">${t}</text><text x="${f(cx)}" y="${f(y)}" ${common} fill="${fill}" stroke="${INK}" stroke-width="${f(size / 26)}" paint-order="stroke">${t}</text>`;
}

function skipGlyph(cx: number, cy: number, s: number, fill: string): string {
  const shape = `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(14 * s)}"/><path d="M${f(cx - 9 * s)} ${f(cy + 9 * s)}L${f(cx + 9 * s)} ${f(cy - 9 * s)}"/>`;
  return `<g stroke="${INK}" stroke-width="${f(9 * s)}" fill="none" stroke-linecap="round" transform="translate(${f(1.5 * s)} ${f(1.5 * s)})">${shape}</g><g stroke="${fill}" stroke-width="${f(6 * s)}" fill="none" stroke-linecap="round">${shape}</g>`;
}

function spyglassGlyph(cx: number, cy: number, s: number, fill: string): string {
  const eye = `M${f(cx - 17 * s)} ${f(cy)}Q${f(cx)} ${f(cy - 15 * s)} ${f(cx + 17 * s)} ${f(cy)}Q${f(cx)} ${f(cy + 15 * s)} ${f(cx - 17 * s)} ${f(cy)}Z`;
  const outline = `<path d="${eye}" fill="${CREAM}" stroke="${INK}" stroke-width="${f(3.2 * s)}" stroke-linejoin="round"/>`;
  const iris = `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(7 * s)}" fill="${fill}" stroke="${INK}" stroke-width="${f(2.4 * s)}"/>`;
  const pupil = `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(2.8 * s)}" fill="${INK}"/>`;
  return `<g transform="translate(${f(1.5 * s)} ${f(1.5 * s)})"><path d="${eye}" fill="${INK}"/></g>${outline}${iris}${pupil}`;
}

function reverseGlyph(cx: number, cy: number, s: number, fill: string): string {
  const d = `M${f(cx - 14 * s)} ${f(cy - 6 * s)}H${f(cx + 11 * s)}M${f(cx + 4 * s)} ${f(cy - 13 * s)}L${f(cx + 11 * s)} ${f(cy - 6 * s)}L${f(cx + 4 * s)} ${f(cy + s)}M${f(cx + 14 * s)} ${f(cy + 7 * s)}H${f(cx - 11 * s)}M${f(cx - 4 * s)} ${f(cy)}L${f(cx - 11 * s)} ${f(cy + 7 * s)}L${f(cx - 4 * s)} ${f(cy + 14 * s)}`;
  const line = `fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  return `<path d="${d}" stroke="${INK}" stroke-width="${f(8.5 * s)}" ${line} transform="translate(${f(1.5 * s)} ${f(1.5 * s)})"/><path d="${d}" stroke="${fill}" stroke-width="${f(5.5 * s)}" ${line}/>`;
}

export function glyph(card: Card, cx: number, cy: number, s: number, fill: string): string {
  const rank = rankOf(card);
  if (isWild(card)) {
    return rank === RANK.wildDrawFour ? quarters(cx, cy, 19 * s) + text("+4", cx, cy, 30 * s, CREAM) : quarters(cx, cy, 19 * s);
  }
  if (rank <= 9) return text(String(rank), cx, cy, 48 * s, fill);
  if (rank === RANK.drawTwo) return text("+2", cx, cy, 34 * s, fill);
  if (rank === RANK.skip) return skipGlyph(cx, cy, s, fill);
  if (rank === RANK.spyglass) return spyglassGlyph(cx, cy, s, fill);
  return reverseGlyph(cx, cy, s, fill);
}

function sun(cx: number, cy: number, r: number, fill: string): string {
  let out = `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}"/>`;
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    out += `<circle cx="${f(cx + r * Math.cos(a))}" cy="${f(cy + r * Math.sin(a))}" r="${f(r * 0.22)}" fill="${fill}"/>`;
  }
  return out;
}

export function colorShape(color: number, cx: number, cy: number, size: number): string {
  const common = `fill="${CREAM}" stroke="${INK}" stroke-width="1"`;
  const h = size / 2;
  switch (color) {
    case 0:
      return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(h)}" ${common}/>`;
    case 1:
      return `<path d="M${f(cx)} ${f(cy - h)}L${f(cx + h)} ${f(cy + h)}L${f(cx - h)} ${f(cy + h)}Z" ${common}/>`;
    case 2:
      return `<path d="M${f(cx)} ${f(cy - h)}L${f(cx + h)} ${f(cy)}L${f(cx)} ${f(cy + h)}L${f(cx - h)} ${f(cy)}Z" ${common}/>`;
    case 3:
      return `<rect x="${f(cx - h)}" y="${f(cy - h)}" width="${f(size)}" height="${f(size)}" ${common}/>`;
    case 4: {
      const points = Array.from({ length: 6 }, (_, k) => {
        const a = (k * Math.PI) / 3;
        return `${f(cx + h * Math.cos(a))},${f(cy + h * Math.sin(a))}`;
      }).join(" ");
      return `<polygon points="${points}" ${common}/>`;
    }
    default:
      return "";
  }
}

function waves(card: Card): string {
  const wild = isWild(card);
  const color = CARD_COLORS[colorOf(card)];
  return Array.from({ length: 10 }, (_, i) => {
    const stroke = wild ? (CARD_COLORS[i % CARD_COLORS.length]?.base ?? CREAM) : (color?.dark ?? INK);
    return `<path d="M-60 ${i * 24 - 30} q 20 -11 40 0 t 40 0 t 40 0 t 40 0 t 40 0" stroke="${stroke}" stroke-width="9" fill="none" opacity="${wild ? 0.55 : 0.42}"/>`;
  }).join("");
}

export function cardFace(card: Card, options: FaceOptions = {}): string {
  const wild = isWild(card);
  const color = CARD_COLORS[colorOf(card)];
  const fill = wild ? PALETTE.wild : (color?.base ?? PALETTE.wild);
  const center = wild ? glyph(card, 50, 75, 1.15, CREAM) : glyph(card, 50, 75, 1, fill);
  const corner = glyph(card, 19, 22, 0.34, CREAM);
  const shape = options.colorBlind && !wild ? colorShape(colorOf(card), 81, 24, 9) : "";
  return [
    `<svg viewBox="${CARD_VIEWBOX}" xmlns="http://www.w3.org/2000/svg">`,
    `<rect width="100" height="150" rx="12" fill="${CREAM}"/>`,
    `<g clip-path="url(#${CLIP_ID})"><rect width="100" height="150" fill="${fill}"/><g transform="rotate(-24 50 75)">${waves(card)}</g></g>`,
    `<rect x="6" y="6" width="88" height="138" rx="9" fill="none" stroke="${INK}" stroke-width="1.4" opacity=".45"/>`,
    sun(50, 75, 28, wild ? INK : CREAM),
    center,
    corner,
    `<g transform="rotate(180 50 75)">${corner}</g>`,
    shape,
    `</svg>`,
  ].join("");
}

export function ringLabel(handle: string): string {
  const clean = handle.replace(/^0x/i, "").toUpperCase().replace(/[^0-9A-F]/g, "");
  const head = clean.slice(0, 6).padEnd(6, "0");
  const tail = clean.slice(-4).padStart(4, "0");
  return `EUINT8 · 0X${head} · SEALED · ACL · 0X${tail} ·`;
}

export function cardBack(handle = "0x0"): string {
  let rays = "";
  for (let k = 0; k < 18; k++) {
    const a0 = (k / 18) * Math.PI * 2;
    const a1 = a0 + Math.PI / 18;
    rays += `<path d="M50 75L${f(50 + 130 * Math.cos(a0))} ${f(75 + 130 * Math.sin(a0))}L${f(50 + 130 * Math.cos(a1))} ${f(75 + 130 * Math.sin(a1))}Z" fill="${PALETTE.backRay}"/>`;
  }
  const sunColor = CARD_COLORS[1].base;
  const redColor = CARD_COLORS[0].base;
  return [
    `<svg viewBox="${CARD_VIEWBOX}" xmlns="http://www.w3.org/2000/svg">`,
    `<rect width="100" height="150" rx="12" fill="${CREAM}"/>`,
    `<g clip-path="url(#${CLIP_ID})"><rect width="100" height="150" fill="${PALETTE.backField}"/>${rays}`,
    `<path d="M-10 128 q 15 -9 30 0 t 30 0 t 30 0 t 30 0" stroke="${sunColor}" stroke-width="5" fill="none" opacity=".5"/>`,
    `<path d="M-10 22 q 15 -9 30 0 t 30 0 t 30 0 t 30 0" stroke="${redColor}" stroke-width="5" fill="none" opacity=".5"/></g>`,
    `<circle cx="50" cy="75" r="34" fill="${PALETTE.backCore}" stroke="${sunColor}" stroke-width="1.6"/>`,
    `<text font-size="5.6" fill="${sunColor}" font-family="Chillax, sans-serif" font-weight="600" letter-spacing="1"><textPath href="#${RING_ID}">${ringLabel(handle)}</textPath></text>`,
    `<circle cx="50" cy="75" r="19" fill="${redColor}" stroke="${INK}" stroke-width="1.5"/>`,
    `<path d="M44 73v-4a6 6 0 0 1 12 0v4" stroke="${CREAM}" stroke-width="3.2" fill="none"/>`,
    `<rect x="40.5" y="72" width="19" height="14" rx="3.5" fill="${CREAM}"/>`,
    `<circle cx="50" cy="78" r="2.1" fill="${INK}"/><rect x="49" y="78" width="2" height="4.5" rx="1" fill="${INK}"/>`,
    `</svg>`,
  ].join("");
}
