import React, { useState } from "react";
import { ChevronLeft, ChevronRight, BarChart3, PieChart as PieChartIcon } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart, Pie, Legend } from "recharts";
import type { Category, Transaction } from "../../domain";
import { formatVnd } from "../../domain";
import { addMonths, monthLabel } from "../../utils";
import { monthTotals } from "../../finance";
import { Card } from "../ui/Card";

function formatTooltipValue(value: unknown) {
  return formatVnd(typeof value === "number" ? value : Number(value) || 0);
}

export function TrendReport({ transactions, month }: { transactions: Transaction[]; month: string }) {
  const rows = Array.from({ length: 6 }, (_, index) => {
    const value = addMonths(month, index - 5);
    const totals = monthTotals(transactions, value);
    return { label: value.slice(5), income: totals.income, expense: totals.expense };
  });

  return (
    <Card>
      <div className="section-head compact">
        <div>
          <h2>Dòng tiền 6 tháng</h2>
          <p className="muted">Thu xanh · Chi đỏ</p>
        </div>
      </div>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={rows} margin={{ top: 18, right: 4, left: -22, bottom: 0 }}>
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
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export function ReportsView({
  transactions,
  categories,
  month,
  onMonth
}: {
  transactions: Transaction[];
  categories: Map<string, Category>;
  month: string;
  onMonth: (value: string) => void;
}) {
  const [chartType, setChartType] = useState<"bar" | "doughnut">("doughnut");
  const totals = monthTotals(transactions, month);
  
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
      color: category.color
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
      </div>
      
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
          <div className="chart-wrap" style={{ height: chartType === "doughnut" ? 300 : 260 }}>
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
