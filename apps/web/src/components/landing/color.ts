import { Color } from "three";

/** This three.js release does not convert colours by itself: a hex value handed to a lit material is read as linear and renders washed out, so every material and light colour is converted here. */
export function linear(hex: string): Color {
  return new Color(hex).convertSRGBToLinear();
}
