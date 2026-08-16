import {
  canClearScheduleByDrop,
  filterTasksByProject,
  filterTasksByTitle,
  isUndatedTask,
  listProjectUndatedTasks,
  listUndatedTasks,
} from "./undatedTasks.ts";
import { resolveUndatedDropRange } from "./taskUtils.ts";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(msg);
  }
}

assert(isUndatedTask({ start_at: null, end_at: null }), "null start and end is undated");
assert(isUndatedTask({}), "missing start and end is undated");
assert(isUndatedTask({ start_at: "", end_at: "  " }), "blank start and end is undated");
assert(!isUndatedTask({ start_at: "2026-08-17T01:00:00Z", end_at: null }), "start-only is dated");
assert(!isUndatedTask({ start_at: null, end_at: "2026-08-17T02:00:00Z" }), "end-only is dated");
assert(
  !isUndatedTask({ start_at: "2026-08-17T01:00:00Z", end_at: "2026-08-17T02:00:00Z" }),
  "both times is dated",
);

{
  const listed = listUndatedTasks([
    { id: "undated", start_at: null, end_at: null },
    { id: "start-only", start_at: "2026-08-17T01:00:00Z", end_at: null },
    { id: "dated", start_at: "2026-08-17T01:00:00Z", end_at: "2026-08-17T02:00:00Z" },
  ]);
  assert(listed.map((item) => item.id).join(",") === "undated", `only undated listed (got ${listed.map((i) => i.id).join(",")})`);
}

{
  const items = [
    { id: "in-project", project_id: "proj-a" },
    { id: "other-project", project_id: "proj-b" },
    { id: "also-in-project", project_id: "proj-a" },
  ];
  assert(
    filterTasksByProject(items, "proj-a").map((item) => item.id).join(",") === "in-project,also-in-project",
    "project filter keeps only matching project_id",
  );
  assert(filterTasksByProject(items, "proj-missing").length === 0, "unknown project returns empty");
}

{
  const listed = listProjectUndatedTasks(
    [
      { id: "proj-a-undated", project_id: "proj-a", start_at: null, end_at: null },
      { id: "proj-b-undated", project_id: "proj-b", start_at: null, end_at: null },
      { id: "proj-a-dated", project_id: "proj-a", start_at: "2026-08-17T01:00:00Z", end_at: "2026-08-17T02:00:00Z" },
    ],
    "proj-a",
  );
  assert(
    listed.map((item) => item.id).join(",") === "proj-a-undated",
    `project undated list excludes other projects and dated tasks (got ${listed.map((i) => i.id).join(",")})`,
  );
}

{
  const items = [{ title: "准备周会材料" }, { title: "写周报" }, { title: "Review PR" }];
  assert(
    filterTasksByTitle(items, "").map((item) => item.title).join(",") === "准备周会材料,写周报,Review PR",
    "empty query keeps all titles",
  );
  assert(
    filterTasksByTitle(items, "  周会  ").map((item) => item.title).join(",") === "准备周会材料",
    "trimmed query matches title substring",
  );
  assert(
    filterTasksByTitle(items, "review").map((item) => item.title).join(",") === "Review PR",
    "title search is case-insensitive",
  );
  assert(filterTasksByTitle(items, "不存在").length === 0, "unmatched query returns empty");
}

{
  assert(
    canClearScheduleByDrop({
      status: "todo",
      start_at: "2026-08-17T01:00:00Z",
      end_at: "2026-08-17T02:00:00Z",
    }),
    "todo with times can drop onto undated list",
  );
  assert(
    canClearScheduleByDrop({ status: "todo", start_at: "2026-08-17T01:00:00Z", end_at: null }),
    "todo start-only can drop onto undated list",
  );
  assert(
    !canClearScheduleByDrop({ status: "todo", start_at: null, end_at: null }),
    "already undated todo cannot drop onto undated list",
  );
  assert(
    !canClearScheduleByDrop({
      status: "doing",
      start_at: "2026-08-17T01:00:00Z",
      end_at: "2026-08-17T02:00:00Z",
    }),
    "doing task cannot drop onto undated list",
  );
  assert(
    !canClearScheduleByDrop({
      status: "done",
      start_at: "2026-08-17T01:00:00Z",
      end_at: "2026-08-17T02:00:00Z",
    }),
    "done task cannot drop onto undated list",
  );
}

function localParts(iso: string) {
  const d = new Date(iso);
  return {
    y: d.getFullYear(),
    m: d.getMonth() + 1,
    day: d.getDate(),
    h: d.getHours(),
    min: d.getMinutes(),
  };
}

{
  const result = resolveUndatedDropRange({ dateKey: "not-a-date", hour: null });
  assert(result == null, "invalid dateKey is rejected");
}

{
  const result = resolveUndatedDropRange({ dateKey: "2026-08-17", hour: null });
  assert(result != null, "month / all-day drop returns a range");
  if (result) {
    assert(
      JSON.stringify(localParts(result.startAt)) === JSON.stringify({ y: 2026, m: 8, day: 17, h: 9, min: 0 }),
      `month drop starts 09:00 (got ${JSON.stringify(localParts(result.startAt))})`,
    );
    assert(
      JSON.stringify(localParts(result.endAt)) === JSON.stringify({ y: 2026, m: 8, day: 17, h: 10, min: 0 }),
      `month drop ends 10:00 (got ${JSON.stringify(localParts(result.endAt))})`,
    );
  }
}

{
  const result = resolveUndatedDropRange({ dateKey: "2026-08-17", hour: 14 });
  assert(result != null, "day / week hour drop returns a range");
  if (result) {
    assert(
      JSON.stringify(localParts(result.startAt)) === JSON.stringify({ y: 2026, m: 8, day: 17, h: 14, min: 0 }),
      `hour drop starts 14:00 (got ${JSON.stringify(localParts(result.startAt))})`,
    );
    assert(
      JSON.stringify(localParts(result.endAt)) === JSON.stringify({ y: 2026, m: 8, day: 17, h: 15, min: 0 }),
      `hour drop lasts 1h (got ${JSON.stringify(localParts(result.endAt))})`,
    );
  }
}

{
  const result = resolveUndatedDropRange({ dateKey: "2026-08-17", hour: 9.25 });
  assert(result != null, "15-minute snap hour is allowed");
  if (result) {
    assert(
      JSON.stringify(localParts(result.startAt)) === JSON.stringify({ y: 2026, m: 8, day: 17, h: 9, min: 15 }),
      `snapped drop starts 09:15 (got ${JSON.stringify(localParts(result.startAt))})`,
    );
    assert(
      JSON.stringify(localParts(result.endAt)) === JSON.stringify({ y: 2026, m: 8, day: 17, h: 10, min: 15 }),
      `snapped drop lasts 1h (got ${JSON.stringify(localParts(result.endAt))})`,
    );
  }
}

console.log(`\n✅ passed: ${passed}`);
console.log(`❌ failed: ${failed}`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const msg of failures) console.log(`  - ${msg}`);
  process.exit(1);
}
