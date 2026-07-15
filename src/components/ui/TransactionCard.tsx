import { Pencil, Trash2 } from "lucide-react";
import type { Category, Transaction } from "../../domain";
import { formatVnd } from "../../domain";
import { Card } from "./Card";

type TransactionCardProps = {
  transaction: Transaction;
  category?: Category;
  onEdit: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
};

function categorySymbol(transaction: Transaction, category?: Category) {
  if (transaction.kind === "transfer") return "⇄";
  if (category?.icon === "Utensils") return "🍜";
  if (category?.icon === "Car") return "🚗";
  if (category?.icon === "House") return "🏠";
  if (category?.icon === "ShoppingBag") return "🛍";
  return transaction.kind === "income" ? "↗" : "↘";
}

function sourceLabel(transaction: Transaction) {
  if (transaction.installmentId) return "Trả góp";
  if (transaction.debtPaymentId) return "Công nợ";
  if (transaction.recurringRuleId) return "Lặp lại";
  return "";
}

export function TransactionCard({ transaction, category, onEdit, onDelete }: TransactionCardProps) {
  const isTransfer = transaction.kind === "transfer";
  const source = sourceLabel(transaction);
  const title = isTransfer ? "Chuyển ví" : category?.name ?? "Không rõ";

  return (
    <Card className="transaction">
      <div
        className="category-icon"
        style={{ background: `${category?.color ?? "#64748b"}22`, color: category?.color ?? "#64748b" }}
        aria-hidden="true"
      >
        {categorySymbol(transaction, category)}
      </div>
      <button className="transaction-main transaction-edit" onClick={() => onEdit(transaction.id)} aria-label={`Sửa ${title}`}>
        <span className="transaction-title-line">
          <strong>{title}</strong>
          {source && <small className="source-badge">{source}</small>}
        </span>
        <span className="transaction-note">{transaction.note || "Không có ghi chú"}</span>
      </button>
      <div className={transaction.kind === "income" ? "amount income" : transaction.kind === "expense" ? "amount expense" : "amount"}>
        {transaction.kind === "income" ? "+" : transaction.kind === "expense" ? "−" : "⇄ "}
        {formatVnd(transaction.amount)}
      </div>
      <div className="transaction-actions">
        <button className="icon-button subtle" aria-label={`Sửa ${title}`} onClick={() => onEdit(transaction.id)}>
          <Pencil size={16} />
        </button>
        <button
          className="icon-button subtle delete-button"
          aria-label={`Xóa ${title}`}
          onClick={() => {
            if (window.confirm(`Xóa giao dịch ${title}?`)) void onDelete(transaction.id);
          }}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </Card>
  );
}
