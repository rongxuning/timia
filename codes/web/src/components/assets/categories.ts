export const ASSET_CATEGORIES = [
  "cash",
  "investment",
  "property",
  "durable",
  "receivable",
  "other_asset",
] as const;

export const LIABILITY_CATEGORIES = [
  "credit",
  "installment",
  "mortgage",
  "payable",
  "other_liability",
] as const;

export type AssetKind = "asset" | "liability";
export type AssetCategory = (typeof ASSET_CATEGORIES)[number] | (typeof LIABILITY_CATEGORIES)[number];

export function categoriesFor(kind: AssetKind): readonly AssetCategory[] {
  return kind === "asset" ? ASSET_CATEGORIES : LIABILITY_CATEGORIES;
}

const CATEGORY_BAR: Record<AssetCategory, string> = {
  cash: "bg-primary",
  investment: "bg-indigo-400",
  property: "bg-indigo-200",
  durable: "bg-zinc-400",
  receivable: "bg-zinc-300",
  other_asset: "bg-zinc-200",
  credit: "bg-red-500",
  installment: "bg-red-400",
  mortgage: "bg-red-300",
  payable: "bg-red-200",
  other_liability: "bg-zinc-300",
};

export function categoryBarClass(category: string): string {
  return CATEGORY_BAR[category as AssetCategory] ?? "bg-zinc-300";
}
