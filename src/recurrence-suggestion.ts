import type { Frequency, Transaction } from "./domain";

/** Suggests, but never automatically enables, a repeating transaction rule. */
export function suggestRecurringFrequency(candidate: Pick<Transaction, "kind" | "categoryId" | "amount">, transactions: Transaction[]): Frequency | null {
  const same = transactions
    .filter(transaction => transaction.kind === candidate.kind && transaction.categoryId === candidate.categoryId)
    .filter(transaction => Math.abs(transaction.amount - candidate.amount) <= Math.max(1_000, candidate.amount * 0.15))
    .map(transaction => transaction.date)
    .sort();
  if (same.length < 2) return null;
  const dates = same.slice(-3).map(date => new Date(`${date}T00:00:00Z`).getTime());
  const gaps = dates.slice(1).map((date, index) => Math.round((date - dates[index]) / 86_400_000));
  const averageGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  if (averageGap <= 2) return "daily";
  if (averageGap >= 5 && averageGap <= 9) return "weekly";
  if (averageGap >= 25 && averageGap <= 35) return "monthly";
  return null;
}
