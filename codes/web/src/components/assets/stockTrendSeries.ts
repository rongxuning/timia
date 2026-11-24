import type { TrendSeries } from "@/components/assets/StockTrendChart";
import type { StockDetail, StockSeriesPosition } from "@/types/api/views/stock";

export type SummaryTrendLabels = {
  netAssets: string;
  totalCost: string;
  marketValue: string;
  cash: string;
  frozen: string;
  liability: string;
  gain: string;
};

export type PositionTrendLabels = {
  marketValue: string;
  costPrice: string;
  shareCount: string;
  totalPnl: string;
  periodPnl: string;
  profit: string;
  loss: string;
};

/** Golden yellow that still clears 3:1 on white. Theme warning (#F59E0B) does not. */
const SHARE_TONE = "text-[#C88800]";

export type PositionTrendFormat = {
  money: (amount: number) => string;
  quote: (amount: number) => string;
  shares: (count: number) => string;
};

const MISSING = "—";

/** Days with a value and no valued neighbor. A lone path command draws nothing, so these need a dot. */
export function isolatedValueIndexes(values: readonly (number | null)[]): number[] {
  const indexes: number[] = [];
  values.forEach((value, index) => {
    if (value == null) return;
    const before = index > 0 && values[index - 1] != null;
    const after = index + 1 < values.length && values[index + 1] != null;
    if (!before && !after) indexes.push(index);
  });
  return indexes;
}

export function summaryTrend(
  detail: StockDetail | null,
  labels: SummaryTrendLabels,
): { categories: string[]; series: TrendSeries[] } | null {
  if (!detail || detail.series.length === 0) return null;
  const categories = detail.series.map((point) => point.as_of);
  return {
    categories,
    series: [
      line("net", labels.netAssets, "text-primary", detail.series.map((point) => point.net_assets_minor)),
      line("cost", labels.totalCost, "text-indigo-600", detail.series.map((point) => point.total_cost_minor)),
      line("market", labels.marketValue, "text-success", detail.series.map((point) => point.market_value_minor)),
      line("cash", labels.cash, "text-text-secondary", detail.series.map((point) => point.cash_minor)),
      line("frozen", labels.frozen, "text-indigo-500", detail.series.map((point) => point.frozen_minor)),
      // 总负债 = 净总资产 − 总成本，仅当为负时展示其绝对值。
      line(
        "liability",
        labels.liability,
        "text-error",
        detail.series.map((point) => (point.liability_minor < 0 ? -point.liability_minor : null)),
      ),
      // 总收益 = 总现金 − 总成本，仅当非负时展示。
      line(
        "gain",
        labels.gain,
        "text-warning",
        detail.series.map((point) => (point.gain_minor >= 0 ? point.gain_minor : null)),
      ),
    ],
  };
}

export function positionTrend(
  detail: StockDetail,
  positionId: string,
  labels: PositionTrendLabels,
  format: PositionTrendFormat,
): { categories: string[]; series: TrendSeries[] } | null {
  if (detail.series.length === 0) return null;
  // Only days this position was marked — no carry-forward nodes.
  const points = detail.series.flatMap((point) => {
    const item = point.positions.find((row) => row.id === positionId);
    return item ? [{ date: point.as_of, item }] : [];
  });
  if (points.length === 0) return null;
  const categories = points.map((point) => point.date);
  const rows = points.map((point) => point.item);
  return {
    categories,
    series: [
      metric(
        "market",
        labels.marketValue,
        "text-primary",
        "money",
        rows,
        (item) => item.market_value_minor,
        (value) => (value == null ? MISSING : format.money(value)),
        { drawn: false },
      ),
      metric(
        "cost",
        labels.costPrice,
        "text-text-primary",
        "quote",
        rows,
        (item) => item.cost_price_minor,
        (value) => (value == null ? MISSING : format.quote(value)),
        { paint: "solid", key: [{ tone: "text-text-primary" }] },
      ),
      metric(
        "shares",
        labels.shareCount,
        SHARE_TONE,
        "count",
        rows,
        (item) => item.shares,
        (value) => (value == null ? MISSING : format.shares(value)),
        { paint: "solid", readout: "text-text-secondary", dash: "6 4", key: [{ tone: SHARE_TONE }] },
      ),
      metric(
        "total",
        labels.totalPnl,
        "text-text-secondary",
        "money",
        rows,
        (item) => item.total_pnl_minor,
        (value) => (value == null ? MISSING : format.money(value)),
        {
          signed: true,
          paint: "signed",
          key: [
            { tone: "text-error", label: labels.profit },
            { tone: "text-success", label: labels.loss },
          ],
        },
      ),
      metric(
        "period",
        labels.periodPnl,
        "text-text-secondary",
        "money",
        rows,
        (item) => item.period_pnl_minor,
        (value) => (value == null ? MISSING : format.money(value)),
        { signed: true, drawn: false },
      ),
    ],
  };
}

function line(id: string, label: string, tone: string, values: Array<number | null>): TrendSeries {
  return { id, label, tone, scale: "money", values };
}

function metric(
  id: string,
  label: string,
  tone: string,
  scale: string,
  points: StockSeriesPosition[],
  read: (item: StockSeriesPosition) => number | null,
  formatValue: (value: number | null) => string,
  options: Pick<TrendSeries, "signed" | "paint" | "readout" | "key" | "drawn" | "dash"> = {},
): TrendSeries {
  return {
    id,
    label,
    tone,
    scale,
    signed: options.signed === true,
    paint: options.paint,
    readout: options.readout,
    key: options.key,
    drawn: options.drawn,
    dash: options.dash,
    values: points.map((item) => read(item)),
    formatValue,
  };
}
