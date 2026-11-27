import { describe, expect, it } from "vitest";
import {
  isBriefPayloadV1,
  isBriefPayloadV2,
  parseStoredBriefPayload,
  upgradeV1ToV2Fallback,
  type BriefPayloadV2,
} from "../payload-v2";
import type { BriefPayload } from "../build";

describe("payload-v2 schema helpers", () => {
  it("recognizes schemaVersion 2 payloads", () => {
    const v2: BriefPayloadV2 = {
      schemaVersion: 2,
      kind: "morning",
      forDate: "2026-11-27",
      generatedAt: "2026-11-27T07:00:00.000Z",
      isEmptyDay: false,
      headline: { text: "3 classes today, rain at 15:00", source: "fallback" },
      summary: "First class at 09:00.",
      pushSummary: "First class at 09:00.",
    };

    expect(isBriefPayloadV2(v2)).toBe(true);
    expect(isBriefPayloadV1(v2)).toBe(false);
    expect(parseStoredBriefPayload(v2)).toEqual(v2);
  });

  it("safely reads legacy v1 payloads and upgrades to a simple fallback", () => {
    const v1: BriefPayload = {
      kind: "morning",
      forDate: "2026-11-26",
      weatherLine: "Kathmandu: Clear sky, 12°–22°C",
      earliestCommitment: null,
      sections: [],
      pushSummary: "Clear schedule today — open your morning brief.",
    };

    expect(isBriefPayloadV1(v1)).toBe(true);
    expect(isBriefPayloadV2(v1)).toBe(false);
    expect(parseStoredBriefPayload(v1)).toEqual(v1);

    const upgraded = upgradeV1ToV2Fallback(v1);
    expect(upgraded.schemaVersion).toBe(2);
    expect(upgraded.headline).toEqual({ text: "Morning Brief", source: "fallback" });
    expect(upgraded.summary).toBe(v1.pushSummary);
    expect(upgraded.weather?.summaryLine).toBe(v1.weatherLine);
  });

  it("returns null for malformed stored payloads", () => {
    expect(parseStoredBriefPayload(null)).toBeNull();
    expect(parseStoredBriefPayload({ foo: "bar" })).toBeNull();
  });
});
