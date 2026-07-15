import type { Transaction } from "../../domain";

function compactVnd(value: number) {
  const format = (amount: number) => amount.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
  if (value >= 1_000_000_000) return `${format(value / 1_000_000_000)}tỷ`;
  if (value >= 1_000_000) return `${format(value / 1_000_000)}tr`;
  if (value >= 1_000) return `${format(value / 1_000)}k`;
  return String(value);
}

export function CalendarView({
  transactions,
  month,
  selectedDate,
  onSelectDate,
}: {
  transactions: Transaction[];
  month: string;
  selectedDate?: string;
  onSelectDate: (date: string) => void;
}) {
  const year = parseInt(month.substring(0, 4));
  const m = parseInt(month.substring(5, 7)) - 1;
  const firstDay = new Date(year, m, 1);
  const lastDay = new Date(year, m + 1, 0);
  
  // Monday = 0, Tuesday = 1, ..., Sunday = 6
  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6;
  
  const daysInMonth = lastDay.getDate();
  const totalCells = startOffset + daysInMonth;
  const totalRows = Math.ceil(totalCells / 7);
  
  const cells: number[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(0);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length < totalRows * 7) cells.push(0);

  const txByDay = new Map<number, { inc: number; exp: number }>();
  for (const t of transactions) {
    if (t.date.startsWith(month)) {
      const day = parseInt(t.date.substring(8, 10));
      const curr = txByDay.get(day) || { inc: 0, exp: 0 };
      if (t.kind === "income") curr.inc += t.amount;
      else if (t.kind === "expense") curr.exp += t.amount;
      txByDay.set(day, curr);
    }
  }

  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  const isCurrentMonth = todayStr.startsWith(month);
  const todayDay = isCurrentMonth ? parseInt(todayStr.substring(8, 10)) : -1;

  return (
    <div className="calendar-container">
      <div className="calendar-grid">
        <div className="calendar-row header">
          {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map(d => (
            <div key={d} className="calendar-cell header">{d}</div>
          ))}
        </div>
        {Array.from({ length: totalRows }, (_, ri) => (
          <div key={ri} className="calendar-row">
            {cells.slice(ri * 7, ri * 7 + 7).map((d, di) => {
              if (d === 0) return <div key={di} className="calendar-cell empty" />;
              const data = txByDay.get(d);
              const isToday = d === todayDay;
              return (
                <button
                  type="button"
                  key={di}
                  className={`calendar-cell day${isToday ? " today" : ""}${selectedDate === `${month}-${String(d).padStart(2, "0")}` ? " selected" : ""}`}
                  onClick={() => onSelectDate(`${month}-${String(d).padStart(2, "0")}`)}
                  aria-pressed={selectedDate === `${month}-${String(d).padStart(2, "0")}`}
                  aria-label={`Ngày ${d}${data ? `, thu ${data.inc}, chi ${data.exp}` : ", chưa có giao dịch"}`}
                >
                  <span className="date">{d}</span>
                  {data && data.inc > 0 && <span className="inc">+{compactVnd(data.inc)}</span>}
                  {data && data.exp > 0 && <span className="exp">-{compactVnd(data.exp)}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
