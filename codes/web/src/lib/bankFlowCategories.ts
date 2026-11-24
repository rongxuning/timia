import type { BankFlowDirection } from "@/types/api/views/bank";

const EXPENSE = [
  "dining",
  "transport",
  "shopping",
  "housing",
  "utilities",
  "medical",
  "education",
  "entertainment",
  "social",
  "travel",
  "other",
] as const;

const INCOME = [
  "salary",
  "bonus",
  "investment",
  "interest",
  "side_job",
  "reimbursement",
  "gift",
  "refund",
  "rent",
  "transfer_in",
  "other",
] as const;

export type BankFlowCategory = (typeof EXPENSE)[number] | (typeof INCOME)[number];

export const BANK_FLOW_CATEGORIES: Record<BankFlowDirection, readonly BankFlowCategory[]> = {
  expense: EXPENSE,
  income: INCOME,
};
