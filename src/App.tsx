import { lazy, Suspense, type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, ClipboardList, ReceiptText, Settings, Home, CirclePlus, WalletCards } from "lucide-react";
import { decryptBackup, downloadFile, encryptBackup, transactionsCsv, type EncryptedBackup } from "./backup";
import { db, exportBackup, restoreBackup } from "./db";
import { currentMonth, formatVnd, isValidDate, newId, today } from "./domain";
import type { EditableTransactionKind, RecurringRule, Transaction } from "./domain";
import { advanceDueDate, totalBalance, budgetProgress, debtOutstanding, installmentPaymentAmount, monthForecast, monthTotals, oldestUnpaidInstallmentPeriod, paidInstallmentPeriods } from "./finance";
import { addMonths } from "./utils";
import { clearDailyReminder, isNativeApp, setDailyReminder } from "./notifications";
import { clearWebPushReminder, setWebPushReminder, supportsWebPush } from "./web-push";
import "./category.css";

import { useAppStore } from "./store";
import { HomeView } from "./components/views/HomeView";
import { TransactionsView } from "./components/views/TransactionsView";
import { Onboarding } from "./components/views/Onboarding";
import { Unlock } from "./components/views/Unlock";
import { hashPin, toBase64 } from "./utils";
import { generateAdvice } from "./advisor";
import { primaryWallet, requirePrimaryWalletId } from "./wallet";
import { isLegacyTransfer, normalizeEditableTransaction, requireMatchingActiveCategory } from "./transaction";
import { deleteDebtWithRelatedRecords, updateDebtFromDatabase } from "./debt-actions";
import { updateGoalFromDatabase } from "./goal-actions";
import { updateInstallmentFromDatabase } from "./installment-actions";
import { learnCategoryFromText } from "./category-learning";
import { confirmDeviceDataDeletion } from "./data-reset";
import { DataRecoveryView } from "./components/views/DataRecoveryView";
import { StorageRecoveryView } from "./components/views/StorageRecoveryView";

const ReportsView = lazy(() => import("./components/views/ReportsView").then(module => ({ default: module.ReportsView })));
const TrendReport = lazy(() => import("./components/views/ReportsView").then(module => ({ default: module.TrendReport })));
const PlansView = lazy(() => import("./components/views/PlansView").then(module => ({ default: module.PlansView })));
const SettingsView = lazy(() => import("./components/views/SettingsView").then(module => ({ default: module.SettingsView })));
const VoiceTransactionForm = lazy(() => import("./VoiceTransactionForm").then(module => ({ default: module.VoiceTransactionForm })));
const SmartPlanModal = lazy(() => import("./components/modals/SmartPlanModal").then(module => ({ default: module.SmartPlanModal })));
const BackupForm = lazy(() => import("./components/modals/Forms").then(module => ({ default: module.BackupForm })));
const BudgetForm = lazy(() => import("./components/modals/Forms").then(module => ({ default: module.BudgetForm })));
const CategoryManager = lazy(() => import("./components/modals/Forms").then(module => ({ default: module.CategoryManager })));
const DebtForm = lazy(() => import("./components/modals/Forms").then(module => ({ default: module.DebtForm })));
const DebtPaymentForm = lazy(() => import("./components/modals/Forms").then(module => ({ default: module.DebtPaymentForm })));
const GoalEntryForm = lazy(() => import("./components/modals/Forms").then(module => ({ default: module.GoalEntryForm })));
const GoalForm = lazy(() => import("./components/modals/Forms").then(module => ({ default: module.GoalForm })));
const InstallmentForm = lazy(() => import("./components/modals/Forms").then(module => ({ default: module.InstallmentForm })));
const MinimumReserveForm = lazy(() => import("./components/modals/Forms").then(module => ({ default: module.MinimumReserveForm })));
const OpeningBalanceForm = lazy(() => import("./components/modals/Forms").then(module => ({ default: module.OpeningBalanceForm })));
const PinForm = lazy(() => import("./components/modals/Forms").then(module => ({ default: module.PinForm })));
const RecurringForm = lazy(() => import("./components/modals/Forms").then(module => ({ default: module.RecurringForm })));
const ReminderForm = lazy(() => import("./components/modals/Forms").then(module => ({ default: module.ReminderForm })));
const RestoreForm = lazy(() => import("./components/modals/Forms").then(module => ({ default: module.RestoreForm })));

type Tab = "home" | "transactions" | "plans" | "reports" | "settings";
type PlanSection = "budgets" | "debts" | "goals" | "installments" | "recurring";
type FloatingAddPosition = { left: number; top: number };
const FLOATING_ADD_POSITION_KEY = "daily-money-floating-add-position-v1";
const FLOATING_ADD_SIZE = 60;
const FLOATING_ADD_EDGE = 8;
const TABBAR_HEIGHT = 76;

function safeAreaInset(name: "top" | "right" | "bottom" | "left") {
  return Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(`--safe-${name}`)) || 0;
}

function clampFloatingAddPosition(position: FloatingAddPosition): FloatingAddPosition {
  const minLeft = safeAreaInset("left") + FLOATING_ADD_EDGE;
  const maxLeft = Math.max(minLeft, window.innerWidth - FLOATING_ADD_SIZE - safeAreaInset("right") - FLOATING_ADD_EDGE);
  const minTop = safeAreaInset("top") + FLOATING_ADD_EDGE;
  const maxTop = Math.max(minTop, window.innerHeight - FLOATING_ADD_SIZE - TABBAR_HEIGHT - safeAreaInset("bottom"));
  return {
    left: Math.min(Math.max(minLeft, position.left), maxLeft),
    top: Math.min(Math.max(minTop, position.top), maxTop)
  };
}
type TransactionInput = {
  id?: string;
  kind: EditableTransactionKind;
  amount: number;
  categoryId: string;
  date: string;
  note?: string;
  recurring?: { frequency: RecurringRule["frequency"]; interval: number; dayOfMonth?: number };
};

export default function App() {
  const { data, ready, loadError, locked, setLocked, refresh } = useAppStore();
  
  const [tab, setTab] = useState<Tab>("home");
  const [month, setMonth] = useState(currentMonth());
  const [planSection, setPlanSection] = useState<PlanSection>("budgets");
  
  const [modal, setModal] = useState<
    | "transaction" | "budget" | "debt" | "payment" | "goal" | "goal-entry"
    | "installment"
    | "recurring" | "backup" | "restore" | "pin" | "categories"
    | "opening-balance" | "minimum-reserve" | "reminder" | "smart-plan" | null
  >(null);
  
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null);
  const [selectedInstallmentId, setSelectedInstallmentId] = useState<string | null>(null);
  const [selectedRecurringRuleId, setSelectedRecurringRuleId] = useState<string | null>(null);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [transactionInitialDate, setTransactionInitialDate] = useState<string | null>(null);
  const [updateNow, setUpdateNow] = useState<(() => void) | null>(null);
  const [floatingAddPosition, setFloatingAddPosition] = useState<FloatingAddPosition | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const floatingAddDragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number; startX: number; startY: number; moved: boolean } | null>(null);
  const floatingAddPositionRef = useRef<FloatingAddPosition | null>(null);
  const suppressFloatingAddClickRef = useRef(false);

  const resetDeviceData = async (settings?: typeof data.settings) => {
    const currentSettings = settings ?? await db.settings.get("settings").catch(() => undefined);
    if (!(await confirmDeviceDataDeletion(currentSettings))) return;
    await db.delete();
    window.location.reload();
  };

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && data.settings.lockEnabled) {
        setLocked(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [data.settings.lockEnabled, setLocked]);

  useEffect(() => {
    const theme = data.settings.theme ?? "system";
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.dataset.theme = theme;
  }, [data.settings.theme]);

  useEffect(() => {
    const onUpdateAvailable = (event: Event) => {
      const action = (event as CustomEvent<unknown>).detail;
      if (typeof action === "function") setUpdateNow(() => action as () => void);
    };
    window.addEventListener("daily-money-update-available", onUpdateAvailable);
    return () => window.removeEventListener("daily-money-update-available", onUpdateAvailable);
  }, []);

  useEffect(() => {
    const clampFloatingAdd = () => {
      const current = floatingAddPositionRef.current;
      if (!current) return;
      const next = clampFloatingAddPosition(current);
      if (next.left === current.left && next.top === current.top) return;
      floatingAddPositionRef.current = next;
      setFloatingAddPosition(next);
      window.localStorage.setItem(FLOATING_ADD_POSITION_KEY, JSON.stringify(next));
    };
    window.addEventListener("resize", clampFloatingAdd);
    window.addEventListener("orientationchange", clampFloatingAdd);
    clampFloatingAdd();
    return () => {
      window.removeEventListener("resize", clampFloatingAdd);
      window.removeEventListener("orientationchange", clampFloatingAdd);
    };
  }, [floatingAddPosition]);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(FLOATING_ADD_POSITION_KEY) ?? "null") as FloatingAddPosition | null;
      if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
        floatingAddPositionRef.current = saved;
        setFloatingAddPosition(saved);
      }
    } catch {
      window.localStorage.removeItem(FLOATING_ADD_POSITION_KEY);
    }
  }, []);

  const openQuickTransaction = () => {
    setSelectedTransactionId(null);
    setTransactionInitialDate(null);
    setModal("transaction");
  };

  const moveFloatingAdd = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = floatingAddDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const { left, top } = clampFloatingAddPosition({
      left: event.clientX - drag.offsetX,
      top: event.clientY - drag.offsetY
    });
    if (Math.abs(event.clientX - drag.startX) > 4 || Math.abs(event.clientY - drag.startY) > 4) drag.moved = true;
    const next = { left, top };
    floatingAddPositionRef.current = next;
    setFloatingAddPosition(next);
  };

  const stopMovingFloatingAdd = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = floatingAddDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    floatingAddDragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag.moved && floatingAddPositionRef.current) {
      suppressFloatingAddClickRef.current = true;
      window.localStorage.setItem(FLOATING_ADD_POSITION_KEY, JSON.stringify(floatingAddPositionRef.current));
      window.setTimeout(() => { suppressFloatingAddClickRef.current = false; }, 0);
    }
  };

  const totals = useMemo(() => monthTotals(data.transactions, month), [data.transactions, month]);
  const balance = useMemo(() => totalBalance(data.wallets, data.transactions), [data.wallets, data.transactions]);
  const categoryMap = useMemo(() => new Map(data.categories.map(item => [item.id, item])), [data.categories]);
  const pending = useMemo(
    () => data.occurrences.filter(item => item.status === "pending").sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [data.occurrences]
  );
  const budgetItems = useMemo(
    () => budgetProgress(data.budgets, data.transactions, data.categories, month),
    [data.budgets, data.transactions, data.categories, month]
  );
  const forecast = useMemo(
    () => monthForecast({ balance, month, transactions: data.transactions, rules: data.rules, occurrences: data.occurrences, installments: data.installments, budgets: budgetItems, debts: data.debts, debtPayments: data.payments }),
    [balance, budgetItems, data.debts, data.installments, data.occurrences, data.payments, data.rules, data.transactions, month]
  );

  if (!ready) {
    return (
      <main className="loading">
        <WalletCards size={34} />
        <p>Đang mở sổ tiền của bạn…</p>
      </main>
    );
  }

  if (loadError) {
    return <StorageRecoveryView
      error={loadError}
      onRetry={refresh}
      onReset={resetDeviceData}
    />;
  }

  if (!data.settings.onboardingComplete) return <Onboarding onDone={refresh} />;
  if (locked) return <Unlock settings={data.settings} onUnlocked={() => setLocked(false)} />;

  const currentPrimaryWallet = primaryWallet(data.wallets);
  if (!currentPrimaryWallet) {
    return <DataRecoveryView
      onCreatePrimaryWallet={async () => {
        const now = new Date().toISOString();
        await db.wallets.add({ id: newId(), name: "Ví chính", icon: "Wallet", color: "#6d5dfc", initialBalance: data.settings.openingBalance, archived: false, createdAt: now, updatedAt: now });
        await refresh();
      }}
      onReset={() => resetDeviceData(data.settings)}
    />;
  }
  const primaryWalletId = requirePrimaryWalletId(data.wallets);

  const addTransaction = async (input: TransactionInput) => {
    const now = new Date().toISOString();
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new Error("Số tiền giao dịch không hợp lệ.");
    if (!isValidDate(input.date)) throw new Error("Ngày giao dịch không hợp lệ.");
    requireMatchingActiveCategory(data.categories, input);
    const transactionValues = normalizeEditableTransaction(input, primaryWalletId);
    if (input.id) {
      const existing = await db.transactions.get(input.id);
      if (!existing) throw new Error("Giao dịch này không còn tồn tại.");
      if (existing.debtPaymentId || existing.installmentId || isLegacyTransfer(existing.kind)) {
        throw new Error("Giao dịch liên kết không thể sửa trực tiếp. Hãy điều chỉnh từ luồng công nợ hoặc trả góp.");
      }
      await db.transactions.update(input.id, {
        ...transactionValues,
        updatedAt: now
      });
      setSelectedTransactionId(null);
      setTransactionInitialDate(null);
      setModal(null);
      await refresh();
      return;
    }
    
    await db.transaction("rw", db.transactions, db.recurringRules, async () => {
      const ruleId = input.recurring ? newId() : undefined;
      const transaction: Transaction = {
        id: newId(),
        recurringRuleId: ruleId,
        ...transactionValues,
        createdAt: now,
        updatedAt: now
      };
      await db.transactions.add(transaction);
      if (input.recurring) {
        const draft: RecurringRule = {
          id: ruleId as string,
          kind: transactionValues.kind,
          amount: transactionValues.amount,
          categoryId: transactionValues.categoryId,
          walletId: primaryWalletId,
          note: transactionValues.note,
          frequency: input.recurring.frequency,
          interval: input.recurring.interval,
          dayOfMonth: input.recurring.dayOfMonth,
          startDate: input.date,
          nextDueDate: input.date,
          active: true,
          createdAt: now,
          updatedAt: now
        };
        const rule: RecurringRule = { ...draft, nextDueDate: advanceDueDate(draft, input.date) };
        await db.recurringRules.add(rule);
      }
    });
    setModal(null);
    setTransactionInitialDate(null);
    await refresh();
  };

  const confirmOccurrence = async (id: string, skip = false) => {
    const occurrence = data.occurrences.find(item => item.id === id);
    if (!occurrence) return;
    const rule = data.rules.find(item => item.id === occurrence.ruleId);
    if (!rule) return;
    const now = new Date().toISOString();
    if (isLegacyTransfer(rule.kind)) {
      await db.transaction("rw", db.recurringRules, db.recurringOccurrences, async () => {
        await db.recurringRules.update(rule.id, { active: false, updatedAt: now });
        await db.recurringOccurrences.update(id, { status: "skipped", updatedAt: now });
      });
      window.alert("Quy tắc chuyển ví cũ đã được tắt vì Daily Money hiện dùng một ví.");
      await refresh();
      return;
    }
    await db.transaction("rw", db.recurringOccurrences, db.transactions, async () => {
      const current = await db.recurringOccurrences.get(id);
      if (!current || current.status !== "pending") return;
      if (skip) {
        await db.recurringOccurrences.update(id, { status: "skipped", updatedAt: now });
        return;
      }
      const transactionId = `recurring:${current.ruleId}:${current.dueDate}`;
      const existing = await db.transactions.get(transactionId);
      if (!existing) {
        await db.transactions.add({
          id: transactionId,
          kind: rule.kind,
          amount: rule.amount,
          categoryId: rule.categoryId,
          walletId: primaryWalletId,
          date: current.dueDate,
          note: rule.note,
          recurringRuleId: rule.id,
          createdAt: now,
          updatedAt: now
        });
      }
      await db.recurringOccurrences.update(id, { status: "confirmed", transactionId, updatedAt: now });
    });
    await refresh();
  };

  return (
    <main className="app-shell">
      {updateNow && <div className="update-banner" role="status"><span>Có phiên bản mới — hãy cập nhật sau khi lưu xong dữ liệu đang nhập.</span><button onClick={updateNow}>Cập nhật ngay</button><button className="icon-button subtle" aria-label="Ẩn thông báo cập nhật" onClick={() => setUpdateNow(null)}>×</button></div>}
      <header className="topbar">
        <div>
          <p className="eyebrow">DAILY MONEY</p>
          <h1>
            {tab === "home"
              ? "Chào bạn"
              : ({
                  transactions: "Giao dịch",
                  plans: "Kế hoạch",
                  reports: "Báo cáo",
                  settings: "Cài đặt"
                } as Record<string, string>)[tab]}
          </h1>
        </div>
        <button className="avatar" onClick={() => setTab("settings")} aria-label="Mở cài đặt">
          <Settings size={20} />
        </button>
      </header>

      <div className="content">
        {tab === "home" && (
          <HomeView
            balance={balance} totals={totals} month={month} pending={pending} rules={data.rules} categories={categoryMap}
            budgets={budgetItems} forecast={forecast} advices={generateAdvice(data, month)} onAdd={openQuickTransaction} onPending={confirmOccurrence} onMonth={setMonth}
          />
        )}
        {tab === "transactions" && (
          <TransactionsView
            transactions={data.transactions} categories={categoryMap} month={month} onMonth={setMonth}
            onAdd={date => { setSelectedTransactionId(null); setTransactionInitialDate(date ?? null); setModal("transaction"); }}
            onEdit={id => {
              const transaction = data.transactions.find(item => item.id === id);
              if (transaction && isLegacyTransfer(transaction.kind)) {
                window.alert("Giao dịch chuyển tiền cũ không thể chỉnh sửa để bảo toàn số dư tổng tài sản.");
                return;
              }
              if (transaction?.debtPaymentId || transaction?.installmentId) {
                window.alert("Giao dịch này liên kết với công nợ hoặc trả góp. Hãy điều chỉnh từ luồng thanh toán tương ứng để số liệu luôn khớp.");
                return;
              }
              setTransactionInitialDate(null);
              setSelectedTransactionId(id);
              setModal("transaction");
            }}
            onDelete={async id => {
              const transaction = data.transactions.find(item => item.id === id);
              if (transaction && isLegacyTransfer(transaction.kind)) {
                window.alert("Giao dịch chuyển tiền cũ không thể xóa để bảo toàn số dư tổng tài sản.");
                return;
              }
              await db.transaction("rw", db.transactions, db.debtPayments, db.debts, db.installments, db.recurringOccurrences, async () => {
                const tx = await db.transactions.get(id);
                if (!tx) return;
                if (tx.debtPaymentId) {
                  const payment = await db.debtPayments.get(tx.debtPaymentId);
                  await db.debtPayments.delete(tx.debtPaymentId);
                  if (payment) {
                    const debt = await db.debts.get(payment.debtId);
                    const remainingPayments = await db.debtPayments.where("debtId").equals(payment.debtId).toArray();
                    if (debt && remainingPayments.reduce((sum, item) => sum + item.amount, 0) < debt.principal) {
                      await db.debts.update(debt.id, { closedAt: undefined, updatedAt: new Date().toISOString() });
                    }
                  }
                }
                if (tx.recurringRuleId) {
                  const occs = await db.recurringOccurrences.toArray();
                  for (const occ of occs) {
                    if (occ.transactionId === id) {
                      await db.recurringOccurrences.update(occ.id, { status: "pending", transactionId: undefined });
                    }
                  }
                }
                await db.transactions.delete(id);
                if (tx.installmentId) {
                  const installment = await db.installments.get(tx.installmentId);
                  const payments = await db.transactions.where("installmentId").equals(tx.installmentId).toArray();
                  const paidCount = installment ? paidInstallmentPeriods(installment, payments).size : 0;
                  if (installment && paidCount < installment.totalMonths) {
                    await db.installments.update(installment.id, { closedAt: undefined, updatedAt: new Date().toISOString() });
                  }
                }
              });
              await refresh();
            }}
          />
        )}
        {tab === "plans" && (
          <Suspense fallback={<div className="view-loading">Đang tải kế hoạch…</div>}>
          <PlansView
            section={planSection}
            onSection={setPlanSection}
            budgets={budgetItems}
            categories={data.categories}
            debts={data.debts}
            payments={data.payments}
            goals={data.goals}
            goalEntries={data.goalEntries}
            rules={data.rules}
            installments={data.installments}
            transactions={data.transactions}
            onAdd={section => {
              if (section === "budgets") { setSelectedBudgetId(null); setModal("budget"); }
              if (section === "debts") { setSelectedDebtId(null); setModal("debt"); }
              if (section === "goals") { setSelectedGoalId(null); setModal("goal"); }
              if (section === "installments") { setSelectedInstallmentId(null); setModal("installment"); }
              if (section === "recurring") { setSelectedRecurringRuleId(null); setModal("recurring"); }
            }}
            onSmartPlan={() => {
              if (month !== currentMonth()) {
                window.alert("Kế hoạch thông minh hiện chỉ hỗ trợ tháng đang diễn ra.");
                return;
              }
              setModal("smart-plan");
            }}
            canUseSmartPlan={month === currentMonth()}
            onCopyPreviousBudgets={async () => {
              const previousMonth = addMonths(month, -1);
              const previousBudgets = data.budgets.filter(item => item.month === previousMonth);
              if (!previousBudgets.length) {
                window.alert("Tháng trước chưa có ngân sách để sao chép.");
                return;
              }
              const now = new Date().toISOString();
              let copiedCount = 0;
              await db.transaction("rw", db.budgets, async () => {
                const currentBudgets = await db.budgets.where("month").equals(month).toArray();
                const currentCategoryIds = new Set(currentBudgets.map(item => item.categoryId));
                const missingBudgets = previousBudgets.filter(item => !currentCategoryIds.has(item.categoryId));
                if (!missingBudgets.length) return;
                await db.budgets.bulkAdd(missingBudgets.map(item => ({ ...item, id: newId(), month, createdAt: now, updatedAt: now })));
                copiedCount = missingBudgets.length;
              });
              if (!copiedCount) {
                window.alert("Các danh mục ngân sách của tháng này đã đầy đủ.");
                return;
              }
              await refresh();
            }}
            onPay={id => { setSelectedDebtId(id); setModal("payment"); }}
            onUpdateDebt={async (id, patch) => { await db.debts.update(id, { ...patch, updatedAt: new Date().toISOString() }); await refresh(); }}
            onContribute={id => { setSelectedGoalId(id); setModal("goal-entry"); }}
            onToggleRule={async rule => { await db.recurringRules.update(rule.id, { active: !rule.active, updatedAt: new Date().toISOString() }); await refresh(); }}
            onEditBudget={id => { setSelectedBudgetId(id); setModal("budget"); }}
            onEditDebt={id => { setSelectedDebtId(id); setModal("debt"); }}
            onEditGoal={id => { setSelectedGoalId(id); setModal("goal"); }}
            onEditRule={id => { setSelectedRecurringRuleId(id); setModal("recurring"); }}
            onEditInstallment={id => { setSelectedInstallmentId(id); setModal("installment"); }}
            onDeleteBudget={async id => { await db.budgets.delete(id); await refresh(); }}
            onDeleteDebt={async id => { await deleteDebtWithRelatedRecords(db, id); await refresh(); }}
            onDeleteGoal={async id => { await db.transaction("rw", db.goals, db.goalEntries, async () => { await db.goalEntries.where("goalId").equals(id).delete(); await db.goals.delete(id); }); await refresh(); }}
            onDeleteRule={async ruleId => {
              await db.transaction("rw", db.recurringRules, db.recurringOccurrences, async () => {
                await db.recurringOccurrences.where("ruleId").equals(ruleId).delete();
                // Keep the rule as a historical reference for confirmed transactions.
                await db.recurringRules.update(ruleId, { active: false, archived: true, updatedAt: new Date().toISOString() });
              });
              await refresh();
            }}
            onDeleteInstallment={async id => {
              await db.transaction("rw", db.installments, db.transactions, async () => {
                await db.transactions.where("installmentId").equals(id).modify({ installmentId: undefined, installmentPeriod: undefined });
                await db.installments.delete(id);
              });
              await refresh();
            }}
            onPayInstallment={async installment => {
              const installmentPeriod = oldestUnpaidInstallmentPeriod(installment, data.transactions);
              if (!installmentPeriod) {
                window.alert("Khoản trả góp này đã thanh toán đủ số kỳ.");
                return;
              }
              if (installmentPeriod > today().slice(0, 7)) {
                window.alert(`Chưa đến kỳ ${installmentPeriod}.`);
                return;
              }
              const existingPayment = await db.transactions.where("[installmentId+installmentPeriod]").equals([installment.id, installmentPeriod]).first();
              if (existingPayment) {
                window.alert("Kỳ trả góp tháng này đã được xác nhận.");
                return;
              }
              const paymentAmount = installmentPaymentAmount(installment, installmentPeriod);
              if (!window.confirm(`Ghi chi ${formatVnd(paymentAmount)} cho kỳ ${installmentPeriod} của ${installment.name}?`)) return;
              const now = new Date().toISOString();
              await db.transaction("rw", db.transactions, db.installments, async () => {
                const paidForPeriod = await db.transactions.where("[installmentId+installmentPeriod]").equals([installment.id, installmentPeriod]).first();
                if (paidForPeriod) throw new Error("duplicate-installment-payment");
                await db.transactions.add({ id: newId(), kind: "expense", amount: paymentAmount, categoryId: installment.categoryId, walletId: primaryWalletId, date: today(), note: `Trả góp: ${installment.name}`, installmentId: installment.id, installmentPeriod, createdAt: now, updatedAt: now });
                const payments = await db.transactions.where("installmentId").equals(installment.id).toArray();
                const paidCount = paidInstallmentPeriods(installment, payments).size;
                if (paidCount >= installment.totalMonths) await db.installments.update(installment.id, { closedAt: now, updatedAt: now });
              });
              await refresh();
            }}
          />
          </Suspense>
        )}
        {tab === "reports" && (
          <Suspense fallback={<main className="loading"><p>Đang tải báo cáo…</p></main>}>
            <ReportsView transactions={data.transactions} categories={categoryMap} budgets={budgetItems} month={month} onMonth={setMonth} />
            <TrendReport transactions={data.transactions} month={month} />
          </Suspense>
        )}
        {tab === "settings" && (
          <Suspense fallback={<div className="view-loading">Đang tải cài đặt…</div>}>
          <SettingsView
            settings={data.settings} primaryBalance={currentPrimaryWallet?.initialBalance ?? data.settings.openingBalance} categories={data.categories} transactions={data.transactions}
            onOpeningBalance={() => setModal("opening-balance")} onMinimumReserve={() => setModal("minimum-reserve")} onTheme={async theme => { await db.settings.update("settings", { theme, updatedAt: new Date().toISOString() }); await refresh(); }} onCategories={() => setModal("categories")}
            onReminder={() => setModal("reminder")} onBackup={() => setModal("backup")} onRestore={() => setModal("restore")}
            onPin={() => setModal("pin")}
            onExportCsv={() => {
              const sorted = [...data.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
              const csv = transactionsCsv(
                sorted.map(transaction => ({
                  ...transaction,
                  category: categoryMap.get(transaction.categoryId)?.name ?? "Không rõ"
                }))
              );
              downloadFile(`daily-money-${today()}.csv`, csv, "text/csv;charset=utf-8");
            }}
            onReset={() => { void resetDeviceData(data.settings); }}
          />
          </Suspense>
        )}
      </div>


      {!modal && <button
        type="button"
        className={`quick-add-fab ${floatingAddDragRef.current ? "is-dragging" : ""}`}
        style={floatingAddPosition ? { left: floatingAddPosition.left, top: floatingAddPosition.top, transform: "none" } : undefined}
        aria-label="Ghi giao dịch nhanh"
        title="Ghi giao dịch nhanh — kéo để di chuyển"
        onPointerDown={event => {
          const rect = event.currentTarget.getBoundingClientRect();
          floatingAddDragRef.current = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, startX: event.clientX, startY: event.clientY, moved: false };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={moveFloatingAdd}
        onPointerUp={stopMovingFloatingAdd}
        onPointerCancel={stopMovingFloatingAdd}
        onClick={() => { if (!suppressFloatingAddClickRef.current) openQuickTransaction(); }}
      ><CirclePlus size={30} strokeWidth={2.4} /></button>}

      <nav className="tabbar" aria-label="Điều hướng chính">
        {([
          ["home", Home, "Tổng quan"],
          ["transactions", ReceiptText, "Giao dịch"],
          ["plans", ClipboardList, "Kế hoạch"],
          ["reports", BarChart3, "Báo cáo"],
          ["settings", Settings, "Cài đặt"]
        ] as const).map(([key, Icon, label]) => (
          <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <Suspense fallback={modal ? <div className="modal-backdrop" role="presentation"><section className="modal modal-loading" role="status">Đang mở biểu mẫu…</section></div> : null}>
      {modal === "transaction" && (
        <VoiceTransactionForm
          transaction={data.transactions.find(item => item.id === selectedTransactionId)}
          initialDate={transactionInitialDate ?? undefined}
          categories={data.categories}
          learnings={data.categoryLearnings ?? []}
          transactions={data.transactions}
          onSubmit={addTransaction} 
          onLearn={async value => { await learnCategoryFromText(db, value); await refresh(); }}
          onClose={() => { setSelectedTransactionId(null); setTransactionInitialDate(null); setModal(null); }}
        />
      )}
      {modal === "budget" && (
        <BudgetForm
          budget={data.budgets.find(item => item.id === selectedBudgetId)}
          categories={data.categories} month={month} onClose={() => { setSelectedBudgetId(null); setModal(null); }}
          onSubmit={async values => {
            if (!Number.isSafeInteger(values.limit) || values.limit <= 0) throw new Error("Giới hạn ngân sách không hợp lệ.");
            const now = new Date().toISOString();
            await db.transaction("rw", db.budgets, async () => {
              const selected = selectedBudgetId ? await db.budgets.get(selectedBudgetId) : undefined;
              const existing = selected ?? await db.budgets.where("[month+categoryId]").equals([values.month, values.categoryId]).first();
              await db.budgets.put({ id: existing?.id ?? newId(), ...values, createdAt: existing?.createdAt ?? now, updatedAt: now });
            });
            setSelectedBudgetId(null);
            setModal(null);
            await refresh();
          }}
        />
      )}
      {modal === "debt" && (
        <DebtForm debt={data.debts.find(item => item.id === selectedDebtId)} onClose={() => { setSelectedDebtId(null); setModal(null); }} onSubmit={async value => {
          if (!Number.isSafeInteger(value.principal) || value.principal <= 0) throw new Error("Số tiền gốc không hợp lệ.");
          if (!isValidDate(value.openedDate) || (value.dueDate && !isValidDate(value.dueDate))) throw new Error("Ngày công nợ không hợp lệ.");
          const now = new Date().toISOString();
          if (selectedDebtId) {
            const result = await updateDebtFromDatabase(db, selectedDebtId, value, now);
            if (result.status === "principal-below-paid") {
              window.alert(`Số tiền gốc không thể thấp hơn ${formatVnd(result.paid)} đã thanh toán.`);
              return;
            }
            if (result.status === "not-found") {
              window.alert("Khoản công nợ này không còn tồn tại.");
              await refresh();
              return;
            }
          } else {
            await db.debts.add({ id: newId(), ...value, createdAt: now, updatedAt: now });
          }
          setSelectedDebtId(null); setModal(null); await refresh();
        }} />
      )}
      {modal === "payment" && selectedDebtId && (
        <DebtPaymentForm
          debt={data.debts.find(item => item.id === selectedDebtId)!}
          outstanding={debtOutstanding(data.debts.find(item => item.id === selectedDebtId)!, data.payments)}
          categories={data.categories}
          onClose={() => { setSelectedDebtId(null); setModal(null); }}
            onSubmit={async value => {
              const debt = data.debts.find(item => item.id === selectedDebtId);
              if (!debt) throw new Error("Không tìm thấy khoản công nợ.");
              const now = new Date().toISOString();
              const expectedKind = debt.kind === "payable" ? "expense" : "income";
              const category = data.categories.find(item => item.kind === expectedKind && !item.archived);
              if (!category) throw new Error(`Chưa có danh mục ${expectedKind === "income" ? "thu" : "chi"} khả dụng.`);
              if (!Number.isSafeInteger(value.amount) || value.amount <= 0) throw new Error("Số tiền thanh toán không hợp lệ.");
              if (!isValidDate(value.date)) throw new Error("Ngày thanh toán không hợp lệ.");
              const transactionId = newId();
              await db.transaction("rw", db.transactions, db.debtPayments, db.debts, async () => {
                const currentDebt = await db.debts.get(debt.id);
                if (!currentDebt || currentDebt.closedAt) throw new Error("Khoản công nợ này đã được tất toán.");
                const currentPayments = await db.debtPayments.where("debtId").equals(debt.id).toArray();
                const outstanding = debtOutstanding(currentDebt, currentPayments);
                if (value.amount > outstanding) throw new Error("Số tiền vượt quá phần công nợ còn lại.");
                await db.transactions.add({ id: transactionId, kind: currentDebt.kind === "payable" ? "expense" : "income", amount: value.amount, categoryId: category.id, walletId: primaryWalletId, date: value.date, note: value.note || `Thanh toán nợ: ${currentDebt.person}`, debtPaymentId: value.id, createdAt: now, updatedAt: now });
                await db.debtPayments.add({ ...value, debtId: currentDebt.id, transactionId, createdAt: now });
                if (value.amount >= outstanding) {
                  await db.debts.update(currentDebt.id, { closedAt: now, updatedAt: now });
                }
              });
              setModal(null);
              setSelectedDebtId(null);
              await refresh();
            }}
        />
      )}
      {modal === "goal" && <GoalForm goal={data.goals.find(item => item.id === selectedGoalId)} onClose={() => { setSelectedGoalId(null); setModal(null); }} onSubmit={async value => {
        if (!Number.isSafeInteger(value.target) || value.target <= 0) throw new Error("Mục tiêu tiền không hợp lệ.");
        if (value.targetDate && !isValidDate(value.targetDate)) throw new Error("Ngày mục tiêu không hợp lệ.");
        const now = new Date().toISOString();
        if (selectedGoalId) {
          const result = await updateGoalFromDatabase(db, selectedGoalId, value, now);
          if (result.status === "not-found") throw new Error("Mục tiêu này không còn tồn tại.");
        } else {
          await db.goals.add({ id: newId(), ...value, createdAt: now, updatedAt: now });
        }
        setSelectedGoalId(null); setModal(null); await refresh();
      }} />}
      {modal === "goal-entry" && selectedGoalId && <GoalEntryForm goal={data.goals.find(item => item.id === selectedGoalId)!} onClose={() => { setSelectedGoalId(null); setModal(null); }} onSubmit={async value => {
        const now = new Date().toISOString();
        await db.transaction("rw", db.goals, db.goalEntries, async () => {
          const goal = await db.goals.get(selectedGoalId);
          if (!goal) throw new Error("Mục tiêu không còn tồn tại.");
          const entries = await db.goalEntries.where("goalId").equals(goal.id).toArray();
          const balance = entries.reduce((sum, entry) => sum + (entry.direction === "contribution" ? entry.amount : -entry.amount), 0);
          if (!Number.isSafeInteger(value.amount) || value.amount <= 0) throw new Error("Số tiền không hợp lệ.");
          if (!isValidDate(value.date)) throw new Error("Ngày đóng góp không hợp lệ.");
          if (value.direction === "withdrawal" && value.amount > balance) throw new Error("Không thể rút vượt số dư mục tiêu.");
          const nextBalance = balance + (value.direction === "contribution" ? value.amount : -value.amount);
          await db.goalEntries.add({ id: newId(), goalId: goal.id, ...value, createdAt: now });
          await db.goals.update(goal.id, { closedAt: nextBalance >= goal.target ? now : undefined, updatedAt: now });
        });
        setSelectedGoalId(null); setModal(null); await refresh();
      }} />}
      {modal === "installment" && <InstallmentForm
        installment={data.installments.find(item => item.id === selectedInstallmentId)}
        scheduleLocked={Boolean(selectedInstallmentId && data.installments.find(item => item.id === selectedInstallmentId) && paidInstallmentPeriods(data.installments.find(item => item.id === selectedInstallmentId)!, data.transactions).size)}
        categories={data.categories}
        primaryWalletId={primaryWalletId}
        onClose={() => { setSelectedInstallmentId(null); setModal(null); }}
        onSubmit={async value => {
          if (!Number.isSafeInteger(value.totalAmount) || value.totalAmount <= 0 || !Number.isSafeInteger(value.monthlyAmount) || value.monthlyAmount <= 0 || !Number.isSafeInteger(value.totalMonths) || value.totalMonths <= 0) throw new Error("Thông tin trả góp không hợp lệ.");
          if (!isValidDate(value.startDate)) throw new Error("Ngày bắt đầu trả góp không hợp lệ.");
          const now = new Date().toISOString();
          if (selectedInstallmentId) {
            const result = await updateInstallmentFromDatabase(db, selectedInstallmentId, value, now);
            if (result.status === "not-found") throw new Error("Khoản trả góp này không còn tồn tại.");
          } else {
            await db.installments.add({ id: newId(), ...value, createdAt: now, updatedAt: now });
          }
          setSelectedInstallmentId(null); setModal(null); await refresh();
        }}
      />}
      {modal === "recurring" && <RecurringForm
        rule={data.rules.find(item => item.id === selectedRecurringRuleId)}
        categories={data.categories}
        primaryWalletId={primaryWalletId}
        onClose={() => { setSelectedRecurringRuleId(null); setModal(null); }}
        onSubmit={async value => {
          if (!Number.isSafeInteger(value.amount) || value.amount <= 0) throw new Error("Số tiền lặp lại không hợp lệ.");
          if (!isValidDate(value.startDate) || !isValidDate(value.nextDueDate) || (value.endDate && !isValidDate(value.endDate))) throw new Error("Ngày giao dịch lặp không hợp lệ.");
          if (value.endDate && value.endDate < value.nextDueDate) throw new Error("Ngày kết thúc phải sau kỳ tiếp theo.");
          const existing = data.rules.find(item => item.id === selectedRecurringRuleId);
          const now = new Date().toISOString();
          if (existing) {
            await db.transaction("rw", db.recurringRules, db.recurringOccurrences, async () => {
              await db.recurringRules.update(existing.id, { ...value, updatedAt: now });
              const occurrences = await db.recurringOccurrences.where("ruleId").equals(existing.id).toArray();
              await db.recurringOccurrences.bulkDelete(occurrences.filter(item => item.status === "pending").map(item => item.id));
            });
          } else {
            await db.recurringRules.add({ id: newId(), ...value, active: true, createdAt: now, updatedAt: now });
          }
          setSelectedRecurringRuleId(null); setModal(null); await refresh();
        }}
      />}
      {modal === "backup" && <BackupForm onClose={() => setModal(null)} onDone={async password => { const encrypted = await encryptBackup(await exportBackup(), password); downloadFile(`daily-money-backup-${today()}.dailymoney`, JSON.stringify(encrypted), "application/json"); await db.settings.update("settings", { lastBackupAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); setModal(null); await refresh(); }} />}
      {modal === "restore" && <RestoreForm inputRef={fileRef} onClose={() => setModal(null)} onRestore={async (file, password) => { if (file.size > 20 * 1024 * 1024) return alert("File backup quá lớn (vượt quá 20MB)."); const encrypted = JSON.parse(await file.text()); const backup = await decryptBackup(encrypted, password); if (!(await confirmDeviceDataDeletion(data.settings))) return; const backupPrimaryWallet = primaryWallet(backup.wallets ?? []); const legacyWalletNote = backup.wallets && backup.wallets.length > 1 ? `\n\nBackup chứa ${backup.wallets.length} ví. Daily Money sẽ dùng ví chính: ${backupPrimaryWallet?.name ?? "ví active đầu tiên"}. Dữ liệu các ví cũ vẫn được giữ để không mất lịch sử.` : ""; if (!window.confirm(`Khôi phục ${backup.transactions?.length || 0} giao dịch? Dữ liệu hiện tại trên thiết bị sẽ bị thay thế.${legacyWalletNote}`)) return; const preRestorePayload = await exportBackup(); const preRestoreEncrypted = await encryptBackup(preRestorePayload, password); alert("Hệ thống chuẩn bị tải xuống một file sao lưu an toàn của dữ liệu HIỆN TẠI.\nLưu ý: File này sẽ dùng chung mật khẩu với file bạn đang khôi phục."); downloadFile(`daily-money-pre-restore-${today()}.dailymoney`, JSON.stringify(preRestoreEncrypted), "application/json"); if (!window.confirm("Ứng dụng đã yêu cầu trình duyệt tải bản lưu phòng hờ. Hãy kiểm tra file đã xuất hiện trong thư mục Tải xuống trước khi bấm OK tiếp tục.")) return; await restoreBackup(backup); setModal(null); await refresh(); }} />}
      {modal === "smart-plan" && <SmartPlanModal data={data} month={month} onClose={() => setModal(null)} onApplied={async () => { setModal(null); await refresh(); }} />}
      {modal === "pin" && <PinForm settings={data.settings} onClose={() => setModal(null)} onSave={async pin => { const salt = toBase64(crypto.getRandomValues(new Uint8Array(16))); const pinHash = await hashPin(pin, salt); await db.settings.update("settings", { lockEnabled: true, pinHash, pinSalt: salt, updatedAt: new Date().toISOString() }); setModal(null); await refresh(); }} onDisable={async () => { await db.settings.update("settings", { lockEnabled: false, pinHash: undefined, pinSalt: undefined, updatedAt: new Date().toISOString() }); setModal(null); await refresh(); }} />}
      {modal === "categories" && <CategoryManager categories={data.categories} onClose={() => setModal(null)} onChange={refresh} />}
      {modal === "opening-balance" && <OpeningBalanceForm current={currentPrimaryWallet?.initialBalance ?? data.settings.openingBalance} onClose={() => setModal(null)} onSave={async openingBalance => { if (!Number.isSafeInteger(openingBalance)) throw new Error("Số dư đầu kỳ phải là số nguyên hợp lệ."); await db.settings.update("settings", { openingBalance, updatedAt: new Date().toISOString() }); await db.wallets.update(primaryWalletId, { initialBalance: openingBalance, updatedAt: new Date().toISOString() }); setModal(null); await refresh(); }} />}
      {modal === "minimum-reserve" && <MinimumReserveForm current={data.settings.minimumReserve ?? 0} onClose={() => setModal(null)} onSave={async minimumReserve => { if (!Number.isSafeInteger(minimumReserve) || minimumReserve < 0) throw new Error("Mức tối thiểu phải là số nguyên không âm hợp lệ."); await db.settings.update("settings", { minimumReserve, updatedAt: new Date().toISOString() }); setModal(null); await refresh(); }} />}
      {modal === "reminder" && <ReminderForm settings={data.settings} onClose={() => setModal(null)} onSave={async (enabled, reminderTime) => { if (isNativeApp()) { if (enabled) await setDailyReminder(reminderTime); else await clearDailyReminder(); } else if (enabled) await setWebPushReminder(reminderTime); else await clearWebPushReminder(); await db.settings.update("settings", { reminderEnabled: enabled, reminderTime, updatedAt: new Date().toISOString() }); setModal(null); await refresh(); }} />}
      </Suspense>
    </main>
  );
}
