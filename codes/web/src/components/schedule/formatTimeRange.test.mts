// 测试：formatScheduleTimeRange 改进后的格式
// 跑法：node --experimental-strip-types --no-warnings src/components/schedule/formatTimeRange.test.mts

const pad2 = (n: number) => String(n).padStart(2, "0");

// 复制 taskUtils 的实现（保持自包含）
function formatHm(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatMdHmDash(d: Date): string {
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${formatHm(d)}`;
}

function formatDateAnchor(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatScheduleTimeRange(
  startIso?: string | null,
  endIso?: string | null,
  now = new Date(),
): string | null {
  if (!startIso) return null;
  const s = new Date(startIso);
  if (Number.isNaN(s.getTime())) return null;
  const e = endIso ? new Date(endIso) : null;
  const hasValidE = e != null && !Number.isNaN(e.getTime());

  if (!hasValidE) {
    const startDateKey = formatDateAnchor(s);
    if (startDateKey === formatDateAnchor(now)) {
      return formatHm(s);
    }
    return formatMdHmDash(s);
  }

  const sameDay =
    s.getFullYear() === e!.getFullYear() && s.getMonth() === e!.getMonth() && s.getDate() === e!.getDate();

  if (sameDay) return `${formatHm(s)} - ${formatHm(e!)}`;
  return `${formatMdHmDash(s)} - ${formatMdHmDash(e!)}`;
}

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

// 用一个固定 now 来避免边界 case 跨天
const NOW = new Date("2026-08-11T15:00:00.000Z");

// ---------- 同一天 ----------

// Case 1: 9:00 - 10:30 同一天
{
  const r = formatScheduleTimeRange(
    "2026-08-11T09:00:00.000Z",
    "2026-08-11T10:30:00.000Z",
    NOW,
  );
  assert(r === "17:00 - 18:30", `同一天 (UTC 9-10:30) → "17:00 - 18:30" (got ${r})`);
}

// Case 2: 整点 9:00 - 10:00
{
  const r = formatScheduleTimeRange(
    "2026-08-11T09:00:00.000Z",
    "2026-08-11T10:00:00.000Z",
    NOW,
  );
  assert(r === "17:00 - 18:00", `整点 (got ${r})`);
}

// ---------- 跨天 ----------

// Case 3: 跨天，08-15 09:00 - 08-17 10:30
{
  const r = formatScheduleTimeRange(
    "2026-08-15T09:00:00.000Z",
    "2026-08-17T10:30:00.000Z",
    NOW,
  );
  assert(r === "08-15 17:00 - 08-17 18:30", `跨天 (got ${r})`);
}

// Case 4: 跨午夜（不在日期意义上的"跨天"，但小时上跨）
{
  // 22:00 - 23:30 同一天
  const r = formatScheduleTimeRange(
    "2026-08-11T22:00:00.000Z",
    "2026-08-11T23:30:00.000Z",
    NOW,
  );
  assert(r === "06:00 - 07:30", `跨午夜但同日 (got ${r})`);
}

// ---------- 缺 end_at ----------

// Case 5: 缺 end_at，且开始日 = 今天 → 只显时间
{
  // 2026-08-11 当天的时间
  const r = formatScheduleTimeRange("2026-08-11T09:00:00.000Z", null, NOW);
  assert(r === "17:00", `缺 end 且当日 (got ${r})`);
}

// Case 6: 缺 end_at，且开始日 ≠ 今天 → 加日期
{
  const r = formatScheduleTimeRange("2026-08-15T09:00:00.000Z", null, NOW);
  assert(r === "08-15 17:00", `缺 end 且非当日 (got ${r})`);
}

// ---------- 边界 ----------

// Case 7: startIso 为 null
{
  assert(formatScheduleTimeRange(null, "2026-08-11T10:00:00.000Z", NOW) === null, "null start");
  assert(formatScheduleTimeRange(undefined, "2026-08-11T10:00:00.000Z", NOW) === null, "undefined start");
}

// Case 8: startIso 无效
{
  assert(formatScheduleTimeRange("invalid", null, NOW) === null, "invalid start");
  assert(formatScheduleTimeRange("", null, NOW) === null, "empty start");
}

// Case 9: endIso 无效 → 当作无 end
{
  const r = formatScheduleTimeRange("2026-08-11T09:00:00.000Z", "invalid", NOW);
  assert(r === "17:00", `end 无效时只显开始 (got ${r})`);
}

// Case 10: 缺 end_iso 时对非当日的处理
//   用一个明显远离 NOW 的日期（2026-12-15），避免本地时区的影响
{
  const r = formatScheduleTimeRange("2026-12-15T09:00:00.000Z", null, NOW);
  assert(r === "12-15 17:00", `缺 end 非当日 (got ${r})`);
}

// ---------- 输出 ----------
console.log(`\n✅ passed: ${passed}`);
console.log(`❌ failed: ${failed}`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
