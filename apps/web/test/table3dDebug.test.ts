import { describe, expect, it } from "vitest";
import { forcedCamera, forcedHover, forcesHq, parseFreeze, readDebug, seededHand } from "@/components/table3d/debug";

describe("3d table debug overrides", () => {
  it("is absent unless the page sets an object", () => {
    expect(readDebug({})).toBeUndefined();
    expect(readDebug({ __kcTable3d: null })).toBeUndefined();
    expect(readDebug({ __kcTable3d: "hq" })).toBeUndefined();
  });

  it("changes nothing when absent or empty", () => {
    for (const debug of [undefined, readDebug({ __kcTable3d: {} })]) {
      expect(forcesHq(debug)).toBe(false);
      expect(parseFreeze(debug)).toBeNull();
      expect(forcedHover(debug)).toBeNull();
      expect(forcedCamera(debug)).toBeNull();
      expect(seededHand(debug)).toBeNull();
    }
  });

  it("reads a frozen moment as a name and how far into it", () => {
    expect(parseFreeze({ freeze: "idle" })).toEqual({ name: "idle", at: 0.5 });
    expect(parseFreeze({ freeze: "play0.25" })).toEqual({ name: "play", at: 0.25 });
    expect(parseFreeze({ freeze: "draw1" })).toEqual({ name: "draw", at: 1 });
    expect(parseFreeze({ freeze: "nonsense" })).toBeNull();
    expect(parseFreeze({ freeze: 3 })).toBeNull();
  });

  it("reads each override on its own and treats zero as a value", () => {
    const debug = readDebug({ __kcTable3d: { hq: true, hover: 0, hand: 20, camera: { p: [0, 9, 9], t: [0, 0, 0], fov: 30 } } });
    expect(forcesHq(debug)).toBe(true);
    expect(forcedHover(debug)).toBe(0);
    expect(seededHand(debug)).toBe(20);
    expect(forcedCamera(debug)).toEqual({ p: [0, 9, 9], t: [0, 0, 0], fov: 30 });
    expect(forcedCamera({ camera: { p: [0, 9], t: [0, 0, 0] } })).toBeNull();
    expect(seededHand({ hand: 99 })).toBeNull();
  });
});
