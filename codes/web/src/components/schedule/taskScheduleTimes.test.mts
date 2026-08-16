import { resolveTaskScheduleTimes, validateUndatedTaskStatus } from "./taskScheduleTimes.ts";

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

{
  const result = resolveTaskScheduleTimes("", "");
  assert(result.ok === true, "empty start and end is allowed");
  if (result.ok) {
    assert(result.start_at === null && result.end_at === null, "empty times save as null");
  }
}

{
  const result = resolveTaskScheduleTimes("  ", "");
  assert(result.ok === true, "whitespace-only times are treated as empty");
  if (result.ok) {
    assert(result.start_at === null && result.end_at === null, "whitespace times save as null");
  }
}

{
  const result = resolveTaskScheduleTimes("2026-08-17T09:00", "2026-08-17T10:00");
  assert(result.ok === true, "dated range is allowed");
  if (result.ok) {
    assert(result.start_at != null && result.end_at != null, "dated range keeps both ISO times");
    assert(new Date(result.end_at).getTime() > new Date(result.start_at).getTime(), "end is after start");
  }
}

{
  const result = resolveTaskScheduleTimes("2026-08-17T10:00", "2026-08-17T09:00");
  assert(result.ok === false, "end before start is rejected");
  if (!result.ok) {
    assert(result.error === "结束时间不能早于开始时间", `got error: ${result.error}`);
  }
}

{
  const result = resolveTaskScheduleTimes("2026-08-17T09:00", "");
  assert(result.ok === true, "start-only is allowed");
  if (result.ok) {
    assert(result.start_at != null && result.end_at === null, "start-only keeps start and null end");
  }
}

{
  const allowed = validateUndatedTaskStatus(null, null, "todo");
  assert(allowed.ok === true, "undated todo status is allowed");
  const rejected = validateUndatedTaskStatus(null, null, "doing");
  assert(rejected.ok === false, "undated doing status is rejected");
  if (!rejected.ok) {
    assert(rejected.error === "无时间任务只能保存为未开始", `got error: ${rejected.error}`);
  }
  const dated = validateUndatedTaskStatus("2026-08-17T01:00:00Z", null, "doing");
  assert(dated.ok === true, "start-only can use non-todo status");
}

console.log(`\n✅ passed: ${passed}`);
console.log(`❌ failed: ${failed}`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const msg of failures) console.log(`  - ${msg}`);
  process.exit(1);
}
