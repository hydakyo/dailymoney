import React, { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, PieChart as PieChartIcon } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart, Pie, Legend } from "recharts";
import type { Category, Transaction } from "../../domain";
import { formatVnd } from "../../domain";
import { addMonths, monthLabel } from "../../utils";
import { monthTotals, type BudgetProgressItem } from "../../finance";
import { Card } from "../ui/Card";

function formatTooltipValue(value: unknown) {
  return formatVnd(typeof value === "number" ? value : Number(value) || 0);
}

export function TrendReport({ transactions, month }: { transactions: Transaction[]; month: string }) {
  const [range, setRange] = useState<6 | 12>(6);
  const rows = Array.from({ length: range }, (_, index) => {
    const value = addMonths(month, index - (range - 1));
    const totals = monthTotals(transactions, value);
    return { label: `${value.slice(5)}/${value.slice(2, 4)}`, income: totals.income, expense: totals.expense, net: totals.income - totals.expense };
  });

  return (
    <Card>
      <div className="section-head compact">
        <div>
          <h2>Dòng tiền {range} tháng</h2>
          <p className="muted">Thu xanh · Chi đỏ · Ròng màu tím</p>
        </div>
        <div className="segmented report-range" aria-label="Khoảng thời gian báo cáo">
          <button className={range === 6 ? "selected" : ""} onClick={() => setRange(6)}>6T</button>
          <button className={range === 12 ? "selected" : ""} onClick={() => setRange(12)}>12T</button>
        </div>
      </div>
      <div className="chart-wrap" role="img" aria-label={`Biểu đồ thu, chi và dòng tiền ròng ${range} tháng`}>
        <ResponsiveContainer width="100%" height={230}>
          <ComposedChart data={rows} margin={{ top: 18, right: 4, left: -22, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--text-muted)" }}
              tickFormatter={value => `${Math.round(Number(value) / 1_000_000)}tr`}
              axisLine={false} tickLine={false}
            />
            <Tooltip 
              formatter={formatTooltipValue}
              contentStyle={{ background: 'var(--bg-card)', borderColor: 'var(--border)', borderRadius: '8px' }}
            />
            <Bar dataKey="income" name="Thu" fill="var(--success)" radius={[6, 6, 0, 0]} />
            <Bar dataKey="expense" name="Chi" fill="var(--danger)" radius={[6, 6, 0, 0]} />
            <Line dataKey="net" name="Ròng" type="monotone" stroke="var(--brand-primary)" strokeWidth={2.5} dot={{ r: 2 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export function ReportsView({
  transactions,
  categories,
  budgets,
  month,
  onMonth
}: {
  transactions: Transaction[];
  categories: Map<string, Category>;
  budgets: BudgetProgressItem[];
  month: string;
  onMonth: (value: string) => void;
}) {

  const [chartType, setChartType] = useState<"bar" | "doughnut">("doughnut");
  const totals = monthTotals(transactions, month);
  const previousTotals = monthTotals(transactions, addMonths(month, -1));
  const expenseChange = previousTotals.expense ? ((totals.expense - previousTotals.expense) / previousTotals.expense) * 100 : null;
  const savingsRate = totals.income ? ((totals.income - totals.expense) / totals.income) * 100 : null;
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate();
  const dayCount = Math.max(1, Math.min(daysInMonth, new Date().getFullYear() === Number(month.slice(0, 4)) && new Date().getMonth() + 1 === Number(month.slice(5)) ? new Date().getDate() : daysInMonth));
  const dailyExpense = totals.expense / dayCount;
  const netCashFlow = totals.income - totals.expense;
  const expenseByDay = new Map<string, number>();
  transactions.filter(item => item.kind === "expense" && item.date.startsWith(month)).forEach(item => expenseByDay.set(item.date, (expenseByDay.get(item.date) ?? 0) + item.amount));
  const highestExpenseDay = Array.from(expenseByDay).sort((left, right) => right[1] - left[1])[0];
  const totalBudget = budgets.reduce((sum, item) => sum + item.limit, 0);
  const budgetSpent = budgets.reduce((sum, item) => sum + item.spent, 0);
  const budgetRemaining = totalBudget - budgetSpent;
  const overBudgetCount = budgets.filter(item => item.spent > item.limit).length;
  const budgetUsage = totalBudget > 0 ? budgetSpent / totalBudget : 0;
  const isCurrentMonth = new Date().getFullYear() === Number(month.slice(0, 4)) && new Date().getMonth() + 1 === Number(month.slice(5));
  const elapsedRatio = isCurrentMonth ? dayCount / daysInMonth : 1;
  const spendingPace = totalBudget > 0 && elapsedRatio > 0 ? budgetUsage / elapsedRatio : 0;
  
  const rows = Array.from(categories.values())
    .filter(category => category.kind === "expense")
    .map(category => ({
      name: category.name,
      amount: transactions
        .filter(
          transaction =>
            transaction.kind === "expense" &&
            transaction.categoryId === category.id &&
            transaction.date.startsWith(month)
        )
        .reduce((sum, transaction) => sum + transaction.amount, 0),
      color: category.color,
      previousAmount: transactions
        .filter(transaction => transaction.kind === "expense" && transaction.categoryId === category.id && transaction.date.startsWith(addMonths(month, -1)))
        .reduce((sum, transaction) => sum + transaction.amount, 0)
    }))
    .filter(row => row.amount)
    .sort((a, b) => b.amount - a.amount);

  const topRows = rows.slice(0, 6);

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
      
      <div className="stat-grid">
        <Card>
          <p>Tổng thu</p>
          <h3 className="income">{formatVnd(totals.income)}</h3>
        </Card>
        <Card>
          <p>Tổng chi</p>
          <h3 className="expense">{formatVnd(totals.expense)}</h3>
        </Card>
        <Card>
          <p>Dòng tiền ròng</p>
          <h3 className={netCashFlow < 0 ? "expense" : "income"}>{netCashFlow >= 0 ? "+" : "−"}{formatVnd(Math.abs(netCashFlow))}</h3>
        </Card>
        <Card>
          <p>Tỷ lệ tiết kiệm</p>
          <h3 className={savingsRate !== null && savingsRate < 0 ? "expense" : "income"}>{savingsRate === null ? "Chưa có thu nhập" : `${savingsRate.toFixed(0)}%`}</h3>
        </Card>
      </div>
      <div className="stat-grid report-insights">
        <Card>
          <p>So với tháng trước</p>
          <h3 className={expenseChange !== null && expenseChange > 0 ? "expense" : "income"}>{expenseChange === null ? "Chưa có dữ liệu" : `${expenseChange > 0 ? "+" : ""}${expenseChange.toFixed(0)}% chi tiêu`}</h3>
        </Card>
        <Card>
          <p>Chi trung bình/ngày</p>
          <h3>{formatVnd(dailyExpense)}</h3>
        </Card>
        <Card>
          <p>Ngày chi nhiều nhất</p>
          <h3>{highestExpenseDay ? formatVnd(highestExpenseDay[1]) : "Chưa có"}</h3>
          {highestExpenseDay && <small>{new Date(`${highestExpenseDay[0]}T12:00:00`).toLocaleDateString("vi-VN")}</small>}
        </Card>
      </div>

      <Card className="budget-health-card">
        <div className="section-head compact">
          <div><h2>Sức khỏe ngân sách</h2><p className="muted">Tiến độ chi so với thời gian trong tháng</p></div>
          <span className={`pill ${overBudgetCount ? "budget-risk" : "budget-safe"}`}>{overBudgetCount ? `${overBudgetCount} mục vượt` : budgets.length ? "Đang kiểm soát" : "Chưa thiết lập"}</span>
        </div>
        {budgets.length ? <>
          <div className="report-budget-summary">
            <div><span>Đã chi</span><strong>{formatVnd(budgetSpent)}</strong></div>
            <div><span>Ngân sách</span><strong>{formatVnd(totalBudget)}</strong></div>
            <div><span>Còn lại</span><strong className={budgetRemaining < 0 ? "expense" : "income"}>{budgetRemaining < 0 ? "−" : ""}{formatVnd(Math.abs(budgetRemaining))}</strong></div>
          </div>
          <div className="progress budget-total-progress"><i style={{ width: `${Math.min(100, budgetUsage * 100)}%`, background: budgetUsage > 1 ? "var(--danger)" : "var(--brand-primary)" }} /></div>
          <p className={`budget-pace ${spendingPace > 1.08 ? "expense" : "income"}`}>
            {spendingPace > 1.08 ? "Tốc độ chi đang nhanh hơn tiến độ tháng. Nên giảm các khoản linh hoạt." : "Tốc độ chi đang phù hợp với tiến độ tháng."}
          </p>
          <div className="report-budget-list">
            {[...budgets].sort((left, right) => (right.spent / right.limit) - (left.spent / left.limit)).slice(0, 5).map(item => (
              <div key={item.id}>
                <span><i style={{ background: item.category?.color }} />{item.category?.name ?? "Danh mục đã xóa"}</span>
                <strong className={item.spent > item.limit ? "expense" : ""}>{Math.round((item.spent / item.limit) * 100)}% · {formatVnd(item.spent)}</strong>
              </div>
            ))}
          </div>
        </> : <div className="empty compact"><CalendarDays size={23} /><p>Đặt ngân sách để theo dõi tốc độ chi và phát hiện danh mục có nguy cơ vượt mức.</p></div>}
      </Card>
      
      <Card>
        <div className="section-head compact">
          <div>
            <h2>Chi tiêu theo danh mục</h2>
            <p className="muted">Phân bổ dòng tiền chi</p>
          </div>
          <div className="segmented" style={{ transform: "scale(0.85)", transformOrigin: "right center" }}>
            <button className={chartType === "doughnut" ? "selected" : ""} onClick={() => setChartType("doughnut")}>Tròn</button>
            <button className={chartType === "bar" ? "selected" : ""} onClick={() => setChartType("bar")}>Ngang</button>
          </div>
        </div>
        {rows.length ? (
          <div className="chart-wrap" style={{ height: chartType === "doughnut" ? 300 : 260 }} role="img" aria-label="Biểu đồ chi tiêu theo danh mục">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === "bar" ? (
                <BarChart
                  data={topRows}
                  layout="vertical"
                  margin={{ top: 4, right: 20, bottom: 4, left: 0 }}
                >
                  <CartesianGrid horizontal={false} stroke="var(--border)" />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={formatTooltipValue}
                    cursor={{ fill: "var(--brand-light)" }}
                    contentStyle={{ background: 'var(--bg-card)', borderColor: 'var(--border)', borderRadius: '8px' }}
                  />
                  <Bar dataKey="amount" radius={[0, 8, 8, 0]}>
                    {topRows.map(row => (
                      <Cell key={row.name} fill={row.color} />
                    ))}
                  </Bar>
                </BarChart>
              ) : (
                <PieChart>
                  <Pie
                    data={rows}
                    dataKey="amount"
                    nameKey="name"
                    cx="50%"
                    cy="45%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={3}
                    stroke="none"
                  >
                    {rows.map(row => (
                      <Cell key={row.name} fill={row.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={formatTooltipValue}
                    contentStyle={{ background: 'var(--bg-card)', borderColor: 'var(--border)', borderRadius: '8px' }}
                  />
                  <Legend 
                    layout="horizontal" 
                    verticalAlign="bottom" 
                    align="center"
                    wrapperStyle={{ fontSize: '12px', color: 'var(--text-main)', paddingTop: '10px' }}
                  />
                </PieChart>
              )}
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="empty compact">
            <PieChartIcon size={24} />
            <p>Thêm giao dịch chi để xem phân tích.</p>
          </div>
        )}
      </Card>

      {rows.length > 0 && <Card>
        <h2>Chi tiết danh mục</h2>
        <div className="report-category-list">
          {topRows.map(row => {
            const share = totals.expense ? row.amount / totals.expense : 0;
            const change = row.previousAmount ? ((row.amount - row.previousAmount) / row.previousAmount) * 100 : null;
            return <div key={row.name}>
              <i style={{ background: row.color }} />
              <span><strong>{row.name}</strong><small>{Math.round(share * 100)}% tổng chi · {change === null ? "chưa có tháng trước" : `${change > 0 ? "+" : ""}${change.toFixed(0)}% so tháng trước`}</small></span>
              <strong>{formatVnd(row.amount)}</strong>
            </div>;
          })}
        </div>
      </Card>}
      
      <Card>
        <h2>Nhận định tháng này</h2>
        <p className="muted">
          {totals.expense > totals.income
            ? "Bạn đang chi nhiều hơn khoản thu trong tháng đã chọn. Hãy kiểm tra lại các khoản mục chi tiêu lớn để cân đối tài chính."
            : "Khoản thu hiện cao hơn khoản chi trong tháng đã chọn. Tiếp tục duy trì thói quen chi tiêu tốt này nhé!"}
        </p>
        {rows[0] && (
          <p className="insight">
            Danh mục chi nhiều nhất: <strong style={{ color: rows[0].color }}>{rows[0].name}</strong> ·{" "}
            {formatVnd(rows[0].amount)}
          </p>
        )}
      </Card>
    </>
  );
}
