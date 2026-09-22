import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  groupScheduleMapItemsByCoordinate,
  scheduleMapCardCopy,
  scheduleMapChestCopy,
} from "./scheduleMapPins.ts";

const CHEST_LABELS = {
  chestTasks: (count: number) => `${count} 个任务`,
  chestAria: (place: string, count: number) => `${place}，${count} 个任务，点按查看`,
};

const LABELS = {
  unscheduled: "未排期",
  moreItems: (title: string, count: number) => `${title} 等${count}项`,
  status: (status: string) =>
    ({ todo: "未开始", doing: "进行中", done: "已完成", archived: "已归档" }[status] ?? status),
};

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: "a",
    title: "喂猫",
    status: "doing",
    location: "文汇小区",
    location_lat: 31.1706,
    location_lng: 121.5364,
    start_at: "2026-09-20T01:00:00.000Z",
    end_at: "2026-09-20T02:00:00.000Z",
    ...overrides,
  };
}

describe("groupScheduleMapItemsByCoordinate", () => {
  it("keeps separate coordinates as separate pins", () => {
    const groups = groupScheduleMapItemsByCoordinate([
      item({ id: "a" }),
      item({ id: "b", location_lat: 31.18, location_lng: 121.54 }),
    ]);
    assert.equal(groups.length, 2);
    assert.deepEqual(groups.map((group) => group.map((row) => row.id)), [["a"], ["b"]]);
  });

  it("stacks tasks that share the same pin", () => {
    const groups = groupScheduleMapItemsByCoordinate([
      item({ id: "a" }),
      item({ id: "b", title: "遛狗" }),
    ]);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].map((row) => row.id), ["a", "b"]);
  });
});

describe("scheduleMapCardCopy", () => {
  it("fills title, time, and location for a single task", () => {
    const copy = scheduleMapCardCopy([item()], LABELS, () => "09:00 - 10:00");
    assert.equal(copy.title, "喂猫");
    assert.equal(copy.timeLabel, "09:00 - 10:00");
    assert.equal(copy.statusLabel, "进行中");
    assert.equal(copy.locationLabel, "文汇小区");
    assert.equal(copy.count, 1);
  });

  it("puts status on the third line for completed tasks", () => {
    const copy = scheduleMapCardCopy([item({ status: "done" })], LABELS, () => "09:00 - 10:00");
    assert.equal(copy.statusLabel, "已完成");
  });

  it("uses unscheduled when there is no time", () => {
    const copy = scheduleMapCardCopy([item({ start_at: null, end_at: null })], LABELS, () => null);
    assert.equal(copy.timeLabel, "未排期");
  });

  it("summarizes stacked tasks and keeps the shared location", () => {
    const copy = scheduleMapCardCopy([item(), item({ id: "b", title: "遛狗" })], LABELS, () => "09:00");
    assert.equal(copy.title, "喂猫 等2项");
    assert.equal(copy.locationLabel, "文汇小区");
    assert.equal(copy.count, 2);
  });
});

describe("scheduleMapChestCopy", () => {
  it("uses the place title and caps the badge at 99+", () => {
    const copy = scheduleMapChestCopy({ placeTitle: "文汇小区", count: 3 }, CHEST_LABELS);
    assert.equal(copy.placeTitle, "文汇小区");
    assert.equal(copy.countDisplay, "3");
    assert.equal(copy.countLabel, "3 个任务");
    assert.equal(copy.ariaLabel, "文汇小区，3 个任务，点按查看");
    assert.equal(
      scheduleMapChestCopy({ placeTitle: "文汇小区", count: 120 }, CHEST_LABELS).countDisplay,
      "99+",
    );
  });
});
