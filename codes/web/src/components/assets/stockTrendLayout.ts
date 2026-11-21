export type TrendDirection = "up" | "down" | "flat";

export type TrendLayoutSeries = {
  id: string;
  scale?: string;
  signed?: boolean;
  values: ReadonlyArray<number | null>;
};

export type TrendSegment = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  direction: TrendDirection;
};

export type TrendDot = {
  id: string;
  cx: number;
  cy: number;
  value: number;
  signed: boolean;
  direction: TrendDirection;
};

export type TrendTick = { value: number; y: number };
export type TrendDateTick = { date: string; x: number; anchor: "start" | "middle" | "end" };
export type TrendGuide = { x1: number; y1: number; x2: number; y2: number };

export type StockTrendLayout = {
  width: number;
  height: number;
  plot: { left: number; right: number; top: number; bottom: number };
  coords: { x: number }[];
  axisX: TrendGuide;
  axisY: TrendGuide;
  grid: TrendGuide[];
  dayGuides: TrendGuide[];
  yTicks: TrendTick[];
  xTicks: TrendDateTick[];
  segments: TrendSegment[];
  dots: TrendDot[];
};

const WIDTH = 720;
const HEIGHT = 236;
const PAD = { top: 14, right: 16, bottom: 32, left: 92 };
const DAY_GUIDE_CAP = 45;

export function layoutStockTrend(
  categories: readonly string[],
  series: readonly TrendLayoutSeries[],
): StockTrendLayout | null {
  if (categories.length === 0 || series.length === 0) return null;
  const grouped = new Map<string, number[]>();
  for (const item of series) {
    const key = item.scale ?? "money";
    const bucket = grouped.get(key) ?? [];
    for (const value of item.values) {
      if (value != null) bucket.push(value);
    }
    grouped.set(key, bucket);
  }
  if ([...grouped.values()].every((values) => values.length === 0)) return null;

  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const yFor = new Map<string, (value: number) => number>();
  const domains = new Map<string, { min: number; max: number }>();
  for (const [key, values] of grouped) {
    const bounds = domain(values.length > 0 ? values : [0]);
    domains.set(key, bounds);
    const span = bounds.max - bounds.min;
    yFor.set(key, (value) => PAD.top + (1 - (value - bounds.min) / span) * innerH);
  }
  const coords = categories.map((_, index) => ({
    x: categories.length === 1 ? PAD.left + innerW / 2 : PAD.left + (index / (categories.length - 1)) * innerW,
  }));
  const bottom = HEIGHT - PAD.bottom;
  const plot = { left: PAD.left, right: WIDTH - PAD.right, top: PAD.top, bottom };
  const segments: TrendSegment[] = [];
  const dots: TrendDot[] = [];
  for (const item of series) {
    const yOf = yFor.get(item.scale ?? "money");
    if (!yOf) continue;
    let previous: { index: number; x: number; y: number; value: number } | null = null;
    const placed: { index: number; x: number; y: number; value: number }[] = [];
    coords.forEach((point, index) => {
      const value = item.values[index];
      if (value == null) {
        previous = null;
        return;
      }
      const current = { index, x: point.x, y: yOf(value), value };
      const previousDate = previous == null ? undefined : categories[previous.index];
      if (previous && previousDate && daysBetween(previousDate, categories[index]) === 1) {
        segments.push({
          id: `${item.id}-${previous.index}-${index}`,
          x1: previous.x,
          y1: previous.y,
          x2: current.x,
          y2: current.y,
          direction: direction(previous.value, value),
        });
      }
      placed.push(current);
      previous = current;
    });
    for (const point of placed) {
      const incoming = segments.find((segment) => segment.id === `${item.id}-${point.index - 1}-${point.index}`);
      const outgoing = segments.find((segment) => segment.id.startsWith(`${item.id}-${point.index}-`));
      dots.push({
        id: `${item.id}-${point.index}`,
        cx: point.x,
        cy: point.y,
        value: point.value,
        signed: item.signed === true,
        direction: incoming?.direction ?? outgoing?.direction ?? "flat",
      });
    }
  }

  const axisScale = domains.has("money") ? "money" : [...domains.keys()][0];
  const axisDomain = axisScale ? domains.get(axisScale) : undefined;
  const yOfAxis = axisScale ? yFor.get(axisScale) : undefined;
  const yTicks =
    axisDomain && yOfAxis
      ? tickValues(axisDomain.min, axisDomain.max).map((value) => ({ value, y: yOfAxis(value) }))
      : [];
  const grid = yTicks.map((tick) => ({ x1: plot.left, y1: tick.y, x2: plot.right, y2: tick.y }));
  const xTicks = categories.flatMap((date, index) => {
    const point = coords[index];
    if (!point) return [];
    const anchor = index === 0 ? "start" : index === categories.length - 1 ? "end" : "middle";
    return [{ date, x: point.x, anchor }];
  });
  const guideStep = categories.length <= DAY_GUIDE_CAP ? 1 : Math.ceil(categories.length / DAY_GUIDE_CAP);
  const guideIndexes = categories.flatMap((_, index) => (index % guideStep === 0 ? [index] : []));
  const dayGuides = guideIndexes.flatMap((index) => {
    const point = coords[index];
    if (!point) return [];
    return [{ x1: point.x, y1: plot.top, x2: point.x, y2: plot.bottom }];
  });

  return {
    width: WIDTH,
    height: HEIGHT,
    plot,
    coords,
    axisX: { x1: plot.left, y1: plot.bottom, x2: plot.right, y2: plot.bottom },
    axisY: { x1: plot.left, y1: plot.top, x2: plot.left, y2: plot.bottom },
    grid,
    dayGuides,
    yTicks,
    xTicks,
    segments,
    dots,
  };
}

export function trendDirection(previous: number, next: number): TrendDirection {
  return direction(previous, next);
}

/** Whole calendar days from `start` to `end`. Unparseable dates do not count as adjacent. */
export function daysBetween(start: string, end: string): number | null {
  const left = Date.parse(`${start}T00:00:00Z`);
  const right = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(left) || Number.isNaN(right)) return null;
  return Math.round((right - left) / 86_400_000);
}

function direction(previous: number, next: number): TrendDirection {
  if (next > previous) return "up";
  if (next < previous) return "down";
  return "flat";
}

function domain(values: number[]) {
  let min = Math.min(0, ...values);
  let max = Math.max(0, ...values);
  if (min === max) {
    min -= 1;
    max += 1;
  } else {
    const slack = (max - min) * 0.08;
    min -= slack;
    max += slack;
  }
  return { min, max };
}

function tickValues(min: number, max: number): number[] {
  const span = max - min;
  if (!Number.isFinite(span) || span === 0) return [min];
  const step = niceStep(span, 4);
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= max + step * 0.001; value += step) {
    const snapped = Math.abs(value) <= step * 1e-6 ? 0 : Math.round(value / step) * step;
    if (snapped >= min - step * 0.001 && snapped <= max + step * 0.001 && !ticks.includes(snapped)) {
      ticks.push(snapped);
    }
  }
  if (min < 0 && max > 0 && !ticks.includes(0)) ticks.push(0);
  return ticks.sort((a, b) => a - b);
}

function niceStep(span: number, count: number): number {
  const rough = span / Math.max(1, count - 1);
  const power = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / power;
  const nice = fraction >= 7.5 ? 10 : fraction >= 3.5 ? 5 : fraction >= 1.5 ? 2 : 1;
  return nice * power;
}
