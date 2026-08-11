// 测试：CalendarTaskCardLines 预览时间解析契约
// 跑法：node --experimental-strip-types --no-warnings src/components/schedule/calendarTaskCardPreview.test.mts

type Item = { start_at: string; end_at: string | null };

function resolvePreviewTimes(
  item: Item,
  previewStartAtIso?: string | null,
  previewEndAtIso?: string | null,
) {
  const startIso = previewStartAtIso !== undefined ? previewStartAtIso : item.start_at;
  const endIso = previewEndAtIso !== undefined ? previewEndAtIso : item.end_at;
  return { startIso, endIso };
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

const item: Item = {
  start_at: "2026-08-11T09:00:00.000Z",
  end_at: "2026-08-11T10:00:00.000Z",
};

// undefined preview → fall back to item times (idle cards must not blank time row)
{
  const r = resolvePreviewTimes(item);
  assert(r.startIso === item.start_at, "undefined preview uses item.start_at");
  assert(r.endIso === item.end_at, "undefined preview uses item.end_at");
}

// active preview → override item times
{
  const r = resolvePreviewTimes(item, "2026-08-11T14:00:00.000Z", "2026-08-11T15:30:00.000Z");
  assert(r.startIso === "2026-08-11T14:00:00.000Z", "preview overrides start");
  assert(r.endIso === "2026-08-11T15:30:00.000Z", "preview overrides end");
}

// defined null end → treat as missing end (not fall back to item.end_at)
{
  const r = resolvePreviewTimes(item, "2026-08-11T14:00:00.000Z", null);
  assert(r.startIso === "2026-08-11T14:00:00.000Z", "preview start kept");
  assert(r.endIso === null, "defined null end stays null");
}

console.log(`\n✅ passed: ${passed}`);
console.log(`❌ failed: ${failed}`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
