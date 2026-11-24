import { describe, it, expect } from "vitest";
import { db, upgradeV2ToV3 } from "../db";

describe("Dexie version bump and migration (v2 -> v3)", () => {
  it("has database schema bumped to version 3", () => {
    expect(db.verno).toBe(3);
  });

  it("verifies routines table schema in v3 does not index identityId", () => {
    const routinesTable = db.tables.find((t) => t.name === "routines");
    expect(routinesTable).toBeDefined();

    // Check indexed property names on the table schema
    const indexNames = routinesTable?.schema.indexes.map((idx) => idx.name) ?? [];
    expect(indexNames).not.toContain("identityId");
  });

  it("migrates existing data: strips removed columns from tasks and routines while preserving kept data", async () => {
    // Simulated table records before v3 migration
    const taskRows: Record<string, unknown>[] = [
      {
        id: "task-1",
        userId: "user-123",
        title: "Finish Physics assignment",
        notes: "Chapter 4 problems",
        dueDate: "2026-12-01T10:00:00.000Z",
        priority: 1,
        status: "open",
        courseId: "course-101",
        projectId: null,
        domainId: null,
        starred: true,
        completedAt: null,
        estimatedDuration: 60,
        sortPriority: 10,
        createdAt: "2026-11-20T00:00:00.000Z",
        updatedAt: "2026-11-20T00:00:00.000Z",
        courseName: "Physics",
        courseColor: "#6B7FA3",
        projectName: null,
        projectColor: null,
        dirty: 0,
        _deleted: 0,
        // Slated for removal in Phase 2
        energyRequirement: "high",
        optimalTimeOfDay: "morning",
      },
      {
        id: "task-2",
        userId: "user-123",
        title: "Read Chapter 5",
        notes: null,
        dueDate: null,
        priority: 3,
        status: "done",
        courseId: "course-101",
        projectId: null,
        domainId: null,
        starred: false,
        completedAt: "2026-11-21T12:00:00.000Z",
        estimatedDuration: 30,
        sortPriority: null,
        createdAt: "2026-11-20T00:00:00.000Z",
        updatedAt: "2026-11-21T12:00:00.000Z",
        courseName: "Physics",
        courseColor: "#6B7FA3",
        projectName: null,
        projectColor: null,
        dirty: 0,
        _deleted: 0,
        // Slated for removal in Phase 2
        energyRequirement: "low",
        optimalTimeOfDay: "evening",
      },
    ];

    const routineRows: Record<string, unknown>[] = [
      {
        id: "routine-1",
        userId: "user-123",
        name: "Morning Review",
        timeOfDay: "morning",
        specificTime: "07:30",
        streakGoal: 30,
        activeDays: ["MON", "TUE", "WED", "THU", "FRI"],
        category: "study",
        flowTrigger: "after_coffee",
        createdAt: "2026-11-01T00:00:00.000Z",
        updatedAt: "2026-11-01T00:00:00.000Z",
        dirty: 0,
        _deleted: 0,
        // Slated for removal in Phase 2
        identityId: "identity-student-1",
        energyImpact: "high_energy",
      },
    ];

    const courseRows: Record<string, unknown>[] = [
      {
        id: "course-101",
        semesterId: "sem-1",
        name: "Physics I",
        code: "PHY101",
        credits: 4,
        dirty: 0,
        _deleted: 0,
      },
    ];

    // Mock transaction object as passed by Dexie during upgrade
    const mockTx = {
      table: (tableName: string) => {
        let collection: Record<string, unknown>[] = [];
        if (tableName === "tasks") collection = taskRows;
        else if (tableName === "routines") collection = routineRows;
        else if (tableName === "courses") collection = courseRows;

        return {
          toCollection: () => ({
            modify: async (modifier: (row: Record<string, unknown>) => void) => {
              for (const row of collection) {
                modifier(row);
              }
            },
          }),
        };
      },
    };

    // Run upgrade handler
    await upgradeV2ToV3(mockTx);

    // 1. Verify removed columns dropped from tasks
    for (const task of taskRows) {
      expect("energyRequirement" in task).toBe(false);
      expect("optimalTimeOfDay" in task).toBe(false);
      expect(task.energyRequirement).toBeUndefined();
      expect(task.optimalTimeOfDay).toBeUndefined();
    }

    // 2. Verify kept columns preserved in tasks
    expect(taskRows[0].id).toBe("task-1");
    expect(taskRows[0].title).toBe("Finish Physics assignment");
    expect(taskRows[0].notes).toBe("Chapter 4 problems");
    expect(taskRows[0].priority).toBe(1);
    expect(taskRows[0].status).toBe("open");
    expect(taskRows[0].starred).toBe(true);
    expect(taskRows[0].courseId).toBe("course-101");
    expect(taskRows[0].dirty).toBe(0);

    expect(taskRows[1].id).toBe("task-2");
    expect(taskRows[1].status).toBe("done");
    expect(taskRows[1].completedAt).toBe("2026-11-21T12:00:00.000Z");

    // 3. Verify removed columns dropped from routines
    for (const routine of routineRows) {
      expect("identityId" in routine).toBe(false);
      expect("energyImpact" in routine).toBe(false);
      expect(routine.identityId).toBeUndefined();
      expect(routine.energyImpact).toBeUndefined();
    }

    // 4. Verify kept columns preserved in routines
    expect(routineRows[0].id).toBe("routine-1");
    expect(routineRows[0].name).toBe("Morning Review");
    expect(routineRows[0].timeOfDay).toBe("morning");
    expect(routineRows[0].specificTime).toBe("07:30");
    expect(routineRows[0].streakGoal).toBe(30);
    expect(routineRows[0].activeDays).toEqual(["MON", "TUE", "WED", "THU", "FRI"]);
    expect(routineRows[0].category).toBe("study");
    expect(routineRows[0].dirty).toBe(0);

    // 5. Verify kept tables are untouched
    expect(courseRows[0].id).toBe("course-101");
    expect(courseRows[0].name).toBe("Physics I");
  });
});
