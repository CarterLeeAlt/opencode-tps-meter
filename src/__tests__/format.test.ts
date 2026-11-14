/**
 * Meter text formatting tests.
 *
 * The cache figure is whole-percent, so the rounding rule is the only thing keeping it
 * honest: a partially cached prompt must never render as a full cache hit.
 */

import { describe, expect, it } from "bun:test";

import {
  cacheHitRatio,
  formatCachePercent,
  formatSessionCacheHit,
  fitMeterText,
  type MeterReading,
} from "../format.js";
import { defaultConfig } from "../config.js";

/** A settled reading with no prompt accounting, filled in per test. */
function meter(partial: Partial<MeterReading>): MeterReading {
  return { instantTps: 0, avgTps: 0, totalTokens: 0, elapsedMs: 0, active: false, ...partial };
}

describe("formatCachePercent", () => {
  it("keeps a ratio below 1 off 100%", () => {
    // 99.5% and 99.95% both round to a whole 100%, but neither is a full cache hit.
    expect(formatCachePercent(0.995)).toBe("99%");
    expect(formatCachePercent(0.9995)).toBe("99%");
    expect(formatCachePercent(0.9966777408637874)).toBe("99%");
  });

  it("reports 100% for an exact full hit", () => {
    expect(formatCachePercent(1)).toBe("100%");
  });

  it("rounds every other ratio to the nearest whole percent", () => {
    expect(formatCachePercent(0.91)).toBe("91%");
    expect(formatCachePercent(0.5)).toBe("50%");
    expect(formatCachePercent(0)).toBe("0%");
  });
});

describe("formatSessionCacheHit", () => {
  it("stays at 99% when a few prompt tokens were uncached", () => {
    // 12000 cached of 12040 prompt tokens: 99.67%, the reading that used to show as 100%.
    expect(formatSessionCacheHit(meter({ sessionCacheReadTokens: 12000, sessionInputTokens: 40 }))).toBe("99%");
  });

  it("shows 100% only when the whole prompt came from cache", () => {
    expect(
      formatSessionCacheHit(meter({ sessionCacheReadTokens: 1000, sessionCacheWriteTokens: 0, sessionInputTokens: 0 }))
    ).toBe("100%");
  });

  it("counts cache writes on the prompt side, not as hits", () => {
    expect(formatSessionCacheHit(meter({ sessionCacheWriteTokens: 100, sessionInputTokens: 0 }))).toBe("0%");
    expect(cacheHitRatio({ cacheReadTokens: 300, cacheWriteTokens: 700, inputTokens: 0 })).toBeCloseTo(0.3);
  });

  it("returns null while no session accounting is known", () => {
    expect(formatSessionCacheHit(meter({}))).toBeNull();
    // The latest step's accounting is a separate field set and must not leak in here.
    expect(formatSessionCacheHit(meter({ cacheReadTokens: 1000, inputTokens: 0 }))).toBeNull();
  });
});

it("fits complete fields while prioritizing TPS and session cache", () => {
  const reading = meter({
    active: true, instantTps: 0.4, avgTps: 1.6, totalTokens: 26,
    sessionCacheReadTokens: 960, sessionInputTokens: 40,
  });
  expect(fitMeterText(reading, defaultConfig, 100)).toBe("0.4 TPS · avg 1.6 · 26 tok · session cache 96%");
  expect(fitMeterText(reading, defaultConfig, 28)).toBe("0.4 TPS · session cache 96%");
  expect(fitMeterText(reading, defaultConfig, 7)).toBe("0.4 TPS");
  expect(fitMeterText(reading, defaultConfig, 6)).toBe("");
  expect(fitMeterText(reading, { ...defaultConfig, showCacheHit: false }, 28)).not.toContain("cache");
});
