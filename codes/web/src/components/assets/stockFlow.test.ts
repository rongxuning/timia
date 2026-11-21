import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { layoutStockFlow, stockFlowGraph, type StockFlowLabels, type StockFlowNumbers } from "./stockFlow.ts";

const labels: StockFlowLabels = {
  netAssets: "净总资产",
  totalCost: "总成本",
  totalAssets: "总资产",
  marketValue: "总市值",
  cash: "总现金",
  liability: "总负债",
  gain: "总收益",
  bankIn: "银行转证券",
  bankOut: "证券转银行",
};

function numbers(overrides: Partial<StockFlowNumbers> = {}): StockFlowNumbers {
  return {
    netAssets: 500,
    totalCost: 700,
    totalAssets: 500,
    marketValue: 200,
    cash: 300,
    liability: -200,
    showLiability: true,
    gain: -400,
    showGain: false,
    bankIn: 800,
    bankOut: 100,
    positions: [{ id: "a", name: "茅台", value: 200 }],
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
});
