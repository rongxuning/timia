import type { TrendSeries } from "@/components/assets/StockTrendChart";
import type { StockDetail, StockSeriesPosition } from "@/types/api/views/stock";

export type SummaryTrendLabels = {
  netAssets: string;
  totalCost: string;
  marketValue: string;
  cash: string;
  liability: string;
  gain: string;
};

export type PositionTrendLabels = {
  marketValue: string;
  costPrice: string;
  shareCount: string;
  totalPnl: string;
  periodPnl: string;
};

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
      line("liability", labels.liability, "text-error", detail.series.map((point) => point.liability_minor)),
      line("gain", labels.gain, "text-warning", detail.series.map((point) => point.gain_minor)),
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
  const categories = detail.series.map((point) => point.as_of);
  const points = detail.series.map(
    (point) => point.positions.find((item) => item.id === positionId) ?? null,
  );
  return {
    categories,
    series: [
      metric("market", labels.marketValue, "text-primary", "money", points, (item) => item.market_value_minor, (value) =>
        value == null ? MISSING : format.money(value),
      ),
      metric("cost", labels.costPrice, "text-indigo-600", "quote", points, (item) => item.cost_price_minor, (value) =>
        value == null ? MISSING : format.quote(value),
      ),
      metric("shares", labels.shareCount, "text-text-secondary", "count", points, (item) => item.shares, (value) =>
        value == null ? MISSING : format.shares(value),
      ),
      metric("total", labels.totalPnl, "text-success", "money", points, (item) => item.total_pnl_minor, (value) =>
        value == null ? MISSING : format.money(value),
      ),
      metric("period", labels.periodPnl, "text-error", "money", points, (item) => item.period_pnl_minor, (value) =>
        value == null ? MISSING : format.money(value),
      ),
    ],
  };
}

function line(id: string, label: string, tone: string, values: number[]): TrendSeries {
  return { id, label, tone, scale: "money", values };
}

function metric(
  id: string,
  label: string,
  tone: string,
  scale: string,
  points: Array<StockSeriesPosition | null>,
  read: (item: StockSeriesPosition) => number | null,
  formatValue: (value: number | null) => string,
): TrendSeries {
  return {
    id,
    label,
    tone,
    scale,
    values: points.map((item) => (item ? read(item) : null)),
    formatValue,
  };
}
