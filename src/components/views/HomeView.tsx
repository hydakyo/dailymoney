import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp, BellRing, Landmark, CirclePlus } from "lucide-react";
import type { Category, RecurringRule } from "../../domain";
import { formatVnd } from "../../domain";
import { addMonths, monthLabel } from "../../utils";
import { Card } from "../ui/Card";
import type { AppData } from "../../store";
import type { Advice } from "../../advisor";
import type { BudgetProgressItem } from "../../finance";
import { AlertCircle, AlertTriangle, CheckCircle, Info } from "lucide-react";

export function HomeView({
  balance,
  totals,
  month,
  pending,
  rules,
  categories,
  budgets,
  advices,
  onAdd,
  onPending,
  onMonth
}: {
  balance: number;
  totals: { income: number; expense: number };
  month: string;
  pending: AppData["occurrences"];
  rules: RecurringRule[];
  categories: Map<string, Category>;
  budgets: BudgetProgressItem[];
  advices: Advice[];
  onAdd: () => void;
  onPending: (id: string, skip?: boolean) => void;
  onMonth: (month: string) => void;
}) {
  const getAdviceIcon = (level: string) => {
    switch (level) {
      case "danger": return <AlertCircle size={24} className="text-danger" />;
      case "warning": return <AlertTriangle size={24} className="text-warning" />;
      case "success": return <CheckCircle size={24} className="text-success" />;
      default: return <Info size={24} className="text-info" />;
    }
  };
  return (
    <>
      <Card className="balance-card">
        <div className="month-switch">
          <button onClick={() => onMonth(addMonths(month, -1))}>
            <ChevronLeft size={18} />
          </button>
          <span>{monthLabel(month)}</span>
          <button onClick={() => onMonth(addMonths(month, 1))}>
            <ChevronRight size={18} />
          </button>
        </div>
        <p>Số dư khả dụng</p>
        <h2>{formatVnd(balance)}</h2>
        <div className="totals">
          <div>
            <TrendingUp size={18} />
            <span>Thu</span>
            <strong>{formatVnd(totals.income)}</strong>
          </div>
          <div>
            <TrendingDown size={18} />
            <span>Chi</span>
            <strong>{formatVnd(totals.expense)}</strong>
          </div>
        </div>
      </Card>
      
      <section className="section-head">
        <h2>Cố vấn Tài chính</h2>
      </section>
      <div className="stack mb-4">
        {advices.slice(0, 2).map(advice => (
          <Card key={advice.id} className={`advice-card advice-${advice.level}`}>
            <div className="advice-header">
              {getAdviceIcon(advice.level)}
              <h3>{advice.title}</h3>
            </div>
            <p className="advice-desc">{advice.description}</p>
            {advice.action && <p className="advice-action">👉 {advice.action}</p>}
          </Card>
        ))}
      </div>

      <section className="section-head">
        <h2>Việc cần xử lý</h2>
        {pending.length ? (
          <span className="badge">{pending.length}</span>
        ) : (
          <span className="small-muted">Đã xong</span>
        )}
      </section>
      
      {pending.length ? (
        <div className="stack">
          {pending.slice(0, 3).map(item => {
            const rule = rules.find(rule => rule.id === item.ruleId);
            const category = rule ? categories.get(rule.categoryId) : undefined;
            return (
              <Card key={item.id} className="due-card">
                <div className="category-dot" style={{ background: category?.color }} />
                <div>
                  <strong>{category?.name ?? "Giao dịch lặp"}</strong>
                  <p>
                    {item.dueDate} · {rule?.kind === "income" ? "Thu" : "Chi"}{" "}
                    {formatVnd(rule?.amount ?? 0)}
                  </p>
                </div>
                <button className="soft" onClick={() => onPending(item.id)}>
                  Xác nhận
                </button>
                <button className="text-button" onClick={() => onPending(item.id, true)}>
                  Bỏ qua
                </button>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="empty">
          <BellRing size={22} />
          <p>Không có giao dịch nào đang chờ xác nhận.</p>
        </Card>
      )}
      
      <section className="section-head">
        <h2>Ngân sách tháng này</h2>
      </section>
      
      <Card>
        {budgets.length ? (
          budgets.slice(0, 4).map(item => (
            <div className="budget-row" key={item.id}>
              <div className="row-between">
                <span>{item.category?.name}</span>
                <strong>{Math.round((item.spent / item.limit) * 100)}%</strong>
              </div>
              <div className="progress">
                <i
                  style={{
                    width: `${Math.min(100, (item.spent / item.limit) * 100)}%`,
                    background: item.spent > item.limit ? "#ef6b73" : item.category?.color
                  }}
                />
              </div>
              <small>
                {formatVnd(item.spent)} / {formatVnd(item.limit)}
              </small>
            </div>
          ))
        ) : (
          <p className="muted">Bạn chưa đặt ngân sách nào.</p>
        )}
      </Card>
      
      <button className="quick-add" onClick={onAdd}>
        <CirclePlus size={22} /> Ghi giao dịch mới
      </button>
    </>
  );
}
