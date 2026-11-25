import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseQuestionBankInput, computeImportKey } from "../import-parser";
import { computeImportDiff } from "../import-diff";
import { previewDsaImport, confirmDsaImport } from "../import-actions";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth", () => ({
  getCurrentUserId: vi.fn(async () => "user-import-1"),
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor(msg = "Unauthorized") {
      super(msg);
      this.name = "UnauthorizedError";
    }
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockTx = {
  dsaTopic: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  dsaProblem: {
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  },
  dsaSettings: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dsaTopic: { findMany: vi.fn() },
    dsaProblem: { findMany: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
  },
}));

const SAMPLE_CSV = [
  "topic,subtopic,title,difficulty,url,platform,platform_id,order,tags,import_key",
  "Arrays,Basics,Two Sum,easy,https://example.com/1,leetcode,1,1,array;hash,lc-1",
  "Arrays,Two Pointers,3Sum,medium,https://example.com/15,leetcode,15,2,two-pointers,",
  "Graphs,BFS,Word Ladder,hard,https://example.com/127,other,,1,bfs;graph,",
].join("\n");

describe("DSA Question Bank Import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("computes importKey in strict match order: import_key > platform:platform_id > normalized topic|title", () => {
    expect(
      computeImportKey({
        importKey: "custom-key",
        platform: "leetcode",
        platformId: "1",
        topic: "Arrays",
        title: "Two Sum",
      })
    ).toBe("custom-key");

    expect(
      computeImportKey({
        platform: "LeetCode",
        platformId: "15",
        topic: "Arrays",
        title: "3Sum",
      })
    ).toBe("leetcode:15");

    expect(
      computeImportKey({
        platform: "other",
        platformId: "",
        topic: "  Graphs  ",
        title: "Word   Ladder ",
      })
    ).toBe("graphs|word ladder");
  });

  it("parses CSV, JSON, and pasted TSV text cleanly", () => {
    const csvRes = parseQuestionBankInput(SAMPLE_CSV, "csv");
    expect(csvRes.invalidRows).toHaveLength(0);
    expect(csvRes.validRows).toHaveLength(3);
    expect(csvRes.topicOrder).toEqual(["Arrays", "Graphs"]);
    expect(csvRes.validRows[0].importKey).toBe("lc-1");
    expect(csvRes.validRows[0].tags).toEqual(["array", "hash"]);
    expect(csvRes.validRows[1].importKey).toBe("leetcode:15");
    expect(csvRes.validRows[2].importKey).toBe("graphs|word ladder");

    const tsv = SAMPLE_CSV.replace(/,/g, "\t");
    const tsvRes = parseQuestionBankInput(tsv, "text");
    expect(tsvRes.invalidRows).toHaveLength(0);
    expect(tsvRes.validRows).toHaveLength(3);

    const jsonRes = parseQuestionBankInput(
      JSON.stringify([
        {
          topic: "DP",
          subtopic: "1D",
          title: "Climbing Stairs",
          difficulty: "easy",
          url: "https://example.com/70",
          platform: "leetcode",
          platform_id: "70",
          order: 1,
          tags: "dp;fib",
        },
      ]),
      "json"
    );
    expect(jsonRes.invalidRows).toHaveLength(0);
    expect(jsonRes.validRows).toHaveLength(1);
    expect(jsonRes.validRows[0].importKey).toBe("leetcode:70");
  });

  it("flags bad rows with clear reasons (missing title, bad difficulty, bad url, duplicate key)", () => {
    const badCsv = [
      "topic,subtopic,title,difficulty,url,platform,platform_id,order,tags,import_key",
      "Arrays,,Missing Title Row,easy,https://example.com/1,leetcode,1,1,,",
      "Arrays,,Bad Diff,extreme,https://example.com/2,leetcode,2,2,,",
      "Arrays,,Bad Url,medium,ftp://bad-url,leetcode,3,3,,",
      "Arrays,,Valid One,easy,https://example.com/4,leetcode,4,4,,dup-key",
      "Arrays,,Dup Key Row,easy,https://example.com/5,leetcode,5,5,,dup-key",
    ]
      .join("\n")
      .replace("Missing Title Row", "");

    const res = parseQuestionBankInput(badCsv, "csv");
    expect(res.validRows).toHaveLength(1);
    expect(res.invalidRows).toHaveLength(4);
    expect(res.invalidRows[0].reason).toContain("title");
    expect(res.invalidRows[1].reason).toContain("Invalid difficulty");
    expect(res.invalidRows[2].reason).toContain("http://");
    expect(res.invalidRows[3].reason).toContain("Duplicate import key");
  });

  it("computes new, updated, unchanged, and archived diff accurately and is idempotent", () => {
    const parsed = parseQuestionBankInput(SAMPLE_CSV, "csv");
    const existingTopics = [{ id: "t-arr", name: "Arrays", order: 1 }];
    const existingProblems = [
      {
        id: "p-1",
        topicId: "t-arr",
        topicName: "Arrays",
        subtopic: "Basics",
        title: "Two Sum",
        difficulty: "easy" as const,
        sourceUrl: "https://example.com/1",
        platform: "leetcode",
        platformId: "1",
        orderInTopic: 1,
        tags: ["array", "hash"],
        importKey: "lc-1",
        archived: false,
      },
      {
        id: "p-2",
        topicId: "t-arr",
        topicName: "Arrays",
        subtopic: "Two Pointers",
        title: "3Sum (Old Title)",
        difficulty: "medium" as const,
        sourceUrl: "https://example.com/15",
        platform: "leetcode",
        platformId: "15",
        orderInTopic: 2,
        tags: ["two-pointers"],
        importKey: "leetcode:15",
        archived: false,
      },
      {
        id: "p-old",
        topicId: "t-arr",
        topicName: "Arrays",
        subtopic: "Old",
        title: "Removed Problem",
        difficulty: "easy" as const,
        sourceUrl: "",
        platform: "other",
        platformId: null,
        orderInTopic: 99,
        tags: [],
        importKey: "arrays|removed problem",
        archived: false,
      },
    ];

    const diff = computeImportDiff({
      validRows: parsed.validRows,
      invalidRows: parsed.invalidRows,
      topicOrder: parsed.topicOrder,
      existingTopics,
      existingProblems,
    });

    expect(diff.newRows.map((r) => r.importKey)).toEqual(["graphs|word ladder"]);
    expect(diff.updatedRows.map((r) => r.importKey)).toEqual(["leetcode:15"]);
    expect(diff.updatedRows[0].changedFields).toEqual(["title"]);
    expect(diff.unchangedRows.map((r) => r.importKey)).toEqual(["lc-1"]);
    expect(diff.missingFromFile.map((r) => r.id)).toEqual(["p-old"]);

    // Second pass with identical state produces 0 new/updated/missing (idempotent)
    const syncedProblems = [
      existingProblems[0],
      { ...existingProblems[1], title: "3Sum" },
      { id: "p-3", topicId: "t-graphs", topicName: "Graphs", subtopic: "BFS", title: "Word Ladder", difficulty: "hard" as const, sourceUrl: "https://example.com/127", platform: "other", platformId: null, orderInTopic: 1, tags: ["bfs", "graph"], importKey: "graphs|word ladder", archived: false },
      { ...existingProblems[2], archived: true },
    ];
    const idempotentDiff = computeImportDiff({
      validRows: parsed.validRows,
      invalidRows: [],
      topicOrder: parsed.topicOrder,
      existingTopics: [
        { id: "t-arr", name: "Arrays", order: 1 },
        { id: "t-graphs", name: "Graphs", order: 2 },
      ],
      existingProblems: syncedProblems,
    });
    expect(idempotentDiff.newRows).toHaveLength(0);
    expect(idempotentDiff.updatedRows).toHaveLength(0);
    expect(idempotentDiff.missingFromFile).toHaveLength(0);
    expect(idempotentDiff.unchangedRows).toHaveLength(3);
  });

  it("confirmDsaImport preserves personal-progress columns, archives missing problems, and keeps topics with problems/attempts", async () => {
    vi.mocked(prisma.dsaTopic.findMany).mockResolvedValue([
      { id: "t-arr", name: "Arrays", order: 1 } as never,
      { id: "t-legacy", name: "Legacy Topic", order: 2 } as never,
    ]);
    vi.mocked(prisma.dsaProblem.findMany).mockResolvedValue([
      {
        id: "p-1",
        topicId: "t-arr",
        topic: { name: "Arrays" },
        subtopic: "Basics",
        title: "Two Sum Old",
        difficulty: "easy",
        sourceUrl: "https://example.com/1",
        platform: "leetcode",
        platformId: "1",
        orderInTopic: 1,
        tags: ["array", "hash"],
        importKey: "lc-1",
        archived: false,
      } as never,
      {
        id: "p-legacy",
        topicId: "t-legacy",
        topic: { name: "Legacy Topic" },
        subtopic: "",
        title: "Legacy Attempted",
        difficulty: "medium",
        sourceUrl: "",
        platform: "",
        platformId: null,
        orderInTopic: 1,
        tags: [],
        importKey: "legacy topic|legacy attempted",
        archived: false,
      } as never,
    ]);
    mockTx.dsaTopic.create.mockResolvedValue({ id: "t-graphs" });
    mockTx.dsaProblem.count.mockResolvedValue(1);
    mockTx.dsaSettings.findUnique.mockResolvedValue({ id: "s-1", currentTopicId: "t-arr" });

    const preview = await previewDsaImport({ content: SAMPLE_CSV, format: "csv" });
    expect(preview.newRows).toHaveLength(2);
    expect(preview.updatedRows).toHaveLength(1);
    expect(preview.missingFromFile).toHaveLength(1);

    const res = await confirmDsaImport({ content: SAMPLE_CSV, format: "csv" });
    expect(res.ok).toBe(true);
    expect(res.created).toBe(2);
    expect(res.updated).toBe(1);
    expect(res.archived).toBe(1);

    // Ensure update ONLY sets bank columns, NEVER personal progress fields
    const updateCall = mockTx.dsaProblem.update.mock.calls[0][0];
    expect(updateCall.data).not.toHaveProperty("lastClassification");
    expect(updateCall.data).not.toHaveProperty("lastAttemptAt");
    expect(updateCall.data).not.toHaveProperty("intervalDays");
    expect(updateCall.data).not.toHaveProperty("consecutiveIndependent");
    expect(updateCall.data).not.toHaveProperty("nextRevisionDate");
    expect(updateCall.data).not.toHaveProperty("manualNextRevisionDate");

    // Ensure missing problem was archived, not deleted
    expect(mockTx.dsaProblem.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-import-1", id: { in: ["p-legacy"] } },
      data: { archived: true },
    });
    // Legacy topic had 1 problem (now archived) so it was NOT deleted
    expect(mockTx.dsaTopic.delete).not.toHaveBeenCalled();
  });

  it("confirmDsaImport rejects bad rows with no database writes", async () => {
    const res = await confirmDsaImport({
      content: "topic,title,difficulty\nArrays,Bad,impossible",
      format: "csv",
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("invalid row");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
