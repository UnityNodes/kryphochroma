import { describe, expect, it } from "vitest";
import { forcedHover, forcedIntro, forcedShot, forcesHq, readDebug } from "@/components/landing/debug";

describe("landing debug overrides", () => {
  it("is absent unless the page sets an object", () => {
    expect(readDebug({})).toBeUndefined();
    expect(readDebug({ __kcLanding: null })).toBeUndefined();
    expect(readDebug({ __kcLanding: 3 })).toBeUndefined();
    expect(readDebug({ __kcLanding: "hq" })).toBeUndefined();
  });

  it("changes nothing when absent or empty", () => {
    for (const debug of [undefined, readDebug({ __kcLanding: {} })]) {
      expect(forcesHq(debug)).toBe(false);
      expect(forcedShot(debug)).toBeNull();
      expect(forcedIntro(debug)).toBeNull();
      expect(forcedHover(debug)).toBeNull();
    }
  });

  it("reads each override on its own", () => {
    const debug = readDebug({ __kcLanding: { hq: true, introT: 0.6, shot: 4.5, hover: 2 } });
    expect(forcesHq(debug)).toBe(true);
    expect(forcedIntro(debug)).toBe(0.6);
    expect(forcedShot(debug)).toBe(4.5);
    expect(forcedHover(debug)).toBe(2);
  });

  it("treats zero as a real value", () => {
    const debug = readDebug({ __kcLanding: { introT: 0, shot: 0, hover: 0 } });
    expect(forcedIntro(debug)).toBe(0);
    expect(forcedShot(debug)).toBe(0);
    expect(forcedHover(debug)).toBe(0);
  });

  it("ignores values of the wrong type", () => {
    const debug = readDebug({ __kcLanding: { hq: "yes", introT: "1", shot: Number.NaN, hover: null } });
    expect(forcesHq(debug)).toBe(false);
    expect(forcedIntro(debug)).toBeNull();
    expect(forcedShot(debug)).toBeNull();
    expect(forcedHover(debug)).toBeNull();
  });

  it("follows changes made after the page has loaded", () => {
    const host: { __kcLanding?: unknown } = {};
    expect(forcedShot(readDebug(host))).toBeNull();
    host.__kcLanding = { shot: 6.5 };
    expect(forcedShot(readDebug(host))).toBe(6.5);
  });
});
