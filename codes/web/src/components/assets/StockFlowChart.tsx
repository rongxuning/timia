"use client";

import {
  layoutStockFlow,
  STOCK_FLOW_BAR,
  STOCK_FLOW_COLUMNS,
  stockFlowGraph,
  type FlowTone,
  type StockFlowLabels,
  type StockFlowNumbers,
} from "@/components/assets/stockFlow";

const FILL: Record<FlowTone, string> = {
  asset: "fill-primary",
  cost: "fill-indigo-600",
  deduct: "fill-error",
  gain: "fill-success",
};

type StockFlowChartProps = {
  numbers: StockFlowNumbers;
  labels: StockFlowLabels;
  headers: [string, string, string, string];
  format: (value: number) => string;
};

export function StockFlowChart({ numbers, labels, headers, format }: StockFlowChartProps) {
  const graph = stockFlowGraph(numbers, labels, format);
  const laid = layoutStockFlow(graph.nodes, graph.links);
  return (
    <svg
      viewBox={`0 0 ${laid.width} ${laid.height}`}
      role="img"
      aria-label={headers.join(" ")}
      className="h-auto w-full font-body"
    >
      {headers.map((header, index) => (
        <text
          key={header}
          x={STOCK_FLOW_COLUMNS[index] + STOCK_FLOW_BAR / 2}
          y={16}
          textAnchor="middle"
          className="fill-current text-[11px] text-text-secondary"
        >
          {header}
        </text>
      ))}
      {laid.links.map((link) => (
        <path key={`${link.source}-${link.target}`} d={link.d} className={`${FILL[link.tone]} opacity-35`} />
      ))}
      {laid.nodes.map((node) => (
        <g key={node.id}>
          <rect x={node.x} y={node.y} width={STOCK_FLOW_BAR} height={node.h} rx={2} className={FILL[node.tone]} />
          <text
            x={node.column === 0 ? node.x - 8 : node.x + STOCK_FLOW_BAR + 8}
            y={node.y + node.h / 2 - 2}
            textAnchor={node.column === 0 ? "end" : "start"}
            className="fill-current text-[12px] font-medium text-text-primary"
          >
            {node.name}
          </text>
          <text
            x={node.column === 0 ? node.x - 8 : node.x + STOCK_FLOW_BAR + 8}
            y={node.y + node.h / 2 + 12}
            textAnchor={node.column === 0 ? "end" : "start"}
            className="fill-current text-[11px] text-text-secondary"
          >
            {node.amount}
          </text>
        </g>
      ))}
    </svg>
  );
}
