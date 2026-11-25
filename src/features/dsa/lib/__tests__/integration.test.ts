import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { proxy, config } from "@/proxy";
import { computeDsaDueSummary } from "../summary";

const mockGetUser = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

describe("DSA Integration (Summary & Proxy Auth Boundary)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("computeDsaDueSummary returns unconfigured when neither settings nor problems exist", () => {
    const summary = computeDsaDueSummary({
      hasSettings: false,
      problems: [],
      todayStr: "2026-11-25",
    });
    expect(summary).toEqual({
      isConfigured: false,
      dueToday: 0,
      overdue: 0,
      topOverdue: [],
    });
  });

  it("computeDsaDueSummary returns dueToday, overdue, and top 3 overdue titles ordered by priority", () => {
    const summary = computeDsaDueSummary({
      hasSettings: true,
      todayStr: "2026-11-25",
      problems: [
        {
          id: "p-1",
          topicId: "t-1",
          topicName: "Arrays",
          subtopic: "",
          title: "Low Fail 1d Overdue",
          difficulty: "easy",
          sourceUrl: "",
          archived: false,
          lastClassification: "hinted",
          intervalDays: 2,
          consecutiveIndependent: 0,
          nextRevisionDate: "2026-11-24",
          manualNextRevisionDate: null,
          attempts: [{ attemptDate: "2026-11-22", classification: "hinted", isRevision: false }],
        },
        {
          id: "p-2",
          topicId: "t-1",
          topicName: "Arrays",
          subtopic: "",
          title: "High Fail Overdue",
          difficulty: "hard",
          sourceUrl: "",
          archived: false,
          lastClassification: "not_understood",
          intervalDays: 1,
          consecutiveIndependent: 0,
          nextRevisionDate: "2026-11-24",
          manualNextRevisionDate: null,
          attempts: [
            { attemptDate: "2026-11-20", classification: "editorial", isRevision: false },
            { attemptDate: "2026-11-23", classification: "not_understood", isRevision: true },
          ],
        },
        {
          id: "p-3",
          topicId: "t-1",
          topicName: "Arrays",
          subtopic: "",
          title: "Med Fail 3d Overdue",
          difficulty: "medium",
          sourceUrl: "",
          archived: false,
          lastClassification: "editorial",
          intervalDays: 1,
          consecutiveIndependent: 0,
          nextRevisionDate: "2026-11-22",
          manualNextRevisionDate: null,
          attempts: [{ attemptDate: "2026-11-21", classification: "editorial", isRevision: false }],
        },
        {
          id: "p-4",
          topicId: "t-1",
          topicName: "Arrays",
          subtopic: "",
          title: "Fourth Overdue",
          difficulty: "easy",
          sourceUrl: "",
          archived: false,
          lastClassification: "effortful",
          intervalDays: 3,
          consecutiveIndependent: 0,
          nextRevisionDate: "2026-11-24",
          manualNextRevisionDate: null,
          attempts: [{ attemptDate: "2026-11-21", classification: "effortful", isRevision: false }],
        },
        {
          id: "p-5",
          topicId: "t-1",
          topicName: "Arrays",
          subtopic: "",
          title: "Due Today Problem",
          difficulty: "medium",
          sourceUrl: "",
          archived: false,
          lastClassification: "independent",
          intervalDays: 7,
          consecutiveIndependent: 1,
          nextRevisionDate: "2026-11-25",
          manualNextRevisionDate: null,
          attempts: [{ attemptDate: "2026-11-18", classification: "independent", isRevision: false }],
        },
      ],
    });

    expect(summary).toEqual({
      isConfigured: true,
      dueToday: 1,
      overdue: 4,
      topOverdue: [
        "High Fail Overdue",
        "Med Fail 3d Overdue",
        "Low Fail 1d Overdue",
      ],
    });
  });

  it("protects all /dsa routes in src/proxy.ts requiring authentication", async () => {
    const dsaRoutes = [
      "/dsa",
      "/dsa/topics",
      "/dsa/problems",
      "/dsa/problems/11111111-1111-4111-8111-111111111111",
      "/dsa/revision",
      "/dsa/log",
      "/dsa/report",
      "/dsa/settings",
      "/dsa/contests",
    ];

    // Confirm existing matcher covers all /dsa routes
    const matcherRegex = new RegExp(`^${config.matcher[0]}$`);
    for (const route of dsaRoutes) {
      expect(matcherRegex.test(route)).toBe(true);
    }

    // Unauthenticated requests redirect to /login
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    for (const route of dsaRoutes) {
      const res = await proxy(new NextRequest(`http://localhost:3000${route}`));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/login");
    }

    // Authenticated requests propagate x-user-id
    mockGetUser.mockResolvedValue({
      data: { user: { id: "dsa-auth-user" } },
      error: null,
    });
    const authedRes = await proxy(new NextRequest("http://localhost:3000/dsa/revision"));
    expect(authedRes.headers.get("x-middleware-request-x-user-id")).toBe("dsa-auth-user");
  });
});
