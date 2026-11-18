import { describe, expect, it } from "vitest";
import { CLOSING, POSES, SHOT_COUNT, blankFrame, fitFov, framePose } from "@/components/landing/pose";

const at = (index: number) => {
  const pose = POSES[index];
  if (!pose) throw new Error(`no pose ${index}`);
  return pose;
};

const frameAt = (shot: number, closing = 0, band = false) => {
  const frame = blankFrame();
  framePose(frame, shot, closing > 0, closing, band);
  return frame;
};

describe("camera pose", () => {
  it("has one pose per shot and a closing pose", () => {
    expect(POSES).toHaveLength(SHOT_COUNT);
    expect(SHOT_COUNT).toBe(8);
    expect(CLOSING.fov).toBe(34);
  });

  it("sits exactly on a pose in the middle of its shot", () => {
    for (let shot = 0; shot < SHOT_COUNT; shot++) {
      const pose = at(shot);
      const frame = frameAt(shot + 0.5);
      expect(frame.px).toBeCloseTo(pose.px, 6);
      expect(frame.py).toBeCloseTo(pose.py, 6);
      expect(frame.pz).toBeCloseTo(pose.pz, 6);
      expect(frame.tx).toBeCloseTo(pose.tx, 6);
      expect(frame.fov).toBeCloseTo(pose.fov, 6);
      expect(frame.lamp).toBeCloseTo(pose.lamp, 6);
      expect(frame.scrimL).toBeCloseTo(pose.scrimL, 6);
      expect(frame.scrimR).toBeCloseTo(pose.scrimR, 6);
    }
  });

  it("drifts along the pose before the first shot is centred", () => {
    const pose = at(0);
    const frame = frameAt(0);
    expect(frame.px).toBeCloseTo(pose.px - 0.5 * pose.dx, 6);
    expect(frame.py).toBeCloseTo(pose.py - 0.5 * pose.dy, 6);
    expect(frame.pz).toBeCloseTo(pose.pz - 0.5 * pose.dz, 6);
    expect(frame.tz).toBeCloseTo(pose.tz, 6);
  });

  it("holds the outgoing pose until the cut starts and the incoming one after it ends", () => {
    const from = at(2);
    const to = at(3);
    const before = frameAt(2.5 + 0.3);
    expect(before.tx).toBeCloseTo(from.tx, 6);
    expect(before.px).toBeCloseTo(from.px + 0.3 * from.dx, 6);
    const after = frameAt(2.5 + 0.72);
    expect(after.tx).toBeCloseTo(to.tx, 6);
    expect(after.px).toBeCloseTo(to.px + (0.72 - 1) * to.dx, 6);
    expect(after.scrimL).toBeCloseTo(to.scrimL, 6);
  });

  it("is halfway between two poses in the middle of the cut", () => {
    const from = at(4);
    const to = at(5);
    const frame = frameAt(4.5 + 0.51);
    expect(frame.tx).toBeCloseTo((from.tx + to.tx) / 2, 6);
    expect(frame.lx).toBeCloseTo((from.lx + to.lx) / 2, 6);
    expect(frame.px).toBeCloseTo((from.px + 0.51 * from.dx + to.px - 0.49 * to.dx) / 2, 6);
  });

  it("moves monotonically through a cut", () => {
    const from = at(0);
    const to = at(1);
    let last = from.py;
    for (let f = 0.3; f <= 0.72; f += 0.02) {
      const frame = frameAt(0.5 + f);
      expect(frame.py).toBeLessThanOrEqual(last + 1e-6);
      last = frame.py;
    }
    expect(last).toBeCloseTo(to.py, 1);
  });

  it("keeps drifting on the last pose past the end of the scroll", () => {
    const pose = at(SHOT_COUNT - 1);
    const frame = frameAt(SHOT_COUNT);
    expect(frame.px).toBeCloseTo(pose.px + 0.5 * pose.dx, 6);
    expect(frame.tx).toBeCloseTo(pose.tx, 6);
  });

  it("uses the closing pose with its own drift when the page closes", () => {
    const start = frameAt(3.2, 0.001);
    const end = frameAt(3.2, 1);
    expect(start.fov).toBe(CLOSING.fov);
    expect(start.ty).toBeCloseTo(CLOSING.ty, 6);
    expect(start.pz).toBeCloseTo(CLOSING.pz + CLOSING.dz * (0.001 - 0.5), 6);
    expect(end.pz).toBeCloseTo(CLOSING.pz + CLOSING.dz * 0.5, 6);
  });

  it("drops the sideways offset and the scrims on the phone band", () => {
    const wide = frameAt(1.5);
    const band = frameAt(1.5, 0, true);
    expect(wide.ox).not.toBe(0);
    expect(wide.scrimR).toBe(1);
    expect(band.ox).toBe(0);
    expect(band.oy).toBe(0);
    expect(band.scrimL).toBe(0);
    expect(band.scrimR).toBe(0);
    expect(band.px).toBeCloseTo(wide.px, 6);
  });
});

describe("field of view", () => {
  it("is untouched when the stage is at least as wide as the composition", () => {
    expect(fitFov(30, 1.6, 1.6)).toBe(30);
    expect(fitFov(30, 2.2, 1.6)).toBe(30);
  });

  it("widens on a narrow stage so the same width of table stays in frame", () => {
    const fov = fitFov(30, 1.2, 1.6);
    const halfWidth = (value: number, aspect: number) => Math.tan((value * Math.PI) / 360) * aspect;
    expect(fov).toBeGreaterThan(30);
    expect(halfWidth(fov, 1.2)).toBeCloseTo(halfWidth(30, 1.6), 6);
  });

  it("never opens wider than 64 degrees", () => {
    expect(fitFov(34, 0.4, 1.6)).toBe(64);
  });
});
