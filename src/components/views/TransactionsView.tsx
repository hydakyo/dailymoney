import { useMemo, useState } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, List, Plus, ReceiptText, Search, X } from "lucide-react";
import type { Category, Transaction } from "../../domain";
import { formatVnd } from "../../domain";
import { addMonths, monthLabel } from "../../utils";
import { Card } from "../ui/Card";
import { CalendarView } from "./CalendarView";
import { TransactionCard } from "../ui/TransactionCard";
import { filterTransactions, groupTransactionsByDate, summarizeTransactions, type TransactionKindFilter } from "../../transaction-view";

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
  onAdd: (date?: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"list" | "calendar">("list");
  const [kind, setKind] = useState<TransactionKindFilter>("all");
  const [categoryId, setCategoryId] = useState("all");
  const [selectedDate, setSelectedDate] = useState<string>();

  const list = useMemo(
    () => filterTransactions(transactions, categories, { month, query, kind, categoryId }),
    [transactions, categories, month, query, kind, categoryId]
  );
  const summary = useMemo(() => summarizeTransactions(list), [list]);
  const groups = useMemo(() => groupTransactionsByDate(list), [list]);
  const activeSelectedDate = selectedDate?.startsWith(month) ? selectedDate : undefined;
  const selectedTransactions = useMemo(
    () => activeSelectedDate ? list.filter(item => item.date === activeSelectedDate) : [],
    [activeSelectedDate, list]
  );
  const categoryOptions = useMemo(() => {
    const usedCategoryIds = new Set(transactions.filter(item => item.date.startsWith(month)).map(item => item.categoryId));
    return Array.from(categories.values())
      .filter(category => category.kind !== "transfer")
      .filter(category => kind === "all" || category.kind === kind)
      .filter(category => !category.archived || usedCategoryIds.has(category.id))
      .sort((left, right) => left.name.localeCompare(right.name, "vi-VN"));
  }, [categories, kind, month, transactions]);
  const duplicateCategoryNames = useMemo(() => {
    const counts = new Map<string, number>();
    categoryOptions.forEach(category => counts.set(category.name, (counts.get(category.name) ?? 0) + 1));
    return new Set(Array.from(counts).filter(([, count]) => count > 1).map(([name]) => name));
  }, [categoryOptions]);
  const hasFilters = Boolean(query || kind !== "all" || categoryId !== "all");

  const changeMonth = (offset: number) => {
    setSelectedDate(undefined);
    onMonth(addMonths(month, offset));
  };

  const changeKind = (value: TransactionKindFilter) => {
    setKind(value);
    if (categoryId !== "all" && categories.get(categoryId)?.kind !== value && value !== "all") setCategoryId("all");
  };

  const clearFilters = () => {
    setQuery("");
    setKind("all");
    setCategoryId("all");
  };

  const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });

  return (
    <>
      <div className="month-switch inline">
        <button onClick={() => changeMonth(-1)} aria-label="Tháng trước">
          <ChevronLeft size={18} />
        </button>
        <span>{monthLabel(month)}</span>
        <button onClick={() => changeMonth(1)} aria-label="Tháng sau">
          <ChevronRight size={18} />
        </button>
      </div>
      
      <div className="transaction-search-wrap">
        <Search size={18} aria-hidden="true" />
        <input
          className="transaction-search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Tìm danh mục, ghi chú, số tiền…"
          aria-label="Tìm giao dịch"
        />
        {query && <button className="search-clear" onClick={() => setQuery("")} aria-label="Xóa nội dung tìm kiếm"><X size={16} /></button>}
      </div>

      <div className="transaction-filters" aria-label="Bộ lọc giao dịch">
        <div className="filter-chips">
          {([[
            "all", "Tất cả"
          ], ["expense", "Khoản chi"], ["income", "Khoản thu"]] as const).map(([value, label]) => (
            <button key={value} className={kind === value ? "selected" : ""} onClick={() => changeKind(value)}>{label}</button>
          ))}
        </div>
        <label className="category-filter">
          <span className="sr-only">Lọc theo danh mục</span>
          <select value={categoryId} onChange={event => setCategoryId(event.target.value)}>
            <option value="all">Mọi danh mục</option>
            {categoryOptions.map(category => <option key={category.id} value={category.id}>{category.name}{duplicateCategoryNames.has(category.name) ? ` (${category.kind === "income" ? "Thu" : "Chi"})` : ""}</option>)}
          </select>
        </label>
        {hasFilters && <button className="clear-filters" onClick={clearFilters}><X size={14} /> Xóa lọc</button>}
      </div>

      <Card className="transaction-summary">
        <div><span>Đang hiển thị</span><strong>{summary.count} giao dịch</strong></div>
        <div><span>Thu</span><strong className="income">+{formatVnd(summary.income)}</strong></div>
        <div><span>Chi</span><strong className="expense">−{formatVnd(summary.expense)}</strong></div>
        <div><span>Dòng tiền ròng</span><strong className={summary.net < 0 ? "expense" : "income"}>{summary.net >= 0 ? "+" : "−"}{formatVnd(Math.abs(summary.net))}</strong></div>
      </Card>
      
      <button className="primary full" onClick={() => onAdd()}>
        <Plus size={20} /> Thêm giao dịch
      </button>

      <div className="segmented view-switch" aria-label="Kiểu hiển thị">
        <button 
          className={mode === "list" ? "selected" : ""}
          onClick={() => setMode("list")}
        >
          <List size={18} /> Danh sách
        </button>
        <button 
          className={mode === "calendar" ? "selected" : ""}
          onClick={() => setMode("calendar")}
        >
          <CalendarIcon size={18} /> Lịch
        </button>
      </div>
      
      {mode === "calendar" ? (
        <div className="calendar-mode">
          <CalendarView
            transactions={list}
            month={month}
            selectedDate={activeSelectedDate}
            onSelectDate={date => setSelectedDate(current => current === date ? undefined : date)}
          />
          {activeSelectedDate ? (
            <section className="selected-day" aria-label={`Giao dịch ${dateLabel(activeSelectedDate)}`}>
              <div className="section-head compact">
                <div><h2>{dateLabel(activeSelectedDate)}</h2><p className="muted">{selectedTransactions.length} giao dịch phù hợp bộ lọc</p></div>
                <button className="soft" onClick={() => onAdd(activeSelectedDate)}><Plus size={16} /> Thêm</button>
              </div>
              {selectedTransactions.length ? selectedTransactions.map(item => (
                <TransactionCard key={item.id} transaction={item} category={categories.get(item.categoryId)} onEdit={onEdit} onDelete={onDelete} />
              )) : <Card className="empty compact"><ReceiptText size={22} /><p>Ngày này chưa có giao dịch phù hợp bộ lọc.</p></Card>}
            </section>
          ) : <Card className="calendar-hint"><CalendarIcon size={20} /><p>Chọn một ngày để xem chi tiết hoặc thêm giao dịch đúng ngày đó.</p></Card>}
        </div>
      ) : (
        <div className="transaction-list">
        {groups.length ? (
          groups.map(group => (
            <section className="transaction-day-group" key={group.date}>
              <div className="transaction-day-head">
                <div><strong>{dateLabel(group.date)}</strong><span>{group.count} giao dịch</span></div>
                <div><span className="income">+{formatVnd(group.income)}</span><span className="expense">−{formatVnd(group.expense)}</span></div>
              </div>
              {group.transactions.map(item => <TransactionCard key={item.id} transaction={item} category={categories.get(item.categoryId)} onEdit={onEdit} onDelete={onDelete} />)}
            </section>
          ))
        ) : (
          <Card className="empty">
            <ReceiptText size={24} />
            <p>{hasFilters ? "Không tìm thấy giao dịch phù hợp. Hãy thử xóa bớt bộ lọc." : "Chưa có giao dịch trong tháng này."}</p>
            {hasFilters && <button className="soft" onClick={clearFilters}>Xóa toàn bộ bộ lọc</button>}
          </Card>
        )}
      </div>
      )}
    </>
  );
}
