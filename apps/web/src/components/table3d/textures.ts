import { CanvasTexture, RepeatWrapping, sRGBEncoding } from "three";
import { seeded } from "../landing/random";
import { PRINT_TEXT } from "./constants";

const PRINT_FONT = '400 600px "Tanker"';
const PI = Math.PI;

export const RING_TEX_R = 0.82;

function canvasOf(width: number, height: number): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("2d canvas is not available");
  return { canvas, g };
}

/** The name is printed on the baize, so it takes the lamp and the shadows. It is drawn again once the display face has loaded, since a canvas does not wait for web fonts, and the scene is told because it only draws a frame when something changed. */
export function printTexture(onPaint: () => void): CanvasTexture {
  const { canvas, g } = canvasOf(2048, 640);
  const texture = new CanvasTexture(canvas);
  texture.encoding = sRGBEncoding;
  texture.anisotropy = 8;
  const paint = () => {
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = "#f4e6c8";
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    g.font = `${PRINT_FONT}, "Arial Narrow", sans-serif`;
    const squeeze = Math.min(1, (canvas.width - 60) / g.measureText(PRINT_TEXT).width);
    g.setTransform(squeeze, 0, 0, 1, canvas.width / 2, 0);
    g.fillText(PRINT_TEXT, 0, 540);
    g.setTransform(1, 0, 0, 1, 0, 0);
    texture.needsUpdate = true;
    onPaint();
  };
  paint();
  document.fonts.load(PRINT_FONT).then(paint, () => console.warn("Table: the display face did not load, the table print keeps the fallback face."));
  return texture;
}

/** The colour in play is a chalk ring drawn on the baize around the discard pile: a mark a player would really make, lit and shadowed with the table. The stroke is broken and uneven so it reads as chalk and not as a glow. */
export function chalkTexture(): CanvasTexture {
  const size = 512;
  const half = size / 2;
  const { canvas, g } = canvasOf(size, size);
  const rnd = seeded(4242);
  g.translate(half, half);
  g.lineCap = "round";
  for (let pass = 0; pass < 7; pass++) {
    const radius = half * RING_TEX_R + (pass - 3) * 3.6;
    let a = rnd() * 6;
    const end = a + PI * 2;
    while (a < end) {
      const step = 0.02 + rnd() * 0.05;
      if (rnd() > 0.09) {
        g.strokeStyle = `rgba(255,255,255,${(0.42 + rnd() * 0.55).toFixed(2)})`;
        g.lineWidth = 3 + rnd() * 6;
        g.beginPath();
        g.arc(0, 0, radius + (rnd() - 0.5) * 3, a, a + step);
        g.stroke();
      }
      a += step;
    }
  }
  g.globalCompositeOperation = "destination-out";
  for (let k = 0; k < 2600; k++) {
    const angle = rnd() * PI * 2;
    const radius = half * RING_TEX_R + (rnd() - 0.5) * 40;
    g.fillStyle = `rgba(0,0,0,${(0.3 + rnd() * 0.5).toFixed(2)})`;
    g.fillRect(Math.cos(angle) * radius, Math.sin(angle) * radius, 1 + rnd() * 2.4, 1 + rnd() * 2.4);
  }
  const texture = new CanvasTexture(canvas);
  texture.anisotropy = 8;
  return texture;
}

function wrapLine(g: CanvasRenderingContext2D, width: number, height: number, y: number, amp: number, waves: number, phase: number): void {
  for (let offset = -height; offset <= height; offset += height) {
    g.beginPath();
    for (let x = 0; x <= width; x += 8) {
      const yy = y + offset + amp * Math.sin((PI * 2 * waves * x) / width + phase);
      if (x === 0) g.moveTo(x, yy);
      else g.lineTo(x, yy);
    }
    g.stroke();
  }
}

export function woodTexture(): CanvasTexture {
  const { canvas, g } = canvasOf(512, 256);
  const rnd = seeded(9001);
  g.fillStyle = "#4c2613";
  g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 300; i++) {
    const dark = rnd() < 0.7;
    g.strokeStyle = dark ? `rgba(26,10,3,${(0.05 + rnd() * 0.2).toFixed(2)})` : `rgba(128,74,38,${(0.03 + rnd() * 0.08).toFixed(2)})`;
    g.lineWidth = 0.5 + rnd() * rnd() * 3.2;
    wrapLine(g, 512, 256, rnd() * 256, rnd() * 2.5, 1 + Math.floor(rnd() * 3), rnd() * 6.3);
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.encoding = sRGBEncoding;
  texture.anisotropy = 4;
  return texture;
}

export function boardsTexture(): CanvasTexture {
  const size = 512;
  const { canvas, g } = canvasOf(size, size);
  const rnd = seeded(5150);
  const board = size / 4;
  const seam = "rgba(8,5,3,0.9)";
  for (let b = 0; b < 4; b++) {
    let y = -rnd() * 300;
    while (y < size) {
      const length = 190 + rnd() * 240;
      const tone = 60 + Math.floor(rnd() * 34);
      g.fillStyle = `rgb(${tone},${Math.floor(tone * 0.68)},${Math.floor(tone * 0.45)})`;
      g.fillRect(b * board, y, board, length);
      if (y + length > size) g.fillRect(b * board, y - size, board, length);
      g.fillStyle = seam;
      g.fillRect(b * board, y, board, 2);
      g.fillRect(b * board, y - size, board, 2);
      y += length;
    }
    g.fillStyle = seam;
    g.fillRect(b * board, 0, 3, size);
  }
  g.lineWidth = 1;
  for (let i = 0; i < 700; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    g.strokeStyle = rnd() < 0.6 ? "rgba(0,0,0,0.16)" : "rgba(120,84,50,0.08)";
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rnd() - 0.5) * 3, y + 30 + rnd() * 90);
    g.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.encoding = sRGBEncoding;
  texture.anisotropy = 8;
  return texture;
}
