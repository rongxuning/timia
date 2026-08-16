import { compareCalendarItems } from "./calendarItemSort.ts";

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

function ids(items: Parameters<typeof compareCalendarItems>[0][]) {
  return [...items].sort(compareCalendarItems).map((item) => item.id);
}

{
  const ordered = ids([
    { id: "archived", status: "archived", priority: "4", start_at: "2026-06-15T08:00:00Z" },
    { id: "done", status: "done", priority: "4", start_at: "2026-06-15T08:00:00Z" },
    { id: "doing-late", status: "doing", priority: "4", start_at: "2026-06-15T11:00:00Z" },
    { id: "doing-early-low", status: "doing", priority: "1", start_at: "2026-06-15T09:00:00Z" },
    { id: "doing-early-high", status: "doing", priority: "4", start_at: "2026-06-15T09:00:00Z" },
    { id: "todo", status: "todo", priority: "1", start_at: "2026-06-15T16:00:00Z" },
  ]);
  assert(
    ordered.join(",") === "todo,doing-early-high,doing-early-low,doing-late,done,archived",
    `status then time then priority (got ${ordered.join(",")})`,
  );
}

console.log(`\n✅ passed: ${passed}`);
console.log(`❌ failed: ${failed}`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
