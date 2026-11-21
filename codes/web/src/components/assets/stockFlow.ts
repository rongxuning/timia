/** Layout for the stock-account flow. Bar height follows the absolute amount. */

export type FlowTone = "asset" | "cost" | "deduct" | "gain";

export type FlowNodeInput = {
  id: string;
  name: string;
  amount: string;
  value: number;
  column: 0 | 1 | 2 | 3;
  tone: FlowTone;
};

export type FlowLinkInput = {
  source: string;
  target: string;
  tone: FlowTone;
};

export type PlacedNode = FlowNodeInput & { x: number; y: number; h: number };
export type PlacedLink = FlowLinkInput & { d: string };

export type StockFlowNumbers = {
  netAssets: number;
  totalCost: number;
  totalAssets: number;
  marketValue: number;
  cash: number;
  liability: number;
  showLiability: boolean;
  gain: number;
  showGain: boolean;
  bankIn: number;
  bankOut: number;
  positions: { id: string; name: string; value: number }[];
};

export type StockFlowLabels = {
  netAssets: string;
  totalCost: string;
  totalAssets: string;
  marketValue: string;
  cash: string;
  liability: string;
  gain: string;
  bankIn: string;
  bankOut: string;
};

export const STOCK_FLOW_COLUMNS = [112, 292, 486, 680];
const COL_X = STOCK_FLOW_COLUMNS;
const BAR_W = 10;
const TOP = 28;
const GAP = 12;
const MIN_H = 14;
const MAX_BAR = 150;

export function stockFlowGraph(
  numbers: StockFlowNumbers,
  labels: StockFlowLabels,
  format: (value: number) => string,
): { nodes: FlowNodeInput[]; links: FlowLinkInput[] } {
  const nodes: FlowNodeInput[] = [
    node("net", labels.netAssets, numbers.netAssets, 0, "asset", format),
    node("cost", labels.totalCost, numbers.totalCost, 0, "cost", format),
    node("assets", labels.totalAssets, numbers.totalAssets, 1, "asset", format),
    node("bank", labels.bankIn, numbers.bankIn, 1, "cost", format),
    node("bankOut", labels.bankOut, numbers.bankOut, 1, "deduct", format),
    node("market", labels.marketValue, numbers.marketValue, 2, "asset", format),
    node("cash", labels.cash, numbers.cash, 2, "asset", format),
  ];
  const links: FlowLinkInput[] = [
    { source: "net", target: "assets", tone: "asset" },
    { source: "assets", target: "market", tone: "asset" },
    { source: "assets", target: "cash", tone: "asset" },
    { source: "cost", target: "bank", tone: "cost" },
    { source: "cost", target: "bankOut", tone: "deduct" },
    { source: "market", target: "positions", tone: "asset" },
  ];
  if (numbers.showLiability) {
    nodes.splice(1, 0, node("liability", labels.liability, numbers.liability, 0, "deduct", format));
  }
  if (numbers.showGain) {
    nodes.push(node("gain", labels.gain, numbers.gain, 2, "gain", format));
    links.push({ source: "cash", target: "gain", tone: "gain" });
  }
  for (const position of numbers.positions) {
    nodes.push({
      id: `pos-${position.id}`,
      name: position.name,
      amount: format(position.value),
      value: position.value,
      column: 3,
      tone: "asset",
    });
    links.push({ source: "positions", target: `pos-${position.id}`, tone: "asset" });
  }
  if (numbers.positions.length === 0) {
    const index = links.findIndex((link) => link.target === "positions");
    if (index >= 0) links.splice(index, 1);
  } else {
    nodes.push(node("positions", labels.marketValue, numbers.marketValue, 2, "asset", format));
  }
  return { nodes, links };
}

function node(
  id: string,
  name: string,
  value: number,
  column: 0 | 1 | 2 | 3,
  tone: FlowTone,
  format: (value: number) => string,
): FlowNodeInput {
  return { id, name, amount: format(value), value, column, tone };
}

export function layoutStockFlow(
  nodes: FlowNodeInput[],
  links: FlowLinkInput[],
): { nodes: PlacedNode[]; links: PlacedLink[]; width: number; height: number } {
  const peak = Math.max(1, ...nodes.map((item) => Math.abs(item.value)));
  const scale = MAX_BAR / peak;
  const placed: PlacedNode[] = [];
  for (const column of [0, 1, 2, 3] as const) {
    let y = TOP;
    const columnNodes = nodes.filter((item) => item.column === column && item.id !== "positions");
    columnNodes.forEach((item, index) => {
      if (index > 0) y += sectionGap(columnNodes[index - 1].id, item.id);
      const h = Math.max(MIN_H, Math.abs(item.value) * scale);
      placed.push({ ...item, x: COL_X[column], y, h });
      y += h;
    });
  }
  const byId = new Map(placed.map((item) => [item.id, item]));
  const virtual = nodes.find((item) => item.id === "positions");
  const market = byId.get("market");
  if (virtual && market) byId.set("positions", { ...virtual, x: market.x, y: market.y, h: market.h });

  const outgoing = new Map<string, FlowLinkInput[]>();
  for (const link of links) {
    const group = outgoing.get(link.source) ?? [];
    group.push(link);
    outgoing.set(link.source, group);
  }
  const placedLinks: PlacedLink[] = [];
  for (const [sourceId, group] of outgoing) {
    const source = byId.get(sourceId);
    if (!source) continue;
    const weights = group.map((link) => Math.max(Math.abs(byId.get(link.target)?.value ?? 0), 1));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let cursor = source.y;
    group.forEach((link, index) => {
      const target = byId.get(link.target);
      if (!target || target.id === "positions") return;
      const slot = (source.h * weights[index]) / total;
      placedLinks.push({
        ...link,
        d: band(source.x + BAR_W, cursor, cursor + slot, target.x, target.y, target.y + target.h),
      });
      cursor += slot;
    });
  }
  const height = Math.max(240, ...placed.map((item) => item.y + item.h)) + 20;
  return { nodes: placed, links: placedLinks, width: 980, height };
}

function sectionGap(previousId: string, nextId: string): number {
  if (nextId === "cost" || nextId === "bank" || nextId === "gain") return GAP + 28;
  if (previousId === "net" || previousId === "liability") return GAP + 8;
  return GAP;
}

function band(x0: number, y0a: number, y0b: number, x1: number, y1a: number, y1b: number): string {
  const mid = (x0 + x1) / 2;
  return `M ${x0} ${y0a} C ${mid} ${y0a}, ${mid} ${y1a}, ${x1} ${y1a} L ${x1} ${y1b} C ${mid} ${y1b}, ${mid} ${y0b}, ${x0} ${y0b} Z`;
}

export const STOCK_FLOW_BAR = BAR_W;
