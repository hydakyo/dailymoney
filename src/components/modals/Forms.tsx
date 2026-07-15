import React, { useState } from "react";
import { Archive, ArchiveRestore, Check, Pencil, Upload, X } from "lucide-react";
import type { AppSettings, Budget, Category, CollectionConfidence, Debt, EditableTransactionKind, FinancialClass, GoalEntry, Installment, ObligationPriority, RecurringRule, SavingsGoal, Transaction } from "../../domain";
import { formatVnd, newId, today } from "../../domain";
import { isNativeApp } from "../../notifications";
import { supportsWebPush } from "../../web-push";
import { db } from "../../db";
import { Modal } from "../ui/Modal";
import { AmountInput } from "../ui/AmountInput";

type TransactionFormInput = {
  id?: string;
  kind: EditableTransactionKind;
  amount: number;
  categoryId: string;
  date: string;
  note?: string;
  recurring?: { frequency: RecurringRule["frequency"]; interval: number; dayOfMonth?: number };
};

export function TransactionForm({
  transaction,
  categories,
  onSubmit,
  onClose
}: {
  transaction?: Transaction;
  categories: Category[];
  onSubmit: (value: TransactionFormInput) => Promise<void>;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<EditableTransactionKind>(transaction?.kind === "income" ? "income" : "expense");
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : "");
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? "");
  const [date, setDate] = useState(transaction?.date ?? today());
  const [note, setNote] = useState(transaction?.note ?? "");
  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState<RecurringRule["frequency"]>("monthly");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  
  const relevant = React.useMemo(
    () => categories.filter(category => category.kind === kind && !category.archived),
    [categories, kind]
  );
  
  React.useEffect(() => {
    if (!relevant.some(category => category.id === categoryId)) {
      setCategoryId(relevant[0]?.id ?? "");
    }
  }, [categoryId, relevant]);

  const submit = async () => {
    if (submitting) return;
    const numericAmount = Number(amount);
    if (!Number.isSafeInteger(numericAmount) || numericAmount <= 0) {
      setError("Số tiền phải là số nguyên dương hợp lệ.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await onSubmit({ id: transaction?.id, kind, amount: numericAmount, categoryId, date, note: note || undefined, recurring: recurring ? { frequency, interval: 1, dayOfMonth: Number(date.slice(-2)) } : undefined });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể lưu giao dịch.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={transaction ? "Sửa giao dịch" : "Ghi giao dịch"} onClose={onClose}>
      <div className="kind-switch">
        <button className={kind === "expense" ? "selected expense-bg" : ""} onClick={() => setKind("expense")}>Chi tiền</button>
        <button className={kind === "income" ? "selected income-bg" : ""} onClick={() => setKind("income")}>Thu tiền</button>
      </div>
      <AmountInput value={amount} onChange={setAmount} />
      <label className="field">
        <span>Danh mục</span>
        <select value={categoryId} onChange={event => setCategoryId(event.target.value)}>
          {relevant.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Ngày</span>
        <input type="date" value={date} onChange={event => setDate(event.target.value)} />
      </label>
      <label className="field">
        <span>Ghi chú <em>(không bắt buộc)</em></span>
        <input value={note} onChange={event => setNote(event.target.value)} placeholder="Ví dụ: cà phê sáng" />
      </label>
      {!transaction && (
        <>
          <label className="checkbox">
            <input type="checkbox" checked={recurring} onChange={event => setRecurring(event.target.checked)} /> Lặp lại giao dịch này
          </label>
          {recurring && (
            <label className="field">
              <span>Tần suất</span>
              <select value={frequency} onChange={event => setFrequency(event.target.value as RecurringRule["frequency"])}>
                <option value="daily">Mỗi ngày</option>
                <option value="weekly">Mỗi tuần</option>
                <option value="monthly">Mỗi tháng</option>
                <option value="yearly">Mỗi năm</option>
              </select>
            </label>
          )}
        </>
      )}
      {error && <p className="form-error">{error}</p>}
      <button className="primary full" disabled={!amount || !categoryId || submitting} onClick={() => void submit()}>
        {submitting ? "Đang lưu…" : transaction ? "Lưu thay đổi" : "Lưu giao dịch"}
      </button>
    </Modal>
  );
}

export function BudgetForm({ budget, categories, month, onSubmit, onClose }: { budget?: Budget; categories: Category[]; month: string; onSubmit: (value: Pick<Budget, "categoryId" | "month" | "limit">) => Promise<void>; onClose: () => void }) {
  const expenses = categories.filter(category => category.kind === "expense" && !category.archived);
  const [categoryId, setCategoryId] = useState(budget?.categoryId ?? expenses[0]?.id ?? "");
  const [amount, setAmount] = useState(budget ? String(budget.limit) : "");
  const [selectedMonth, setSelectedMonth] = useState(budget?.month ?? month);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (submitting) return;
    const limit = Number(amount);
    if (!Number.isSafeInteger(limit) || limit <= 0) return setError("Giới hạn phải là số nguyên dương hợp lệ.");
    setSubmitting(true); setError("");
    try { await onSubmit({ categoryId, month: selectedMonth, limit }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Không thể lưu ngân sách."); }
    finally { setSubmitting(false); }
  };
  return (
    <Modal title={budget ? "Sửa ngân sách" : "Đặt ngân sách"} onClose={onClose}>
      <label className="field">
        <span>Tháng</span>
        <input type="month" value={selectedMonth} onChange={event => setSelectedMonth(event.target.value)} disabled={Boolean(budget)} />
      </label>
      <label className="field">
        <span>Danh mục</span>
        <select value={categoryId} onChange={event => setCategoryId(event.target.value)} disabled={Boolean(budget)}>
          {expenses.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
      </label>
      <AmountInput label="Giới hạn chi" value={amount} onChange={setAmount} />
      {error && <p className="form-error">{error}</p>}
      <button className="primary full" disabled={!amount || !categoryId || submitting} onClick={() => {
        void submit();
      }}>{budget ? "Lưu thay đổi" : "Lưu ngân sách"}</button>
    </Modal>
  );
}

export function DebtForm({ debt, onSubmit, onClose }: { debt?: Debt; onSubmit: (value: Omit<Debt, "id" | "closedAt" | "createdAt" | "updatedAt">) => Promise<void>; onClose: () => void }) {
  const [kind, setKind] = useState<Debt["kind"]>(debt?.kind ?? "payable");
  const [person, setPerson] = useState(debt?.person ?? "");
  const [amount, setAmount] = useState(debt ? String(debt.principal) : "");
  const [dueDate, setDueDate] = useState(debt?.dueDate ?? "");
  const [note, setNote] = useState(debt?.note ?? "");
  const [priority, setPriority] = useState<ObligationPriority>(debt?.priority ?? "high");
  const [collectionConfidence, setCollectionConfidence] = useState<CollectionConfidence>(debt?.collectionConfidence ?? "likely");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (submitting) return;
    const principal = Number(amount);
    if (!Number.isSafeInteger(principal) || principal <= 0) {
      setError("Số tiền gốc phải là số nguyên dương hợp lệ.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await onSubmit({ kind, person: person.trim(), principal, openedDate: debt?.openedDate ?? today(), dueDate: dueDate || undefined, note: note.trim() || undefined, priority: kind === "payable" ? priority : undefined, collectionConfidence: kind === "receivable" ? collectionConfidence : undefined });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể lưu khoản công nợ.");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Modal title={debt ? "Sửa khoản công nợ" : "Khoản công nợ"} onClose={onClose}>
      <div className="kind-switch">
        <button disabled={Boolean(debt)} className={kind === "payable" ? "selected expense-bg" : ""} onClick={() => setKind("payable")}>Tôi phải trả</button>
        <button disabled={Boolean(debt)} className={kind === "receivable" ? "selected income-bg" : ""} onClick={() => setKind("receivable")}>Tôi cần thu</button>
      </div>
      <label className="field"><span>Người liên quan</span><input value={person} onChange={event => setPerson(event.target.value)} placeholder="Tên người" /></label>
      <AmountInput label="Số tiền gốc" value={amount} onChange={setAmount} />
      <label className="field"><span>Hạn thanh toán <em>(không bắt buộc)</em></span><input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} /></label>
      {kind === "payable" && <label className="field">
        <span>Ưu tiên khi thiếu tiền</span>
        <select value={priority} onChange={event => setPriority(event.target.value as ObligationPriority)}>
          <option value="essential">Thiết yếu — cần bảo vệ trước</option>
          <option value="high">Cao — nên thanh toán đúng hạn</option>
          <option value="normal">Bình thường</option>
          <option value="flexible">Linh hoạt — có thể thương lượng/dời</option>
        </select>
      </label>}
      {kind === "receivable" && <label className="field">
        <span>Mức chắc chắn sẽ thu được</span>
        <select value={collectionConfidence} onChange={event => setCollectionConfidence(event.target.value as CollectionConfidence)}>
          <option value="certain">Chắc chắn — dự kiến đủ tiền đúng hạn</option>
          <option value="likely">Khả năng cao — vẫn cần dự phòng</option>
          <option value="uncertain">Chưa chắc — có thể trả trễ/tranh chấp</option>
        </select>
      </label>}
      <label className="field"><span>Ghi chú</span><input value={note} onChange={event => setNote(event.target.value)} /></label>
      <p className="form-note">Tạo khoản nợ không làm thay đổi số dư. Khi thu/trả mới tạo giao dịch.</p>
      {debt && <p className="form-note">Loại công nợ được giữ nguyên để các giao dịch thu/trả đã ghi luôn chính xác.</p>}
      {error && <p className="form-error">{error}</p>}
      <button className="primary full" disabled={!person.trim() || !amount || submitting} onClick={() => void submit()}>{submitting ? "Đang lưu…" : debt ? "Lưu thay đổi" : "Lưu khoản nợ"}</button>
    </Modal>
  );
}

export function DebtPaymentForm({ debt, outstanding, onSubmit, onClose }: { debt: Debt; outstanding: number; categories: Category[]; onSubmit: (value: { id: string; amount: number; date: string; note?: string }) => Promise<void>; onClose: () => void }) {
  const [amount, setAmount] = useState(String(outstanding));
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (submitting) return;
    const numericAmount = Number(amount);
    if (!Number.isSafeInteger(numericAmount) || numericAmount <= 0 || numericAmount > outstanding) {
      setError("Số tiền thanh toán không hợp lệ.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await onSubmit({ id: newId(), amount: numericAmount, date, note: note || undefined });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Không thể ghi khoản thanh toán. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Modal title={debt.kind === "payable" ? "Ghi trả nợ" : "Ghi thu nợ"} onClose={onClose}>
      <p className="form-note">Còn lại {formatVnd(outstanding)} · thao tác này sẽ ghi vào số dư.</p>
      <AmountInput value={amount} onChange={setAmount} />
      <label className="field"><span>Ngày</span><input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      <label className="field"><span>Ghi chú</span><input value={note} onChange={event => setNote(event.target.value)} /></label>
      {error && <p className="form-error">{error}</p>}
      <button className="primary full" disabled={!amount || Number(amount) > outstanding || submitting} onClick={() => void submit()}>{submitting ? "Đang lưu…" : "Xác nhận"}</button>
    </Modal>
  );
}

export function GoalForm({ goal, onSubmit, onClose }: { goal?: SavingsGoal; onSubmit: (value: Omit<SavingsGoal, "id" | "closedAt" | "createdAt" | "updatedAt">) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState(goal?.name ?? "");
  const [amount, setAmount] = useState(goal ? String(goal.target) : "");
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? "");
  const [color, setColor] = useState(goal?.color ?? "#7c5cff");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (submitting) return;
    const target = Number(amount);
    if (!Number.isSafeInteger(target) || target <= 0) {
      setError("Mục tiêu tiền phải là số nguyên dương hợp lệ.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await onSubmit({ name: name.trim(), target, targetDate: targetDate || undefined, color, icon: goal?.icon ?? "Goal" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể lưu mục tiêu.");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Modal title={goal ? "Sửa mục tiêu" : "Mục tiêu tiết kiệm"} onClose={onClose}>
      <label className="field"><span>Tên mục tiêu</span><input value={name} onChange={event => setName(event.target.value)} placeholder="Ví dụ: Du lịch Đà Lạt" /></label>
      <AmountInput label="Mục tiêu tiền" value={amount} onChange={setAmount} />
      <label className="field"><span>Ngày mong muốn <em>(không bắt buộc)</em></span><input type="date" value={targetDate} onChange={event => setTargetDate(event.target.value)} /></label>
      <label className="field"><span>Màu mục tiêu</span><input type="color" value={color} onChange={event => setColor(event.target.value)} /></label>
      {error && <p className="form-error">{error}</p>}
      <button className="primary full" disabled={!name.trim() || !amount || submitting} onClick={() => void submit()}>{submitting ? "Đang lưu…" : goal ? "Lưu thay đổi" : "Tạo mục tiêu"}</button>
    </Modal>
  );
}

export function GoalEntryForm({ goal, onSubmit, onClose }: { goal: SavingsGoal; onSubmit: (value: Omit<GoalEntry, "id" | "goalId" | "createdAt">) => Promise<void>; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<GoalEntry["direction"]>("contribution");
  const [date, setDate] = useState(today());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (submitting) return;
    const numericAmount = Number(amount);
    if (!Number.isSafeInteger(numericAmount) || numericAmount <= 0) {
      setError("Số tiền phải là số nguyên dương hợp lệ.");
      return;
    }
    setSubmitting(true); setError("");
    try { await onSubmit({ amount: numericAmount, direction, date }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Không thể lưu đóng góp."); }
    finally { setSubmitting(false); }
  };
  return (
    <Modal title={goal.name} onClose={onClose}>
      <div className="kind-switch">
        <button className={direction === "contribution" ? "selected income-bg" : ""} onClick={() => setDirection("contribution")}>Đóng góp</button>
        <button className={direction === "withdrawal" ? "selected expense-bg" : ""} onClick={() => setDirection("withdrawal")}>Rút ra</button>
      </div>
      <AmountInput value={amount} onChange={setAmount} />
      <label className="field"><span>Ngày</span><input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      <p className="form-note">Khoản này chỉ theo dõi tiến độ mục tiêu, không làm thay đổi số dư.</p>
      {error && <p className="form-error">{error}</p>}
      <button className="primary full" disabled={!amount || Number(amount) <= 0 || submitting} onClick={() => void submit()}>{submitting ? "Đang lưu..." : "Lưu"}</button>
    </Modal>
  );
}

export function InstallmentForm({ installment, scheduleLocked = false, categories, primaryWalletId, onSubmit, onClose }: { installment?: Installment; scheduleLocked?: boolean; categories: Category[]; primaryWalletId: string; onSubmit: (value: Omit<Installment, "id" | "createdAt" | "updatedAt">) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState(installment?.name ?? "");
  const [totalAmount, setTotalAmount] = useState(installment ? String(installment.totalAmount) : "");
  const [totalMonths, setTotalMonths] = useState(installment ? String(installment.totalMonths) : "");
  const [startDate, setStartDate] = useState(installment?.startDate ?? today());
  const [dueDate, setDueDate] = useState(String(installment?.dueDate ?? 15));
  const [categoryId, setCategoryId] = useState(installment?.categoryId ?? "");
  const [priority, setPriority] = useState<ObligationPriority>(installment?.priority ?? "high");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const expenseCategories = React.useMemo(() => categories.filter(c => c.kind === "expense" && !c.archived), [categories]);
  
  React.useEffect(() => { if (!categoryId && expenseCategories.length) setCategoryId(expenseCategories[0].id); }, [categoryId, expenseCategories]);

  return (
    <Modal title={installment ? "Sửa khoản trả góp" : "Thêm món trả góp"} onClose={onClose}>
      <label className="field"><span>Tên món đồ (VD: iPhone 16 Pro)</span><input value={name} onChange={event => setName(event.target.value)} /></label>
      <fieldset className="plain-fieldset" disabled={scheduleLocked}>
      <AmountInput label="Tổng nợ trả góp" value={totalAmount} onChange={setTotalAmount} />
      
      <div className="stat-grid" style={{ gap: 8, marginBottom: 12 }}>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>Số tháng trả</span>
          <input type="number" value={totalMonths} onChange={e => setTotalMonths(e.target.value)} min="1" max="120" />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>Ngày hạn chót (1-31)</span>
          <input type="number" value={dueDate} onChange={e => setDueDate(e.target.value)} min="1" max="31" />
        </label>
      </div>

      <label className="field"><span>Ngày bắt đầu góp</span><input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} /></label>
      </fieldset>
      <label className="field"><span>Danh mục chi</span><select value={categoryId} onChange={event => setCategoryId(event.target.value)}>{expenseCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="field">
        <span>Ưu tiên khi thiếu tiền</span>
        <select value={priority} onChange={event => setPriority(event.target.value as ObligationPriority)}>
          <option value="essential">Thiết yếu — cần bảo vệ trước</option>
          <option value="high">Cao — nên thanh toán đúng hạn</option>
          <option value="normal">Bình thường</option>
          <option value="flexible">Linh hoạt — có thể thương lượng/dời</option>
        </select>
      </label>
      <p className="form-note">Mỗi tháng bạn sẽ trả: {totalAmount && totalMonths ? formatVnd(Number(totalAmount) / Number(totalMonths)) : "0 đ"}{scheduleLocked ? " · Lịch gốc đã khóa vì đã có kỳ thanh toán." : ""}</p>
      
      {error && <p className="form-error">{error}</p>}
      <button className="primary full" disabled={!name || !totalAmount || !totalMonths || !categoryId || !dueDate || submitting} onClick={() => {
        if (submitting) return;
        let validDueDate = Math.floor(Number(dueDate));
        if (isNaN(validDueDate) || validDueDate < 1) validDueDate = 1;
        if (validDueDate > 31) validDueDate = 31;
        const amount = Number(totalAmount);
        const months = Math.floor(Number(totalMonths));
        if (!Number.isSafeInteger(amount) || amount <= 0 || !Number.isSafeInteger(months) || months < 1 || amount < months) {
          setError("Tổng tiền và số kỳ không hợp lệ; mỗi kỳ cần ít nhất 1 đồng.");
          return;
        }
        setSubmitting(true); setError("");
        void onSubmit({ 
          name, 
          totalAmount: amount,
          monthlyAmount: Math.floor(amount / months),
          totalMonths: months,
          startDate, 
          dueDate: validDueDate, 
          priority,
          categoryId, 
          walletId: installment?.walletId ?? primaryWalletId
        }).catch(reason => setError(reason instanceof Error ? reason.message : "Không thể lưu khoản trả góp.")).finally(() => setSubmitting(false));
      }}>
        {installment ? "Lưu thay đổi" : "Tạo khoản trả góp"}
      </button>
    </Modal>
  );
}

export function RecurringForm({ rule, categories, primaryWalletId, onSubmit: saveRecurring, onClose }: { rule?: RecurringRule; categories: Category[]; primaryWalletId: string; onSubmit: (value: Omit<RecurringRule, "id" | "active" | "createdAt" | "updatedAt">) => Promise<void>; onClose: () => void }) {
  const [kind, setKind] = useState<EditableTransactionKind>(rule?.kind === "income" ? "income" : "expense");
  const [amount, setAmount] = useState(rule ? String(rule.amount) : "");
  const [categoryId, setCategoryId] = useState(rule?.categoryId ?? "");
  const [frequency, setFrequency] = useState<RecurringRule["frequency"]>(rule?.frequency ?? "monthly");
  const [date, setDate] = useState(rule?.nextDueDate ?? today());
  const [endDate, setEndDate] = useState(rule?.endDate ?? "");
  const [note, setNote] = useState(rule?.note ?? "");
  const [priority, setPriority] = useState<ObligationPriority>(rule?.priority ?? "normal");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (submitting) return;
    const numericAmount = Number(amount);
    if (!Number.isSafeInteger(numericAmount) || numericAmount <= 0) {
      setError("Số tiền lặp lại phải là số nguyên dương hợp lệ.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await saveRecurring({ kind, amount: numericAmount, categoryId, walletId: rule?.walletId ?? primaryWalletId, frequency, interval: rule?.interval ?? 1, dayOfMonth: Number(date.slice(-2)), startDate: rule?.startDate ?? date, nextDueDate: date, endDate: endDate || undefined, note: note.trim() || undefined, priority: kind === "expense" ? priority : undefined });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể lưu giao dịch lặp.");
    } finally {
      setSubmitting(false);
    }
  };
  const relevant = React.useMemo(() => categories.filter(category => category.kind === kind && !category.archived), [categories, kind]);
  React.useEffect(() => {
    if (!relevant.some(category => category.id === categoryId)) setCategoryId(relevant[0]?.id ?? "");
  }, [categoryId, relevant]);
  return (
    <Modal title={rule ? "Sửa giao dịch lặp" : "Tạo giao dịch lặp"} onClose={onClose}>
      <div className="kind-switch">
        <button className={kind === "expense" ? "selected expense-bg" : ""} onClick={() => setKind("expense")}>Chi tiền</button>
        <button className={kind === "income" ? "selected income-bg" : ""} onClick={() => setKind("income")}>Thu tiền</button>
      </div>
      <AmountInput value={amount} onChange={setAmount} />
      <label className="field"><span>Danh mục</span><select value={categoryId} onChange={event => setCategoryId(event.target.value)}>{relevant.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <label className="field">
        <span>Tần suất</span>
        <select value={frequency} onChange={event => setFrequency(event.target.value as RecurringRule["frequency"])}>
          <option value="daily">Mỗi ngày</option>
          <option value="weekly">Mỗi tuần</option>
          <option value="monthly">Mỗi tháng</option>
          <option value="yearly">Mỗi năm</option>
        </select>
      </label>
      <label className="field"><span>{rule ? "Kỳ tiếp theo" : "Ngày bắt đầu"}</span><input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      <label className="field"><span>Ngày kết thúc <em>(không bắt buộc)</em></span><input type="date" min={date} value={endDate} onChange={event => setEndDate(event.target.value)} /></label>
      <label className="field"><span>Ghi chú <em>(không bắt buộc)</em></span><input value={note} onChange={event => setNote(event.target.value)} placeholder="Ví dụ: tiền nhà" /></label>
      {kind === "expense" && <label className="field">
        <span>Ưu tiên khi thiếu tiền</span>
        <select value={priority} onChange={event => setPriority(event.target.value as ObligationPriority)}>
          <option value="essential">Thiết yếu — cần bảo vệ trước</option>
          <option value="high">Cao — nên thanh toán đúng hạn</option>
          <option value="normal">Bình thường</option>
          <option value="flexible">Linh hoạt — có thể thương lượng/dời</option>
        </select>
      </label>}
      {error && <p className="form-error">{error}</p>}
      <button className="primary full" disabled={!amount || !categoryId || Boolean(endDate && endDate < date) || submitting} onClick={() => void submit()}>{submitting ? "Đang lưu…" : rule ? "Lưu thay đổi" : "Tạo lịch lặp"}</button>
    </Modal>
  );
}

export function BackupForm({ onDone, onClose }: { onDone: (password: string) => Promise<void>; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    if (submitting) return;
    if (password !== confirm) return setError("Hai mật khẩu chưa trùng nhau.");
    setSubmitting(true);
    setError("");
    try { await onDone(password); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Không thể tạo backup."); }
    finally { setSubmitting(false); }
  };
  return (
    <Modal title="Sao lưu mã hóa" onClose={onClose}>
      <p className="form-note">File chỉ mở được bằng mật khẩu này. Daily Money không lưu mật khẩu; quên mật khẩu thì không thể khôi phục file.</p>
      <label className="field"><span>Mật khẩu backup</span><input type="password" value={password} onChange={event => setPassword(event.target.value)} /></label>
      <label className="field"><span>Nhập lại mật khẩu</span><input type="password" value={confirm} onChange={event => setConfirm(event.target.value)} /></label>
      <p className="form-error">{error}</p>
      <button className="primary full" disabled={!password || !confirm || submitting} onClick={() => void submit()}>{submitting ? "Đang tạo…" : "Tạo file backup"}</button>
    </Modal>
  );
}

export function RestoreForm({ onRestore: performRestore, onClose, inputRef }: { inputRef: React.RefObject<HTMLInputElement | null>; onRestore: (file: File, password: string) => Promise<void>; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const onRestore = async (selectedFile: File, value: string) => {
    if (submitting) return;
    setSubmitting(true);
    try { await performRestore(selectedFile, value); }
    finally { setSubmitting(false); }
  };
  return (
    <Modal title="Khôi phục backup" onClose={onClose}>
      <label className="file-field"><Upload size={20} /><span>{file?.name ?? "Chọn file .dailymoney"}</span><input type="file" accept="application/json,.dailymoney" onChange={event => setFile(event.target.files?.[0] ?? null)} ref={inputRef as React.RefObject<HTMLInputElement>} /></label>
      <label className="field"><span>Mật khẩu backup</span><input type="password" value={password} onChange={event => setPassword(event.target.value)} /></label>
      <p className="form-error">{error}</p>
      <button className="primary full" disabled={!file || !password || submitting} onClick={() => { if (file) void onRestore(file, password).catch(error => setError(error instanceof Error ? error.message : "Khôi phục thất bại.")); }}>{submitting ? "Đang khôi phục…" : "Kiểm tra và khôi phục"}</button>
    </Modal>
  );
}

export function ReminderForm({ settings, onSave: persistReminder, onClose }: { settings: AppSettings; onSave: (enabled: boolean, time: string) => Promise<void>; onClose: () => void }) {
  const [enabled, setEnabled] = useState(settings.reminderEnabled ?? false);
  const [time, setTime] = useState(settings.reminderTime ?? "20:00");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const onSave = async (nextEnabled: boolean, nextTime: string) => {
    if (submitting) return;
    setSubmitting(true);
    try { await persistReminder(nextEnabled, nextTime); }
    finally { setSubmitting(false); }
  };
  const native = isNativeApp();
  if (!native && !supportsWebPush()) return (
    <Modal title="Nhắc ghi chép hằng ngày" onClose={onClose}>
      <p className="form-note">Để nhận thông báo PWA trên iPhone, hãy mở Daily Money từ icon đã thêm vào Màn hình chính và bảo đảm iOS cho phép thông báo.</p>
      <button className="primary full" onClick={onClose}>Đã hiểu</button>
    </Modal>
  );
  return (
    <Modal title="Nhắc ghi chép hằng ngày" onClose={onClose}>
      <p className="form-note">{native ? "Thiết bị lưu lịch trực tiếp, kể cả khi app đóng." : "Cloudflare chỉ lưu endpoint thông báo; dữ liệu tài chính vẫn ở trên máy."}</p>
      <label className="checkbox"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} /> Bật nhắc mỗi ngày</label>
      <label className="field"><span>Giờ nhắc</span><input type="time" value={time} onChange={event => setTime(event.target.value)} disabled={!enabled} /></label>
      <p className="form-error">{error}</p>
      <button className="primary full" disabled={submitting} onClick={() => void onSave(enabled, time).catch(value => setError(value instanceof Error ? value.message : "Không thể đặt lịch nhắc."))}>{submitting ? "Đang lưu…" : enabled ? "Cho phép và lưu nhắc" : "Tắt nhắc"}</button>
    </Modal>
  );
}

export function PinForm({ settings, onSave, onDisable, onClose }: { settings: AppSettings; onSave: (pin: string) => Promise<void>; onDisable: () => Promise<void>; onClose: () => void }) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const save = async () => {
    if (submitting) return;
    if (pin.length !== 6) return setError("PIN cần đúng 6 số.");
    if (pin !== confirm) return setError("PIN chưa trùng nhau.");
    setSubmitting(true); setError("");
    try { await onSave(pin); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Không thể lưu PIN."); }
    finally { setSubmitting(false); }
  };
  const disable = async () => {
    if (submitting || !window.confirm("Tắt khóa PIN?")) return;
    setSubmitting(true); setError("");
    try { await onDisable(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Không thể tắt PIN."); }
    finally { setSubmitting(false); }
  };
  return (
    <Modal title={settings.lockEnabled ? "Đổi mã PIN" : "Bật mã PIN"} onClose={onClose}>
      <p className="form-note">PIN chỉ khóa giao diện. Dữ liệu backup vẫn được mã hóa bằng mật khẩu riêng.</p>
      <label className="field"><span>Mã PIN gồm 6 số</span><input inputMode="numeric" maxLength={6} value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, ""))} /></label>
      <label className="field"><span>Nhập lại PIN</span><input inputMode="numeric" maxLength={6} value={confirm} onChange={event => setConfirm(event.target.value.replace(/\D/g, ""))} /></label>
      <p className="form-error">{error}</p>
      <button className="primary full" disabled={submitting} onClick={() => void save()}>{submitting ? "Đang lưu…" : "Lưu PIN"}</button>
      {settings.lockEnabled && <button className="text-button danger-text full" disabled={submitting} onClick={() => void disable()}>Tắt PIN</button>}
    </Modal>
  );
}

export function CategoryManager({ categories, onChange, onClose }: { categories: Category[]; onChange: () => Promise<void>; onClose: () => void }) {
  const [kind, setKind] = useState<EditableTransactionKind>("expense");
  const [name, setName] = useState("");
  const [color, setColor] = useState("#7c5cff");
  const [financialClass, setFinancialClass] = useState<FinancialClass>("discretionary");
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [editingName, setEditingName] = useState("");
  const [editingColor, setEditingColor] = useState("#7c5cff");
  const [error, setError] = useState("");
  const visible = categories.filter(category => category.kind === kind && category.archived === showArchived);

  const isDuplicate = (value: string, exceptId?: string) => categories.some(category =>
    category.id !== exceptId && category.kind === kind && category.name.toLocaleLowerCase("vi-VN") === value.trim().toLocaleLowerCase("vi-VN")
  );

  const toggleCategoryArchive = async (category: Category, archived: boolean) => {
    if (archived) {
      const [activeRule, activeInstallment] = await Promise.all([
        db.recurringRules.filter(rule => rule.categoryId === category.id && rule.active).first(),
        db.installments.filter(item => item.categoryId === category.id && !item.closedAt).first()
      ]);
      if (activeRule || activeInstallment) {
        setError("Danh mục đang được dùng cho lịch lặp hoặc trả góp đang mở. Hãy đổi danh mục của nghĩa vụ đó trước.");
        return;
      }
    }
    await db.categories.update(category.id, { archived });
    setError("");
    await onChange();
  };

  const addCategory = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (isDuplicate(trimmed)) return setError("Tên danh mục này đã tồn tại.");
    await db.categories.add({ id: newId(), kind, name: trimmed, icon: "Circle", color, archived: false, builtIn: false, financialClass: kind === "expense" ? financialClass : undefined, createdAt: new Date().toISOString() });
    setName("");
    setError("");
    await onChange();
  };

  const startEditing = (category: Category) => {
    setEditingId(category.id);
    setEditingName(category.name);
    setEditingColor(category.color);
    setError("");
  };

  const saveEditing = async (category: Category) => {
    const trimmed = editingName.trim();
    if (!trimmed) return setError("Tên danh mục không được để trống.");
    if (isDuplicate(trimmed, category.id)) return setError("Tên danh mục này đã tồn tại.");
    await db.categories.update(category.id, { name: trimmed, color: editingColor });
    setEditingId(undefined);
    setError("");
    await onChange();
  };

  return (
    <Modal title="Danh mục" onClose={onClose}>
      <div className="kind-switch">
        <button className={kind === "expense" ? "selected expense-bg" : ""} onClick={() => setKind("expense")}>Chi</button>
        <button className={kind === "income" ? "selected income-bg" : ""} onClick={() => setKind("income")}>Thu</button>
      </div>
      <div className="inline-form">
        <input value={name} onChange={event => setName(event.target.value)} placeholder="Tên danh mục mới" />
        <input aria-label="Màu danh mục" type="color" value={color} onChange={event => setColor(event.target.value)} />
        <button className="soft" disabled={!name.trim()} onClick={() => void addCategory()}>Thêm</button>
      </div>
      {kind === "expense" && <label className="field"><span>Nhóm tài chính cho danh mục mới</span><select value={financialClass} onChange={event => setFinancialClass(event.target.value as FinancialClass)}><option value="essential">Thiết yếu</option><option value="discretionary">Tùy chọn</option></select></label>}
      {error && <p className="form-error">{error}</p>}
      <div className="segmented category-status-switch">
        <button className={!showArchived ? "selected" : ""} onClick={() => { setShowArchived(false); setEditingId(undefined); }}>Đang dùng</button>
        <button className={showArchived ? "selected" : ""} onClick={() => { setShowArchived(true); setEditingId(undefined); }}>Đã lưu trữ ({categories.filter(category => category.kind === kind && category.archived).length})</button>
      </div>
      <div className="category-list">
        {visible.map(category => (
          <div className="category-manage-row" key={category.id}>
            {editingId === category.id ? <>
              <input aria-label={`Màu ${category.name}`} className="category-color-input" type="color" value={editingColor} onChange={event => setEditingColor(event.target.value)} />
              <input aria-label="Tên danh mục" className="category-name-input" value={editingName} onChange={event => setEditingName(event.target.value)} autoFocus />
              <button className="icon-button subtle" aria-label="Lưu danh mục" onClick={() => void saveEditing(category)}><Check size={16} /></button>
              <button className="icon-button subtle" aria-label="Hủy sửa" onClick={() => setEditingId(undefined)}><X size={16} /></button>
            </> : <>
              <i style={{ background: category.color }} /><span>{category.name}</span>
              {!showArchived && category.kind === "expense" && <select aria-label={`Nhóm tài chính ${category.name}`} value={category.financialClass ?? "discretionary"} onChange={event => void (async () => { await db.categories.update(category.id, { financialClass: event.target.value as FinancialClass }); await onChange(); })()}><option value="essential">Thiết yếu</option><option value="discretionary">Tùy chọn</option></select>}
              {!showArchived && <button className="icon-button subtle" aria-label={`Sửa ${category.name}`} onClick={() => startEditing(category)}><Pencil size={15} /></button>}
              {!category.builtIn && <button className="icon-button subtle" aria-label={showArchived ? `Khôi phục ${category.name}` : `Lưu trữ ${category.name}`} onClick={() => void toggleCategoryArchive(category, !showArchived)}>{showArchived ? <ArchiveRestore size={15} /> : <Archive size={15} />}</button>}
            </>}
          </div>
        ))}
        {!visible.length && <div className="empty compact"><p>{showArchived ? "Không có danh mục đã lưu trữ." : "Chưa có danh mục trong nhóm này."}</p></div>}
      </div>
      <p className="form-note">Bạn có thể đổi tên và màu hiển thị. Danh mục mặc định được giữ để lịch sử luôn chính xác; danh mục tự tạo có thể lưu trữ rồi khôi phục.</p>
    </Modal>
  );
}

export function OpeningBalanceForm({ current, onSave, onClose }: { current: number; onSave: (value: number) => Promise<void>; onClose: () => void }) {
  const [amount, setAmount] = useState(String(current));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (submitting) return;
    const value = Number(amount || 0);
    if (!Number.isSafeInteger(value)) return setError("Số dư đầu kỳ phải là số nguyên hợp lệ.");
    setSubmitting(true); setError("");
    try { await onSave(value); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Không thể lưu số dư đầu kỳ."); }
    finally { setSubmitting(false); }
  };
  return (
    <Modal title="Số dư đầu kỳ" onClose={onClose}>
      <p className="form-note">Giá trị này là mốc bắt đầu cho số dư chung. Các giao dịch đã ghi sẽ được cộng/trừ từ mốc này.</p>
      <AmountInput value={amount} onChange={setAmount} />
      {error && <p className="form-error">{error}</p>}
      <button className="primary full" disabled={submitting} onClick={() => void submit()}>{submitting ? "Đang lưu…" : "Lưu số dư đầu kỳ"}</button>
    </Modal>
  );
}

export function MinimumReserveForm({ current, onSave, onClose }: { current: number; onSave: (value: number) => Promise<void>; onClose: () => void }) {
  const [amount, setAmount] = useState(String(current));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (submitting) return;
    const value = Number(amount || 0);
    if (!Number.isSafeInteger(value) || value < 0) return setError("Mức tối thiểu phải là số nguyên không âm hợp lệ.");
    setSubmitting(true); setError("");
    try { await onSave(value); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Không thể lưu mức tối thiểu."); }
    finally { setSubmitting(false); }
  };
  return (
    <Modal title="Số dư tối thiểu cần giữ" onClose={onClose}>
      <p className="form-note">Smart Plan luôn giữ ít nhất mức này, ngoài phần đệm tự tính từ chi thiết yếu và nghĩa vụ đến hạn. Đặt 0 để chỉ dùng mức tự tính.</p>
      <AmountInput value={amount} onChange={setAmount} />
      {error && <p className="form-error">{error}</p>}
      <button className="primary full" disabled={submitting} onClick={() => void submit()}>{submitting ? "Đang lưu…" : "Lưu mức tối thiểu"}</button>
    </Modal>
  );
}
