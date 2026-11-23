import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  layoutStockFlow,
  marketShareLabel,
  signedFlowTone,
  stockFlowGraph,
  type StockFlowLabels,
  type StockFlowNumbers,
} from "./stockFlow.ts";

const labels: StockFlowLabels = {
  netAssets: "净总资产",
  totalCost: "总成本",
  totalAssets: "总资产",
  marketValue: "总市值",
  cash: "总现金",
  frozen: "冻结资金",
  liability: "总负债",
  gain: "总收益",
  bankIn: "银行转证券",
  bankOut: "证券转银行",
  floating: "浮盈亏",
};

function numbers(overrides: Partial<StockFlowNumbers> = {}): StockFlowNumbers {
  return {
    netAssets: 500,
    totalCost: 700,
    totalAssets: 500,
    marketValue: 200,
    cash: 300,
    frozen: 0,
    liability: -200,
    showLiability: true,
    gain: -400,
    showGain: false,
    bankIn: 800,
    bankOut: 100,
    positions: [{ id: "a", name: "茅台", value: 200, pnl: 10, share: "100.00%" }],
    ...overrides,
  };
}

describe("stockFlowGraph", () => {
  it("hides a non-negative liability and a negative gain", () => {
    const graph = stockFlowGraph(
      numbers({ showLiability: false, liability: 10, showGain: false, gain: -1, positions: [] }),
      labels,
      String,
    );
    assert.equal(graph.nodes.some((node) => node.id === "liability"), false);
    assert.equal(graph.nodes.some((node) => node.id === "gain"), false);
    assert.equal(graph.links.some((link) => link.target === "pos-a"), false);
  });

  it("keeps the liability under net assets and draws each stock", () => {
    const graph = stockFlowGraph(numbers(), labels, String);
    const laid = layoutStockFlow(graph.nodes, graph.links);
    const net = laid.nodes.find((node) => node.id === "net");
    const liability = laid.nodes.find((node) => node.id === "liability");
    assert.ok(net && liability);
    assert.ok(liability.y >= net.y + net.h);
    assert.equal(laid.links.some((link) => link.target === "pos-a"), true);
    assert.equal(laid.nodes.some((node) => node.id === "gain"), false);
  });

  it("colors a gain red, a loss green, and a flat holding neutral", () => {
    const graph = stockFlowGraph(
      numbers({
        marketValue: 200,
        positions: [
          { id: "up", name: "盈", value: 150, pnl: 20, share: "75.00%" },
          { id: "down", name: "亏", value: 50, pnl: -10, share: "25.00%" },
          { id: "flat", name: "平", value: 0, pnl: 0, share: "0.00%" },
          { id: "unknown", name: "未知", value: 0, pnl: null, share: "—" },
        ],
      }),
      labels,
      String,
    );
    const tone = (id: string) => graph.nodes.find((node) => node.id === id)?.tone;
    assert.equal(tone("pos-up"), "profit");
    assert.equal(tone("pos-down"), "loss");
    assert.equal(tone("pos-flat"), "flat");
    assert.equal(tone("pos-unknown"), "flat");
    assert.equal(graph.nodes.find((node) => node.id === "pos-up")?.amount, "150 · 75.00%");
    assert.equal(graph.links.find((link) => link.target === "pos-down")?.tone, "loss");
  });

  it("paints cash and securities-to-bank yellow, and always shows floating pnl", () => {
    const graph = stockFlowGraph(numbers({ netAssets: 800, totalCost: 500, showLiability: false }), labels, String);
    const laid = layoutStockFlow(graph.nodes, graph.links);
    assert.equal(graph.nodes.find((node) => node.id === "cash")?.tone, "cash");
    assert.equal(graph.nodes.find((node) => node.id === "bankOut")?.tone, "cash");
    assert.equal(graph.links.find((link) => link.target === "cash")?.tone, "cash");
    assert.equal(graph.links.find((link) => link.target === "bankOut")?.tone, "cash");
    const cost = laid.nodes.find((node) => node.id === "cost");
    const floating = laid.nodes.find((node) => node.id === "floating");
    assert.ok(cost && floating);
    assert.equal(floating.name, "浮盈亏");
    assert.equal(floating.value, 300);
    assert.equal(floating.tone, "profit");
    assert.ok(floating.y >= cost.y + cost.h);

    const loss = stockFlowGraph(numbers({ netAssets: 100, totalCost: 400 }), labels, String);
    assert.equal(loss.nodes.find((node) => node.id === "floating")?.value, -300);
    assert.equal(loss.nodes.find((node) => node.id === "floating")?.tone, "loss");
  });

  it("splits total assets into market value, cash, and frozen funds", () => {
    const graph = stockFlowGraph(
      numbers({
        netAssets: 650,
        totalAssets: 650,
        marketValue: 200,
        cash: 300,
        frozen: 150,
        showLiability: false,
        positions: [],
      }),
      labels,
      String,
    );
    assert.equal(graph.nodes.find((node) => node.id === "frozen")?.value, 150);
    assert.equal(graph.nodes.find((node) => node.id === "frozen")?.tone, "frozen");
    assert.equal(graph.links.find((link) => link.target === "frozen")?.source, "assets");
  });
});

describe("stock label spacing", () => {
  it("leaves a gap so one holding's amount does not meet the next name", () => {
    const positions = [0, 1, 2, 3].map((index) => ({
      id: String(index),
      name: "股",
      value: 1,
      pnl: 1,
      share: "1%",
    }));
    const graph = stockFlowGraph(numbers({ positions, marketValue: 4 }), labels, String);
    const laid = layoutStockFlow(graph.nodes, graph.links);
    const bars = laid.nodes.filter((node) => node.id.startsWith("pos-"));
    for (let index = 1; index < bars.length; index += 1) {
      const previous = bars[index - 1];
      const current = bars[index];
      assert.ok(previous && current);
      const previousAmount = previous.y + previous.h / 2 + 12;
      const currentNameTop = current.y + current.h / 2 - 2 - 12;
      assert.ok(currentNameTop >= previousAmount + 4);
    }
  });
});

describe("marketShareLabel", () => {
  it("formats a share of market value and leaves a zero total blank", () => {
    assert.equal(marketShareLabel(3, 4, "zh-CN"), "75.00%");
    assert.equal(marketShareLabel(1, 3, "en-US"), "33.33%");
    assert.equal(marketShareLabel(0, 0, "zh-CN"), "—");
    assert.equal(marketShareLabel(null, 100, "zh-CN"), "—");
  });
});

describe("signedFlowTone", () => {
  it("uses red for a gain and green for a loss", () => {
    assert.equal(signedFlowTone(1), "profit");
    assert.equal(signedFlowTone(-1), "loss");
    assert.equal(signedFlowTone(0), "flat");
    assert.equal(signedFlowTone(null), "flat");
  });
});
