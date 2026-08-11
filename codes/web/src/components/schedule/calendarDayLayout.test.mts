// 自包含测试脚本：把核心算法 + 工具函数复制进来，避免拉项目编译链
// 跑法：node --experimental-strip-types --no-warnings src/components/schedule/calendarDayLayout.test.mts

// ---------- 复制的工具函数（与 calendarDayLayout.ts 保持一致） ----------
const DAY_TIMELINE_HOUR_HEIGHT_PX = 48;
const MIN_SEGMENT_HEIGHT_PX = 18;

type VisibleItem = {
  item: { id: string };
  startMin: number;
  endMin: number;
  duration: number;
};

type Segment = {
  topPx: number;
  heightPx: number;
  leftPct: number;
  widthPct: number;
};

function computeSegments(visible: VisibleItem[]): Map<string, Segment[]> {
  const byItemId = new Map<string, Segment[]>();
  if (visible.length === 0) return byItemId;

  const breakpointsSet = new Set<number>();
  for (const v of visible) {
    breakpointsSet.add(v.startMin);
    breakpointsSet.add(v.endMin);
  }
  const breakpoints = Array.from(breakpointsSet).sort((a, b) => a - b);

  for (let i = 0; i < breakpoints.length - 1; i++) {
    const tStart = breakpoints[i];
    const tEnd = breakpoints[i + 1];
    if (tEnd <= tStart) continue;

    const active = visible.filter((v) => v.startMin <= tStart && v.endMin >= tEnd);
    if (active.length === 0) continue;

    const totalDuration = active.reduce((sum, v) => sum + v.duration, 0);
    const sortedActive = [...active].sort(
      (a, b) => a.startMin - b.startMin || b.endMin - a.endMin,
    );

    let leftPct = 0;
    for (const v of sortedActive) {
      const widthPct =
        totalDuration > 0 ? (v.duration / totalDuration) * 100 : 100 / active.length;
      const segs = byItemId.get(v.item.id) ?? [];
      segs.push({
        topPx: (tStart / 60) * DAY_TIMELINE_HOUR_HEIGHT_PX,
        heightPx: ((tEnd - tStart) / 60) * DAY_TIMELINE_HOUR_HEIGHT_PX,
        leftPct,
        widthPct,
      });
      byItemId.set(v.item.id, segs);
      leftPct += widthPct;
    }
  }

  // 合并相邻同位置 segment
  for (const [id, segs] of byItemId) {
    const merged: Segment[] = [];
    for (const seg of segs) {
      const last = merged[merged.length - 1];
      if (last && last.leftPct === seg.leftPct && last.widthPct === seg.widthPct) {
        last.heightPx += seg.heightPx;
      } else {
        merged.push({ ...seg });
      }
    }
    byItemId.set(id, merged);
  }

  return byItemId;
}

function layoutDayTimeline(
  items: Array<{ id: string; startMin: number; endMin: number }>,
) {
  const visible: VisibleItem[] = items
    .map((it) => ({
      item: { id: it.id },
      startMin: it.startMin,
      endMin: it.endMin,
      duration: it.endMin - it.startMin,
    }))
    .filter((v) => v.duration > 0);

  const segmentsByItemId = computeSegments(visible);
  return visible.map((v) => ({
    item: v.item,
    segments: (segmentsByItemId.get(v.item.id) ?? []).map((s) =>
      s.heightPx < MIN_SEGMENT_HEIGHT_PX ? { ...s, heightPx: MIN_SEGMENT_HEIGHT_PX } : s,
    ),
  }));
}

// ---------- 测试工具 ----------
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

function approx(a: number, b: number, eps = 0.5) {
  return Math.abs(a - b) <= eps;
}

function totalWidth(segs: Segment[]) {
  return segs.reduce((sum, s) => sum + s.widthPct, 0);
}

function findBlock(blocks: ReturnType<typeof layoutDayTimeline>, id: string) {
  return blocks.find((b) => b.item.id === id);
}

// ---------- 测试用例 ----------

// Case 1: 空列表
{
  const out = layoutDayTimeline([]);
  assert(out.length === 0, "empty input → empty output");
}

// Case 2: 单一事件 → 占满全宽
{
  const out = layoutDayTimeline([{ id: "a", startMin: 9 * 60, endMin: 10 * 60 }]);
  const a = findBlock(out, "a")!;
  assert(a.segments.length === 1, "single event → 1 segment");
  assert(approx(a.segments[0].widthPct, 100), "single event → 100% width");
  assert(approx(a.segments[0].leftPct, 0), "single event → left=0");
}

// Case 3: 两个事件不重叠 → 各占满全宽
{
  const out = layoutDayTimeline([
    { id: "a", startMin: 9 * 60, endMin: 10 * 60 },
    { id: "b", startMin: 11 * 60, endMin: 12 * 60 },
  ]);
  const a = findBlock(out, "a")!;
  const b = findBlock(out, "b")!;
  assert(a.segments.length === 1 && approx(a.segments[0].widthPct, 100), "non-overlap a → 100%");
  assert(b.segments.length === 1 && approx(b.segments[0].widthPct, 100), "non-overlap b → 100%");
}

// Case 4: 两个事件完全重叠（同等 duration）→ 各 50%
{
  const out = layoutDayTimeline([
    { id: "a", startMin: 9 * 60, endMin: 10 * 60 },
    { id: "b", startMin: 9 * 60, endMin: 10 * 60 },
  ]);
  const a = findBlock(out, "a")!;
  const b = findBlock(out, "b")!;
  assert(approx(a.segments[0].widthPct, 50), "full overlap a → 50%");
  assert(approx(b.segments[0].widthPct, 50), "full overlap b → 50%");
  // a 在 b 前面（startMin 相同，endMin 相同 → 稳定排序中 a 仍在前）
  assert(approx(a.segments[0].leftPct, 0), "full overlap a → left=0");
  assert(approx(b.segments[0].leftPct, 50), "full overlap b → left=50");
}

// Case 5: 三个事件阶梯式重叠（A 跨越全程，B 中段，C 后段）
//         A: 0-3h (duration=180), B: 1-2h (duration=60), C: 2.5-3h (duration=30)
//         active sets (full duration 比例):
//         [0, 1]: A only → A 100%
//         [1, 2]: A+B (180+60=240) → A 75%, B 25%
//         [2, 2.5]: A only → A 100%
//         [2.5, 3]: A+C (180+30=210) → A 85.7%, C 14.3%
{
  const out = layoutDayTimeline([
    { id: "a", startMin: 0, endMin: 180 },
    { id: "b", startMin: 60, endMin: 120 },
    { id: "c", startMin: 150, endMin: 180 },
  ]);
  const a = findBlock(out, "a")!;
  const b = findBlock(out, "b")!;
  const c = findBlock(out, "c")!;

  assert(a.segments.length === 4, `A has 4 segments (got ${a.segments.length})`);
  assert(approx(a.segments[0].widthPct, 100), "A[0,1] = 100%");
  assert(approx(a.segments[1].widthPct, 75, 0.5), `A[1,2] = 75% (got ${a.segments[1].widthPct.toFixed(2)})`);
  assert(approx(a.segments[2].widthPct, 100), "A[2,2.5] = 100%");
  assert(approx(a.segments[3].widthPct, 180 / 210 * 100, 0.5), `A[2.5,3] = 85.7% (got ${a.segments[3].widthPct.toFixed(2)})`);

  assert(b.segments.length === 1, `B has 1 segment (got ${b.segments.length})`);
  assert(approx(b.segments[0].widthPct, 25, 0.5), `B[1,2] = 25% (got ${b.segments[0].widthPct.toFixed(2)})`);
  assert(approx(b.segments[0].leftPct, 75, 0.5), `B left = 75% (got ${b.segments[0].leftPct.toFixed(2)})`);

  assert(c.segments.length === 1, `C has 1 segment (got ${c.segments.length})`);
  assert(approx(c.segments[0].widthPct, 30 / 210 * 100, 0.5), `C[2.5,3] = 14.3% (got ${c.segments[0].widthPct.toFixed(2)})`);
  assert(approx(c.segments[0].leftPct, 180 / 210 * 100, 0.5), `C left = 85.7% (got ${c.segments[0].leftPct.toFixed(2)})`);

  // 不变量
  for (const block of [a, b, c]) {
    for (const s of block.segments) {
      assert(s.widthPct > 0 && s.widthPct <= 100, `width in (0, 100] (got ${s.widthPct})`);
      assert(s.leftPct >= 0 && s.leftPct < 100, `left in [0, 100) (got ${s.leftPct})`);
    }
  }
}

// Case 6: 参考图复刻（A 长任务 + 多个短任务）
//         A: 8:45-15:45 (7h = 420min)
//         B: 10:00-12:30 (2.5h = 150min)
//         C: 11:00-13:00 (2h = 120min)
//         D: 11:00-13:00 (2h)
//         E: 12:30-13:00 (30min)
//         F: 12:00-13:00 (1h = 60min)
//         G: 12:00-13:00 (1h)
//         total = 420+150+120+120+30+60+60 = 960 min
//         各 active 区间内宽度应按 duration 比例
{
  const out = layoutDayTimeline([
    { id: "a", startMin: 8 * 60 + 45, endMin: 15 * 60 + 45 }, // 8:45-15:45
    { id: "b", startMin: 10 * 60, endMin: 12 * 60 + 30 }, // 10:00-12:30
    { id: "c", startMin: 11 * 60, endMin: 13 * 60 },
    { id: "d", startMin: 11 * 60, endMin: 13 * 60 },
    { id: "e", startMin: 12 * 60 + 30, endMin: 13 * 60 },
    { id: "f", startMin: 12 * 60, endMin: 13 * 60 },
    { id: "g", startMin: 12 * 60, endMin: 13 * 60 },
  ]);
  const a = findBlock(out, "a")!;

  // A 在各时段的宽度：
  // [8:45, 10:00] A only → 100%
  // [10:00, 11:00] A+B → A 420/570, B 150/570
  // [11:00, 12:00] A+B+C+D → A 420/810, B 150/810, C 120/810, D 120/810
  // [12:00, 12:30] A+B+C+D+F+G → A 420/930, B 150/930, C 120/930, D 120/930, F 60/930, G 60/930
  // [12:30, 13:00] A+C+D+E+F+G (B ended) → A 420/810, C 120/810, D 120/810, E 30/810, F 60/810, G 60/810
  // [13:00, 15:45] A only → 100%
  assert(a.segments.length === 6, `A has 6 segments (got ${a.segments.length})`);

  // 第一个 segment：8:45-10:00, 100%
  assert(approx(a.segments[0].widthPct, 100), `[8:45,10:00] A=100%`);
  assert(approx(a.segments[0].topPx, (8 * 60 + 45) / 60 * 48), `topPx[0] = 8:45*48`);

  // 最后一个 segment：13:00-15:45, 100%
  assert(approx(a.segments[5].widthPct, 100), `[13:00,15:45] A=100%`);

  // [10:00, 11:00] A=420/570=73.68%
  assert(
    approx(a.segments[1].widthPct, 420 / 570 * 100, 0.5),
    `[10:00,11:00] A=73.68% (got ${a.segments[1].widthPct.toFixed(2)})`,
  );

  // [11:00, 12:00] A=420/810=51.85%
  assert(
    approx(a.segments[2].widthPct, 420 / 810 * 100, 0.5),
    `[11:00,12:00] A=51.85% (got ${a.segments[2].widthPct.toFixed(2)})`,
  );

  // [12:00, 12:30] A=420/930=45.16%
  assert(
    approx(a.segments[3].widthPct, 420 / 930 * 100, 0.5),
    `[12:00,12:30] A=45.16% (got ${a.segments[3].widthPct.toFixed(2)})`,
  );

  // [12:30, 13:00] A=420/810=51.85%
  assert(
    approx(a.segments[4].widthPct, 420 / 810 * 100, 0.5),
    `[12:30,13:00] A=51.85% (got ${a.segments[4].widthPct.toFixed(2)})`,
  );

  // 不变量：所有 event 任意 segment 的 left + width <= 100
  for (const block of out) {
    for (const s of block.segments) {
      assert(s.leftPct + s.widthPct <= 100.5, `left+width <= 100 (got ${s.leftPct + s.widthPct})`);
    }
  }
}

// Case 7: 跨午夜事件（end > 24h 等价：endMin > 24*60 时被 cap）
{
  const out = layoutDayTimeline([{ id: "x", startMin: 23 * 60, endMin: 25 * 60 }]);
  const x = findBlock(out, "x")!;
  // 实际 visible 到 24*60=1440
  assert(x.segments.length === 1, "cross-midnight has 1 segment");
  assert(approx(x.segments[0].widthPct, 100), "cross-midnight = 100%");
}

// Case 8: 边界 — 两个事件紧贴（一个结束 = 另一个开始），不算重叠
{
  const out = layoutDayTimeline([
    { id: "a", startMin: 0, endMin: 60 },
    { id: "b", startMin: 60, endMin: 120 },
  ]);
  const a = findBlock(out, "a")!;
  const b = findBlock(out, "b")!;
  assert(approx(a.segments[0].widthPct, 100), "touching A = 100%");
  assert(approx(b.segments[0].widthPct, 100), "touching B = 100%");
}

// Case 9: 合并相邻 segment（同一任务的两个连续区间位置一致时合并）
//   A: 0-60 (60min), B: 30-60 (30min), C: 60-90 (30min)
//   [0,30]: A only → A 100%
//   [30,60]: A+B (60+30=90) → A 66.67%, B 33.33%
//   A 段：[0,30] 100%, [30,60] 66.67% → 2 segment（不同 width，不合并）
{
  const out = layoutDayTimeline([
    { id: "a", startMin: 0, endMin: 60 },
    { id: "b", startMin: 30, endMin: 60 },
    { id: "c", startMin: 60, endMin: 90 },
  ]);
  const a = findBlock(out, "a")!;
  assert(a.segments.length === 2, `A has 2 segments (got ${a.segments.length})`);
  assert(approx(a.segments[0].widthPct, 100), "A[0,30] = 100%");
  assert(approx(a.segments[0].leftPct, 0), "A[0,30] left=0");
  assert(approx(a.segments[1].widthPct, 60 / 90 * 100, 0.5), `A[30,60] = 66.67% (got ${a.segments[1].widthPct.toFixed(2)})`);
  assert(approx(a.segments[1].leftPct, 0), "A[30,60] left=0");
}

// Case 10: 4 个事件同时 active（[0, 60]）→ 各 25%
{
  const out = layoutDayTimeline([
    { id: "a", startMin: 0, endMin: 60 },
    { id: "b", startMin: 0, endMin: 60 },
    { id: "c", startMin: 0, endMin: 60 },
    { id: "d", startMin: 0, endMin: 60 },
  ]);
  for (const id of ["a", "b", "c", "d"]) {
    const b = findBlock(out, id)!;
    assert(approx(b.segments[0].widthPct, 25), `${id} = 25%`);
  }
}

// ---------- 输出 ----------
console.log(`\n✅ passed: ${passed}`);
console.log(`❌ failed: ${failed}`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
