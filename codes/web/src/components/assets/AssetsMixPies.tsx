"use client";

import { useTranslations } from "next-intl";

export type MixSlice = {
  key: string;
  label: string;
  amount: number;
  fill?: string;
};

const ASSET_FILLS = ["fill-primary", "fill-success", "fill-indigo-400", "fill-indigo-200", "fill-zinc-400"];
const LIABILITY_FILLS = ["fill-error", "fill-red-300", "fill-zinc-400"];

type AssetsMixPiesProps = {
  netWorth: number;
  assets: number;
  liabilities: number;
  assetSlices: MixSlice[];
  liabilitySlices: MixSlice[];
  locale: string;
  formatMoney: (amountMinor: number) => string;
};

export function AssetsMixPies({
  netWorth,
  assets,
  liabilities,
  assetSlices,
  liabilitySlices,
  locale,
  formatMoney,
}: AssetsMixPiesProps) {
  const t = useTranslations("assets");
  const netSlices: MixSlice[] = [];
  if (netWorth > 0) {
    netSlices.push({ key: "net", label: t("summary.netWorth"), amount: netWorth, fill: "fill-primary" });
  }
  if (liabilities > 0) {
    netSlices.push({ key: "debt", label: t("summary.liabilities"), amount: liabilities, fill: "fill-error" });
  }

  return (
    <section className="grid gap-3 lg:grid-cols-3">
      <PieCard
        title={t("summary.netWorth")}
        total={netWorth}
        slices={netSlices}
        locale={locale}
        formatMoney={formatMoney}
      />
      <PieCard
        title={t("summary.assets")}
        total={assets}
        slices={paint(assetSlices, ASSET_FILLS)}
        locale={locale}
        formatMoney={formatMoney}
      />
      <PieCard
        title={t("summary.liabilities")}
        total={liabilities}
        slices={paint(liabilitySlices, LIABILITY_FILLS)}
        locale={locale}
        formatMoney={formatMoney}
      />
    </section>
  );
}

function PieCard({
  title,
  total,
  slices,
  locale,
  formatMoney,
}: {
  title: string;
  total: number;
  slices: MixSlice[];
  locale: string;
  formatMoney: (amountMinor: number) => string;
}) {
  const drawn = slices.filter((slice) => slice.amount > 0);
  const sum = drawn.reduce((totalAmount, slice) => totalAmount + slice.amount, 0);
  return (
    <article className="rounded-xl border border-border-subtle bg-white p-lg">
      <h2 className="text-overline text-neutral-muted">{title}</h2>
      <div className="mt-3 flex items-center gap-4">
        <Donut slices={drawn} label={title} />
        <p className="min-w-0 text-xl tabular-nums text-text-primary">{formatMoney(total)}</p>
      </div>
      {drawn.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {drawn.map((slice) => (
            <li key={slice.key} className="flex items-center justify-between gap-2 text-caption">
              <span className="flex min-w-0 items-center gap-2 text-text-secondary">
                <span className={`h-2 w-2 shrink-0 rounded-full ${(slice.fill ?? "fill-primary").replace("fill-", "bg-")}`} />
                <span className="truncate">{slice.label}</span>
              </span>
              <span className="shrink-0 tabular-nums text-text-primary">
                {formatShare(slice.amount / sum, locale)} {formatMoney(slice.amount)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function Donut({ slices, label }: { slices: MixSlice[]; label: string }) {
  const sum = slices.reduce((total, slice) => total + slice.amount, 0);
  if (sum <= 0) return <div className="h-24 w-24 shrink-0" aria-hidden />;
  const size = 96;
  const center = 48;
  const outer = 40;
  const inner = 24;
  let angle = -Math.PI / 2;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-24 w-24 shrink-0" role="img" aria-label={label}>
      {slices.map((slice) => {
        const sweep = (slice.amount / sum) * Math.PI * 2;
        const start = angle;
        const end = angle + sweep;
        angle = end;
        const path = sweep >= Math.PI * 2 - 0.0001 ? fullRing(center, outer, inner) : ring(center, outer, inner, start, end);
        return <path key={slice.key} d={path} fillRule="evenodd" className={slice.fill ?? "fill-primary"} />;
      })}
    </svg>
  );
}

function ring(center: number, outer: number, inner: number, start: number, end: number): string {
  const large = end - start > Math.PI ? 1 : 0;
  const [x1, y1] = polar(center, outer, start);
  const [x2, y2] = polar(center, outer, end);
  const [x3, y3] = polar(center, inner, end);
  const [x4, y4] = polar(center, inner, start);
  return `M ${x1} ${y1} A ${outer} ${outer} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${inner} ${inner} 0 ${large} 0 ${x4} ${y4} Z`;
}

function fullRing(center: number, outer: number, inner: number): string {
  return `M ${center - outer} ${center} A ${outer} ${outer} 0 1 1 ${center + outer} ${center} A ${outer} ${outer} 0 1 1 ${center - outer} ${center} M ${center - inner} ${center} A ${inner} ${inner} 0 1 0 ${center + inner} ${center} A ${inner} ${inner} 0 1 0 ${center - inner} ${center}`;
}

function polar(center: number, radius: number, angle: number): [number, number] {
  return [center + radius * Math.cos(angle), center + radius * Math.sin(angle)];
}

function paint(slices: MixSlice[], fills: string[]): MixSlice[] {
  return slices.map((slice, index) => ({ ...slice, fill: fills[index % fills.length] }));
}

function formatShare(share: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(share);
}

export function categorySlices(
  groups: Array<{ kind: string; category: string; display_minor: number }>,
  kind: "asset" | "liability",
  labelFor: (category: string) => string,
): MixSlice[] {
  return groups
    .filter((group) => group.kind === kind && group.display_minor > 0)
    .map((group) => ({
      key: group.category,
      label: labelFor(group.category),
      amount: group.display_minor,
    }));
}
