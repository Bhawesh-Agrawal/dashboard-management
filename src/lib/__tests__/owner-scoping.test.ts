import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ownerWhere, isStrictOwnerScoping } from "../owner-scoping";

describe("Owner Scoping Helper (src/lib/owner-scoping.ts)", () => {
  const originalEnv = process.env.STRICT_OWNER_SCOPING;

  beforeEach(() => {
    delete process.env.STRICT_OWNER_SCOPING;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.STRICT_OWNER_SCOPING = originalEnv;
    } else {
      delete process.env.STRICT_OWNER_SCOPING;
    }
  });

  it("defaults to interim fallback when STRICT_OWNER_SCOPING is unset", () => {
    expect(isStrictOwnerScoping()).toBe(false);

    const clause = ownerWhere("user-123");
    expect(clause).toEqual({
      OR: [{ userId: "user-123" }, { userId: null }],
    });
  });

  it("defaults to interim fallback when STRICT_OWNER_SCOPING is 'false'", () => {
    process.env.STRICT_OWNER_SCOPING = "false";
    expect(isStrictOwnerScoping()).toBe(false);

    const clause = ownerWhere("user-123");
    expect(clause).toEqual({
      OR: [{ userId: "user-123" }, { userId: null }],
    });
  });

  it("returns strict { userId } filter when STRICT_OWNER_SCOPING is 'true'", () => {
    process.env.STRICT_OWNER_SCOPING = "true";
    expect(isStrictOwnerScoping()).toBe(true);

    const clause = ownerWhere("user-123");
    expect(clause).toEqual({
      userId: "user-123",
    });
  });
});
