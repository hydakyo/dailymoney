import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, ReceiptText, MoreHorizontal, Calendar as CalendarIcon, List } from "lucide-react";
import type { Category, Transaction } from "../../domain";
import { formatVnd } from "../../domain";
import { addMonths, monthLabel } from "../../utils";
import { Card } from "../ui/Card";
import { CalendarView } from "./CalendarView";

export function TransactionsView({
  transactions,
  categories,
  month,
  onMonth,
  onAdd,
  onEdit,
  onDelete
}: {
  transactions: Transaction[];
  categories: Map<string, Category>;
  month: string;
  onMonth: (value: string) => void;
  onAdd: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"list" | "calendar">("list");
  
  const list = transactions
    .filter(item => item.date.startsWith(month))
    .filter(item => {
      const category = categories.get(item.categoryId)?.name ?? "";
      return `${category} ${item.note ?? ""} ${item.amount}`
        .toLocaleLowerCase("vi-VN")
        .includes(query.toLocaleLowerCase("vi-VN"));
    });

  return (
    <>
      <div className="month-switch inline">
        <button onClick={() => onMonth(addMonths(month, -1))}>
          <ChevronLeft size={18} />
        </button>
        <span>{monthLabel(month)}</span>
        <button onClick={() => onMonth(addMonths(month, 1))}>
          <ChevronRight size={18} />
        </button>
      </div>
      
      <input
        className="transaction-search"
        value={query}
        onChange={event => setQuery(event.target.value)}
        placeholder="Tìm theo danh mục, ghi chú hoặc số tiền"
        aria-label="Tìm giao dịch"
      />
      
      <button className="primary full" onClick={onAdd}>
        <Plus size={20} /> Thêm giao dịch
      </button>

      <div style={{ display: "flex", gap: "8px", padding: "0 16px", marginTop: "16px" }}>
        <button 
          className={`full ${mode === "list" ? "primary" : "soft"}`} 
          onClick={() => setMode("list")}
          style={{ flex: 1, display: "flex", justifyContent: "center", gap: "8px" }}
        >
          <List size={18} /> Danh sách
        </button>
        <button 
          className={`full ${mode === "calendar" ? "primary" : "soft"}`} 
          onClick={() => setMode("calendar")}
          style={{ flex: 1, display: "flex", justifyContent: "center", gap: "8px" }}
        >
          <CalendarIcon size={18} /> Lịch
        </button>
      </div>
      
      {mode === "calendar" ? (
        <CalendarView transactions={transactions} month={month} onMonth={onMonth} />
      ) : (
        <div className="transaction-list" style={{ marginTop: "16px" }}>
        {list.length ? (
          list.map(item => {
            const category = categories.get(item.categoryId);
            return (
              <Card key={item.id} className="transaction">
                <div
                  className="category-icon"
                  style={{
                    background: `${category?.color ?? "#64748b"}22`,
                    color: category?.color
                  }}
                >
                  {category?.icon === "Utensils"
                    ? "🍜"
                    : category?.icon === "Car"
                    ? "🚗"
                    : category?.icon === "House"
                    ? "🏠"
                    : category?.icon === "ShoppingBag"
                    ? "🛍"
                    : item.kind === "income"
                    ? "↗"
                    : "↘"}
                </div>
                <button
                  className="transaction-main transaction-edit"
                  onClick={() => onEdit(item.id)}
                >
                  <strong>{category?.name ?? "Không rõ"}</strong>
                  <p>
                    {item.note || item.date} · {item.note ? item.date : ""}
                  </p>
                </button>
                <div
                  className={
                    item.kind === "income" ? "amount income" : "amount expense"
                  }
                >
                  {item.kind === "income" ? "+" : "−"}
                  {formatVnd(item.amount)}
                </div>
                <button
                  className="delete-button"
                  aria-label="Xóa giao dịch"
                  onClick={() => {
                    if (window.confirm("Xóa giao dịch này?")) {
                      void onDelete(item.id);
                    }
                  }}
                >
                  <MoreHorizontal size={18} />
                </button>
              </Card>
            );
          })
        ) : (
          <Card className="empty">
            <ReceiptText size={24} />
            <p>Chưa có giao dịch trong tháng này.</p>
          </Card>
        )}
      </div>
      )}
    </>
  );
}
