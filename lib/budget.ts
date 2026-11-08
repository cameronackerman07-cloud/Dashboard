// Suggested categories for Pay & budget. Any text works; these just fill the
// dropdown suggestions.
export const EXPENSE_CATEGORIES = [
  "Food",
  "Transport",
  "Phone",
  "Entertainment",
  "Clothes",
  "Gifts",
  "School",
  "Sport",
  "Subscriptions",
  "Other",
];

export const INCOME_CATEGORIES = ["Shift pay", "Pocket money", "Gift", "Other"];

export const SHIFT_PAY_CATEGORY = "Shift pay";

export type Transaction = {
  id: string;
  type: "income" | "expense";
  amount_cents: number;
  category: string;
  note: string | null;
  occurred_on: string;
};

export type BudgetLimit = { id: string; category: string; monthly_limit_cents: number };
export type SavingsGoal = { id: string; name: string; target_cents: number; saved_cents: number };

export function cleanCategory(value: unknown): string {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 40) : "";
  return text || "Other";
}
