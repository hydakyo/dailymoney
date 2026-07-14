import { Plus, Trash2, Landmark, HandCoins, Goal, CalendarDays, Smartphone, Copy } from "lucide-react";
import type { Category, Debt, GoalEntry, Installment, RecurringRule, SavingsGoal } from "../../domain";
import { formatVnd } from "../../domain";
import { debtOutstanding, goalBalance } from "../../finance";
import type { BudgetProgressItem } from "../../finance";
import { Card } from "../ui/Card";
import type { AppData } from "../../store";

type PlanSection = "budgets" | "debts" | "goals" | "recurring" | "installments";

export function PlansView({
  section,
  onSection,
  budgets,
  categories,
  debts,
  payments,
  goals,
  goalEntries,
  rules,
  installments,
  onAdd,
  onPay,
  onContribute,
  onSmartPlan,
  onCopyPreviousBudgets,
  onToggleRule,
  onDeleteBudget,
  onDeleteDebt,
  onDeleteGoal,
  onDeleteRule,
  onDeleteInstallment
}: {
  section: PlanSection;
  onSection: (value: PlanSection) => void;
  budgets: BudgetProgressItem[];
  categories: Category[];
  debts: Debt[];
  payments: AppData["payments"];
  goals: SavingsGoal[];
  goalEntries: GoalEntry[];
  rules: RecurringRule[];
  installments: Installment[];
  onAdd: (section: PlanSection) => void;
  onSmartPlan: () => void;
  onCopyPreviousBudgets: () => Promise<void>;
  onPay: (debtId: string) => void;
  onContribute: (id: string) => void;
  onToggleRule: (rule: RecurringRule) => Promise<void>;
  onDeleteBudget: (id: string) => Promise<void>;
  onDeleteDebt: (id: string) => Promise<void>;
  onDeleteGoal: (id: string) => Promise<void>;
  onDeleteRule: (id: string) => Promise<void>;
  onDeleteInstallment: (id: string) => Promise<void>;
}) {
  const labels: Record<PlanSection, string> = {
    budgets: "Ngân sách",
    installments: "Trả góp",
    debts: "Công nợ",
    goals: "Mục tiêu",
    recurring: "Lặp lại"
  };

  return (
    <>
      <div className="segmented" style={{ overflowX: "auto", whiteSpace: "nowrap", paddingBottom: 4 }}>
        {(Object.keys(labels) as PlanSection[]).map(key => (
          <button
            className={section === key ? "selected" : ""}
            onClick={() => onSection(key)}
            key={key}
            style={{ flex: "0 0 auto", padding: "6px 12px" }}
          >
            {labels[key]}
          </button>
        ))}
      </div>
      
      <button className="primary full" onClick={() => onAdd(section)}>
        <Plus size={20} />{" "}
        {section === "budgets"
          ? "Đặt ngân sách"
          : section === "debts"
          ? "Thêm khoản nợ"
          : section === "goals"
          ? "Tạo mục tiêu"
          : section === "installments"
          ? "Thêm món trả góp"
          : "Tạo giao dịch lặp"}
      </button>

      {section === "budgets" && (
        <div className="stack">
          <button className="card advisor-banner" style={{ background: "linear-gradient(to right, #6d5dfc, #8b5cf6)", color: "white", padding: "16px" }} onClick={onSmartPlan}>
            <div className="row-between" style={{ alignItems: "center" }}>
              <div>
                <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                  <Goal size={20} /> Kế hoạch Thông minh
                </h3>
                <p style={{ margin: "4px 0 0", fontSize: "0.9em", opacity: 0.9 }}>Tự động đề xuất ngân sách 50/30/20</p>
              </div>
              <Plus size={24} />
            </div>
          </button>
          <button className="soft full" onClick={() => void onCopyPreviousBudgets()}>
            <Copy size={17} /> Sao chép ngân sách từ tháng trước
          </button>

          {budgets.length ? (
            budgets.map(item => (
              <Card key={item.id} className="plan-card">
                <div className="row-between">
                  <strong>{item.category?.name}</strong>
                  <strong>{formatVnd(item.limit - item.spent)} còn lại</strong>
                </div>
                <div className="progress">
                  <i
                    style={{
                      width: `${Math.min(100, (item.spent / item.limit) * 100)}%`,
                      background: item.category?.color
                    }}
                  />
                </div>
                <div className="plan-actions">
                  <p>
                    {formatVnd(item.spent)} đã chi trong tổng {formatVnd(item.limit)}
                  </p>
                  <button
                    className="icon-button subtle"
                    aria-label="Xóa ngân sách"
                    onClick={() => {
                      if (window.confirm("Xóa ngân sách này? Giao dịch không bị xóa.")) {
                        void onDeleteBudget(item.id);
                      }
                    }}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </Card>
            ))
          ) : (
            <Card className="empty">
              <Landmark size={24} />
              <p>Chọn danh mục và đặt mức chi cho tháng.</p>
            </Card>
          )}
        </div>
      )}

      {section === "installments" && (
        <div className="stack">
          {installments.length ? (
            installments.map(item => {
              // Calculate how many months have passed since start date
              const [startYear, startMonth] = item.startDate.split("-").map(Number);
              const now = new Date();
              let monthsPassed = (now.getFullYear() - startYear) * 12 + ((now.getMonth() + 1) - startMonth);
              const daysInCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
              const effectiveDueDate = Math.min(item.dueDate, daysInCurrentMonth);
              if (now.getDate() >= effectiveDueDate) {
                monthsPassed += 1;
              }
              const paidMonths = Math.max(0, Math.min(item.totalMonths, monthsPassed));
              const remainingMonths = item.totalMonths - paidMonths;

              return (
                <Card key={item.id} className="plan-card">
                  <div className="row-between">
                    <strong>{item.name}</strong>
                    <span className="pill expense">Hạn ngày {item.dueDate}</span>
                  </div>
                  <h3>{formatVnd(item.monthlyAmount)} <small className="muted">/ tháng</small></h3>
                  <div className="progress" style={{ marginTop: 12 }}>
                    <i
                      style={{
                        width: `${Math.min(100, (paidMonths / item.totalMonths) * 100)}%`,
                        background: 'var(--brand-primary)'
                      }}
                    />
                  </div>
                  <div className="plan-actions" style={{ marginTop: 8 }}>
                    <p>Đã trả: {paidMonths}/{item.totalMonths} tháng</p>
                    <button
                      className="icon-button subtle"
                      aria-label="Xóa khoản trả góp"
                      onClick={() => {
                        if (window.confirm("Xóa hợp đồng trả góp này? Giao dịch đã trả sẽ không bị xoá.")) {
                          void onDeleteInstallment(item.id);
                        }
                      }}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </Card>
              );
            })
          ) : (
            <Card className="empty">
              <Smartphone size={24} />
              <p>Thêm các khoản trả góp như iPhone, xe máy để nhắc nhở hằng tháng.</p>
            </Card>
          )}
        </div>
      )}

      {section === "debts" && (
        <div className="stack">
          {debts.length ? (
            debts.map(item => {
              const outstanding = debtOutstanding(item, payments);
              return (
                <Card key={item.id} className="plan-card">
                  <div className="row-between">
                    <span className={`pill ${item.kind}`}>
                      {item.kind === "payable" ? "Phải trả" : "Phải thu"}
                    </span>
                    <small>{item.dueDate ? `Hạn ${item.dueDate}` : "Không hạn"}</small>
                  </div>
                  <h3>{item.person}</h3>
                  <p>
                    Còn {formatVnd(outstanding)} / {formatVnd(item.principal)}
                  </p>
                  <div className="plan-actions">
                    {!item.closedAt && (
                      <button className="soft" onClick={() => onPay(item.id)}>
                        {item.kind === "payable" ? "Ghi trả nợ" : "Ghi thu nợ"}
                      </button>
                    )}
                    <button
                      className="icon-button subtle"
                      aria-label="Xóa khoản nợ"
                      onClick={() => {
                        if (
                          window.confirm(
                            "Xóa khoản nợ và các giao dịch thanh toán liên quan?"
                          )
                        ) {
                          void onDeleteDebt(item.id);
                        }
                      }}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </Card>
              );
            })
          ) : (
            <Card className="empty">
              <HandCoins size={24} />
              <p>Chưa có khoản phải thu hoặc phải trả.</p>
            </Card>
          )}
        </div>
      )}

      {section === "goals" && (
        <div className="stack">
          {goals.length ? (
            goals.map(item => {
              const saved = goalBalance(item, goalEntries);
              return (
                <Card key={item.id} className="plan-card">
                  <div className="row-between">
                    <span>
                      <Goal size={18} color={item.color} /> {item.name}
                    </span>
                    <strong>{Math.round((saved / item.target) * 100)}%</strong>
                  </div>
                  <div className="progress">
                    <i
                      style={{
                        width: `${Math.min(100, (saved / item.target) * 100)}%`,
                        background: item.color
                      }}
                    />
                  </div>
                  <p>
                    {formatVnd(saved)} / {formatVnd(item.target)}
                  </p>
                  <div className="plan-actions">
                    <button className="soft" onClick={() => onContribute(item.id)}>
                      Ghi đóng góp
                    </button>
                    <button
                      className="icon-button subtle"
                      aria-label="Xóa mục tiêu"
                      onClick={() => {
                        if (window.confirm("Xóa mục tiêu và toàn bộ các lần đóng góp?")) {
                          void onDeleteGoal(item.id);
                        }
                      }}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </Card>
              );
            })
          ) : (
            <Card className="empty">
              <Goal size={24} />
              <p>Tạo mục tiêu cho khoản tiền bạn muốn dành riêng.</p>
            </Card>
          )}
        </div>
      )}

      {section === "recurring" && (
        <div className="stack">
          {rules.length ? (
            rules.map(rule => {
              const category = categories.find(item => item.id === rule.categoryId);
              const frequencyLabel =
                rule.frequency === "daily"
                  ? "Mỗi ngày"
                  : rule.frequency === "weekly"
                  ? "Mỗi tuần"
                  : rule.frequency === "monthly"
                  ? "Mỗi tháng"
                  : "Mỗi năm";
              return (
                <Card key={rule.id} className="plan-card">
                  <div className="row-between">
                    <strong>{category?.name}</strong>
                    <button
                      className={rule.active ? "toggle on" : "toggle"}
                      onClick={() => void onToggleRule(rule)}
                      aria-label="Bật hoặc tắt quy tắc"
                    >
                      <i />
                    </button>
                  </div>
                  <p>
                    {frequencyLabel} · {formatVnd(rule.amount)}
                  </p>
                  <div className="plan-actions">
                    <small>Kỳ tiếp theo: {rule.nextDueDate}</small>
                    <button
                      className="icon-button subtle"
                      aria-label="Xóa quy tắc lặp"
                      onClick={() => {
                        if (
                          window.confirm(
                            "Xóa quy tắc lặp? Các giao dịch đã xác nhận sẽ được giữ lại."
                          )
                        ) {
                          void onDeleteRule(rule.id);
                        }
                      }}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </Card>
              );
            })
          ) : (
            <Card className="empty">
              <CalendarDays size={24} />
              <p>Thêm chi phí lặp lại như tiền nhà hoặc lương.</p>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
