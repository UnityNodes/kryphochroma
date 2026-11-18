import { CanvasTexture, RepeatWrapping, sRGBEncoding } from "three";
import { PRINT } from "./constants";
import { seeded } from "./random";

const FELT_SIZE = 256;
const FELT_FIBRES = 1400;
const PRINT_FONT = '400 600px "Tanker"';

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2d canvas is not available");
  return context;
}

export function feltTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = FELT_SIZE;
  canvas.height = FELT_SIZE;
  const g = context2d(canvas);
  const image = g.createImageData(FELT_SIZE, FELT_SIZE);
  const data = image.data;
  const rnd = seeded(1337);
  for (let i = 0; i < data.length; i += 4) {
    const v = 196 + Math.floor(rnd() * 59);
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  g.putImageData(image, 0, 0);
  g.lineWidth = 1;
  for (let k = 0; k < FELT_FIBRES; k++) {
    const x = rnd() * FELT_SIZE;
    const y = rnd() * FELT_SIZE;
    const angle = rnd() * Math.PI;
    const length = 2 + rnd() * 5;
    g.strokeStyle = rnd() > 0.5 ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.12)";
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    g.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(26, 18);
  texture.anisotropy = 4;
  return texture;
}

/** The name is printed on the baize the way a card table carries its markings, so it is part of the room and takes the lamp and the shadows of the cards. It is drawn again once the display face has loaded, since a canvas does not wait for web fonts. */
export function printTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 640;
  const g = context2d(canvas);
  const texture = new CanvasTexture(canvas);
  texture.encoding = sRGBEncoding;
  texture.anisotropy = 8;
  const paint = () => {
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = "#f4e6c8";
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    g.font = `${PRINT_FONT}, "Arial Narrow", sans-serif`;
    const width = g.measureText(PRINT.text).width;
    const squeeze = Math.min(1, (canvas.width - 60) / width);
    g.setTransform(squeeze, 0, 0, 1, canvas.width / 2, 0);
    g.fillText(PRINT.text, 0, 540);
    g.setTransform(1, 0, 0, 1, 0, 0);
    texture.needsUpdate = true;
  };
  paint();
  document.fonts.load(PRINT_FONT).then(paint, () => console.warn("Landing: the display face did not load, the table print keeps the fallback face."));
  return texture;
}
