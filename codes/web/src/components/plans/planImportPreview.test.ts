import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildImportWeekDays,
  compareImportTasks,
  formatImportTaskClockRange,
  IMPORT_WEEKDAY_LABELS,
  isImportTaskSelected,
  selectedImportSlotIds,
  toggleUnselectedSlotId,
} from "./planImportPreview.ts";

function task(
  title: string,
  startAt: string,
  endAt: string,
  extra: { all_day?: boolean; location?: string | null; slot_id?: string } = {},
) {
  return {
    slot_id: extra.slot_id ?? title,
    title,
    start_at: startAt,
    end_at: endAt,
    all_day: extra.all_day ?? false,
    location: extra.location ?? null,
  };
}

describe("buildImportWeekDays", () => {
  it("builds Sunday-to-Saturday rows from period start", () => {
    const days = buildImportWeekDays("2026-09-13", []);
    assert.equal(days.length, 7);
    assert.deepEqual(
      days.map((day) => day.weekdayLabel),
      [...IMPORT_WEEKDAY_LABELS],
    );
    assert.deepEqual(
      days.map((day) => day.key),
      [
        "2026-09-13",
        "2026-09-14",
        "2026-09-15",
        "2026-09-16",
        "2026-09-17",
        "2026-09-18",
        "2026-09-19",
      ],
    );
    assert.equal(days[0].monthDayLabel, "9/13");
    assert.equal(days[6].monthDayLabel, "9/19");
  });

  it("normalizes a mid-week period start back to Sunday", () => {
    const days = buildImportWeekDays("2026-09-16", []);
    assert.equal(days[0].key, "2026-09-13");
    assert.equal(days[6].key, "2026-09-19");
  });

  it("groups tasks by local date and sorts from midnight", () => {
    const days = buildImportWeekDays("2026-09-13", [
      task("晚课", "2026-09-17T19:00:00", "2026-09-17T20:00:00"),
      task("午课", "2026-09-17T12:10:00", "2026-09-17T12:55:00"),
      task("全日", "2026-09-17T00:00:00", "2026-09-17T23:59:00", { all_day: true }),
      task("周一", "2026-09-14T08:00:00", "2026-09-14T09:00:00"),
    ]);
    assert.deepEqual(
      days[4].tasks.map((item) => item.title),
      ["全日", "午课", "晚课"],
    );
    assert.deepEqual(
      days[1].tasks.map((item) => item.title),
      ["周一"],
    );
    assert.equal(days[0].tasks.length, 0);
  });

  it("keeps more than five tasks on the same day for horizontal scrolling", () => {
    const extras = Array.from({ length: 6 }, (_, index) =>
      task(`任务${index + 1}`, `2026-09-13T0${index}:00:00`, `2026-09-13T0${index}:30:00`),
    );
    const days = buildImportWeekDays("2026-09-13", extras);
    assert.deepEqual(
      days[0].tasks.map((item) => item.title),
      ["任务1", "任务2", "任务3", "任务4", "任务5", "任务6"],
    );
  });
});

describe("formatImportTaskClockRange", () => {
  it("formats timed and all-day ranges without the date", () => {
    assert.equal(
      formatImportTaskClockRange("2026-09-17T12:10:00", "2026-09-17T12:55:00", false),
      "12:10–12:55",
    );
    assert.equal(
      formatImportTaskClockRange("2026-09-17T00:00:00", "2026-09-17T23:59:00", true),
      "全天",
    );
  });
});

describe("compareImportTasks", () => {
  it("orders all-day before timed tasks", () => {
    const timed = task("A", "2026-09-17T00:00:00", "2026-09-17T01:00:00");
    const allDay = task("B", "2026-09-17T08:00:00", "2026-09-17T09:00:00", { all_day: true });
    assert.ok(compareImportTasks(allDay, timed) < 0);
    assert.ok(compareImportTasks(timed, allDay) > 0);
  });
});

describe("import slot selection", () => {
  it("selects every task by default and keeps only checked ids on import", () => {
    const morning = task("晨练", "2026-09-21T12:10:00", "2026-09-21T12:55:00", {
      slot_id: "slot-morning",
    });
    const evening = task("综合", "2026-09-21T19:00:00", "2026-09-21T20:00:00", {
      slot_id: "slot-evening",
    });
    const unselected = new Set<string>();
    assert.equal(isImportTaskSelected(morning.slot_id, unselected), true);
    assert.equal(isImportTaskSelected(evening.slot_id, unselected), true);
    assert.deepEqual(selectedImportSlotIds([morning, evening], unselected), [
      "slot-morning",
      "slot-evening",
    ]);

    const unchecked = toggleUnselectedSlotId(unselected, "slot-evening");
    assert.equal(isImportTaskSelected("slot-evening", unchecked), false);
    assert.deepEqual(selectedImportSlotIds([morning, evening], unchecked), ["slot-morning"]);
    assert.deepEqual(
      selectedImportSlotIds([morning, evening], toggleUnselectedSlotId(unchecked, "slot-evening")),
      ["slot-morning", "slot-evening"],
    );
  });
});
