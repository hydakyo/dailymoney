import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, ClipboardList, ReceiptText, Settings, Home, CirclePlus, WalletCards } from "lucide-react";
import { decryptBackup, downloadFile, encryptBackup, transactionsCsv, type EncryptedBackup } from "./backup";
import { db, exportBackup, restoreBackup } from "./db";
import { currentMonth, formatVnd, newId, today } from "./domain";
import type { EditableTransactionKind, RecurringRule, Transaction } from "./domain";
import { advanceDueDate, totalBalance, budgetProgress, debtOutstanding, monthForecast, monthTotals, oldestUnpaidInstallmentPeriod } from "./finance";
import { addMonths } from "./utils";
import { clearDailyReminder, isNativeApp, setDailyReminder } from "./notifications";
import { clearWebPushReminder, setWebPushReminder, supportsWebPush } from "./web-push";
import { VoiceTransactionForm } from "./VoiceTransactionForm";
import "./category.css";

import { useAppStore } from "./store";
import { HomeView } from "./components/views/HomeView";
import { TransactionsView } from "./components/views/TransactionsView";
import { PlansView } from "./components/views/PlansView";
import { SettingsView } from "./components/views/SettingsView";
import { Onboarding } from "./components/views/Onboarding";
import { Unlock } from "./components/views/Unlock";
import { hashPin, toBase64 } from "./utils";
import { generateAdvice } from "./advisor";
import { BackupForm, BudgetForm, CategoryManager, DebtForm, DebtPaymentForm, GoalEntryForm, GoalForm, InstallmentForm, OpeningBalanceForm, PinForm, RecurringForm, ReminderForm, RestoreForm } from "./components/modals/Forms";
import { SmartPlanModal } from "./components/modals/SmartPlanModal";
import { primaryWallet, requirePrimaryWalletId } from "./wallet";
import { isLegacyTransfer, normalizeEditableTransaction } from "./transaction";
import { DataRecoveryView } from "./components/views/DataRecoveryView";

const ReportsView = lazy(() => import("./components/views/ReportsView").then(module => ({ default: module.ReportsView })));
const TrendReport = lazy(() => import("./components/views/ReportsView").then(module => ({ default: module.TrendReport })));

type Tab = "home" | "transactions" | "plans" | "reports" | "settings";
type PlanSection = "budgets" | "debts" | "goals" | "installments" | "recurring";
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
  const { data, ready, locked, setLocked, refresh } = useAppStore();
  
  const [tab, setTab] = useState<Tab>("home");
  const [month, setMonth] = useState(currentMonth());
  const [planSection, setPlanSection] = useState<PlanSection>("budgets");
  
  const [modal, setModal] = useState<
    | "transaction" | "budget" | "debt" | "payment" | "goal" | "goal-entry"
    | "installment"
    | "recurring" | "backup" | "restore" | "pin" | "categories"
    | "opening-balance" | "reminder" | "smart-plan" | null
  >(null);
  
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
    () => monthForecast({ balance, month, transactions: data.transactions, rules: data.rules, occurrences: data.occurrences, installments: data.installments, budgets: budgetItems }),
    [balance, budgetItems, data.installments, data.occurrences, data.rules, data.transactions, month]
  );

  if (!ready) {
    return (
      <main className="loading">
        <WalletCards size={34} />
        <p>Đang mở sổ tiền của bạn…</p>
      </main>
    );
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
      onReset={async () => {
        if (!window.confirm("Xóa toàn bộ dữ liệu Daily Money trên thiết bị này?")) return;
        await db.delete();
        window.location.reload();
      }}
    />;
  }
  const primaryWalletId = requirePrimaryWalletId(data.wallets);

  const addTransaction = async (input: TransactionInput) => {
    const now = new Date().toISOString();
    const transactionValues = normalizeEditableTransaction(input, primaryWalletId);
    if (input.id) {
      await db.transactions.update(input.id, {
        ...transactionValues,
        updatedAt: now
      });
      setSelectedTransactionId(null);
      setModal(null);
      await refresh();
      return;
    }
    
    await db.transaction("rw", db.transactions, db.recurringRules, async () => {
      const transaction: Transaction = {
        id: newId(),
        ...transactionValues,
        createdAt: now,
        updatedAt: now
      };
      await db.transactions.add(transaction);
      if (input.recurring) {
        const draft: RecurringRule = {
          id: newId(),
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
      if (skip) {
        await db.recurringOccurrences.update(id, { status: "skipped", updatedAt: now });
      } else {
        const transactionId = newId();
        await db.transactions.add({
          id: transactionId,
          kind: rule.kind,
          amount: rule.amount,
          categoryId: rule.categoryId,
          walletId: primaryWalletId,
          date: occurrence.dueDate,
          note: rule.note,
          recurringRuleId: rule.id,
          createdAt: now,
          updatedAt: now
        });
        await db.recurringOccurrences.update(id, { status: "confirmed", transactionId, updatedAt: now });
      }
    });
    await refresh();
  };

  return (
    <main className="app-shell">
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
            budgets={budgetItems} forecast={forecast} advices={generateAdvice(data, month)} onAdd={() => setModal("transaction")} onPending={confirmOccurrence} onMonth={setMonth}
          />
        )}
        {tab === "transactions" && (
          <TransactionsView
            transactions={data.transactions} categories={categoryMap} month={month} onMonth={setMonth}
            onAdd={() => { setSelectedTransactionId(null); setModal("transaction"); }}
            onEdit={id => {
              const transaction = data.transactions.find(item => item.id === id);
              if (transaction?.debtPaymentId || transaction?.installmentId) {
                window.alert("Giao dịch này liên kết với công nợ hoặc trả góp. Hãy điều chỉnh từ luồng thanh toán tương ứng để số liệu luôn khớp.");
                return;
              }
              setSelectedTransactionId(id);
              setModal("transaction");
            }}
            onDelete={async id => {
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
                  const paidCount = await db.transactions.where("installmentId").equals(tx.installmentId).count();
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
          <PlansView
            section={planSection}
            onSection={setPlanSection}
            budgets={data.budgets.filter(item => item.month === month).map(b => ({ ...b, category: data.categories.find(c => c.id === b.categoryId)!, spent: data.transactions.filter(t => t.categoryId === b.categoryId && t.date.startsWith(month)).reduce((sum, t) => sum + t.amount, 0) }))}
            categories={data.categories}
            debts={data.debts}
            payments={data.payments}
            goals={data.goals}
            goalEntries={data.goalEntries}
            rules={data.rules}
            installments={data.installments}
            transactions={data.transactions}
            onAdd={section => {
              if (section === "budgets") setModal("budget");
              if (section === "debts") setModal("debt");
              if (section === "goals") setModal("goal");
              if (section === "installments") setModal("installment");
              if (section === "recurring") setModal("recurring");
            }}
            onSmartPlan={() => setModal("smart-plan")}
            onCopyPreviousBudgets={async () => {
              const previousMonth = addMonths(month, -1);
              const previousBudgets = data.budgets.filter(item => item.month === previousMonth);
              if (!previousBudgets.length) {
                window.alert("Tháng trước chưa có ngân sách để sao chép.");
                return;
              }
              const currentCategoryIds = new Set(data.budgets.filter(item => item.month === month).map(item => item.categoryId));
              const missingBudgets = previousBudgets.filter(item => !currentCategoryIds.has(item.categoryId));
              if (!missingBudgets.length) {
                window.alert("Các danh mục ngân sách của tháng này đã đầy đủ.");
                return;
              }
              const now = new Date().toISOString();
              await db.budgets.bulkAdd(missingBudgets.map(item => ({ ...item, id: newId(), month, createdAt: now, updatedAt: now })));
              await refresh();
            }}
            onPay={id => { setSelectedDebtId(id); setModal("payment"); }}
            onContribute={id => { setSelectedGoalId(id); setModal("goal-entry"); }}
            onToggleRule={async rule => { await db.recurringRules.update(rule.id, { active: !rule.active, updatedAt: new Date().toISOString() }); await refresh(); }}
            onDeleteBudget={async id => { await db.budgets.delete(id); await refresh(); }}
            onDeleteDebt={async id => { await db.transaction("rw", db.debts, db.debtPayments, db.transactions, async () => { const payments = data.payments.filter(p => p.debtId === id); await db.transactions.bulkDelete(payments.map(p => p.transactionId)); await db.debtPayments.bulkDelete(payments.map(p => p.id)); await db.debts.delete(id); }); await refresh(); }}
            onDeleteGoal={async id => { await db.transaction("rw", db.goals, db.goalEntries, async () => { await db.goalEntries.where("goalId").equals(id).delete(); await db.goals.delete(id); }); await refresh(); }}
            onDeleteRule={async ruleId => {
              await db.transaction("rw", db.recurringRules, db.recurringOccurrences, async () => {
                await db.recurringOccurrences.where("ruleId").equals(ruleId).delete();
                await db.recurringRules.delete(ruleId);
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
              if (!window.confirm(`Ghi chi ${formatVnd(installment.monthlyAmount)} cho kỳ ${installmentPeriod} của ${installment.name}?`)) return;
              const now = new Date().toISOString();
              await db.transaction("rw", db.transactions, db.installments, async () => {
                const paidForPeriod = await db.transactions.where("[installmentId+installmentPeriod]").equals([installment.id, installmentPeriod]).first();
                if (paidForPeriod) throw new Error("Kỳ trả góp tháng này đã được xác nhận.");
                await db.transactions.add({ id: newId(), kind: "expense", amount: installment.monthlyAmount, categoryId: installment.categoryId, walletId: primaryWalletId, date: today(), note: `Trả góp: ${installment.name}`, installmentId: installment.id, installmentPeriod, createdAt: now, updatedAt: now });
                const paidCount = await db.transactions.where("installmentId").equals(installment.id).count();
                if (paidCount >= installment.totalMonths) await db.installments.update(installment.id, { closedAt: now, updatedAt: now });
              });
              await refresh();
            }}
          />
        )}
        {tab === "reports" && (
          <Suspense fallback={<main className="loading"><p>Đang tải báo cáo…</p></main>}>
            <ReportsView transactions={data.transactions} categories={categoryMap} month={month} onMonth={setMonth} />
            <TrendReport transactions={data.transactions} month={month} />
          </Suspense>
        )}
        {tab === "settings" && (
          <SettingsView
            settings={data.settings} primaryBalance={currentPrimaryWallet?.initialBalance ?? data.settings.openingBalance} categories={data.categories} transactions={data.transactions}
            onOpeningBalance={() => setModal("opening-balance")} onCategories={() => setModal("categories")}
            onReminder={() => setModal("reminder")} onBackup={() => setModal("backup")} onRestore={() => setModal("restore")}
            onPin={() => setModal("pin")}
            onExportCsv={() => {
              const csv = transactionsCsv(
                data.transactions.map(transaction => ({
                  ...transaction,
                  category: categoryMap.get(transaction.categoryId)?.name ?? "Không rõ"
                }))
              );
              downloadFile(`daily-money-${today()}.csv`, csv, "text/csv;charset=utf-8");
            }}
            onReset={async () => {
              if (window.confirm("Xóa toàn bộ dữ liệu Daily Money trên thiết bị này?")) {
                await db.delete();
                window.location.reload();
              }
            }}
          />
        )}
      </div>

      <button className="fab" onClick={() => setModal("transaction")} aria-label="Thêm giao dịch">
        <CirclePlus size={28} />
      </button>

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

      {modal === "transaction" && (
        <VoiceTransactionForm
          transaction={data.transactions.find(item => item.id === selectedTransactionId)}
          categories={data.categories}
          onSubmit={addTransaction} 
          onClose={() => { setSelectedTransactionId(null); setModal(null); }}
        />
      )}
      {modal === "budget" && (
        <BudgetForm
          categories={data.categories} month={month} onClose={() => setModal(null)}
          onSubmit={async values => {
            const now = new Date().toISOString();
            const old = data.budgets.find(item => item.categoryId === values.categoryId && item.month === values.month);
            await db.budgets.put({ id: old?.id ?? newId(), ...values, createdAt: old?.createdAt ?? now, updatedAt: now });
            setModal(null);
            await refresh();
          }}
        />
      )}
      {modal === "debt" && (
        <DebtForm onClose={() => setModal(null)} onSubmit={async value => { await db.debts.add({ id: newId(), ...value, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); setModal(null); await refresh(); }} />
      )}
      {modal === "payment" && selectedDebtId && (
        <DebtPaymentForm
          debt={data.debts.find(item => item.id === selectedDebtId)!}
          outstanding={debtOutstanding(data.debts.find(item => item.id === selectedDebtId)!, data.payments)}
          categories={data.categories}
          onClose={() => setModal(null)}
          onSubmit={async value => {
            const debt = data.debts.find(item => item.id === selectedDebtId)!;
            const now = new Date().toISOString();
            const category = data.categories.find(item => item.kind === (debt.kind === "payable" ? "expense" : "income") && !item.archived) ?? data.categories[0];
            const transactionId = newId();
            await db.transaction("rw", db.transactions, db.debtPayments, db.debts, async () => {
              await db.transactions.add({ id: transactionId, kind: debt.kind === "payable" ? "expense" : "income", amount: value.amount, categoryId: category.id, walletId: primaryWalletId, date: value.date, note: value.note || `Thanh toán nợ: ${debt.person}`, debtPaymentId: value.id, createdAt: now, updatedAt: now });
              await db.debtPayments.add({ ...value, debtId: debt.id, transactionId, createdAt: now });
              if (value.amount >= debtOutstanding(debt, data.payments)) {
                await db.debts.update(debt.id, { closedAt: now, updatedAt: now });
              }
            });
            setModal(null);
            await refresh();
          }}
        />
      )}
      {modal === "goal" && <GoalForm onClose={() => setModal(null)} onSubmit={async value => { await db.goals.add({ id: newId(), ...value, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); setModal(null); await refresh(); }} />}
      {modal === "goal-entry" && selectedGoalId && <GoalEntryForm goal={data.goals.find(item => item.id === selectedGoalId)!} onClose={() => setModal(null)} onSubmit={async value => { await db.goalEntries.add({ id: newId(), goalId: selectedGoalId, ...value, createdAt: new Date().toISOString() }); setModal(null); await refresh(); }} />}
      {modal === "installment" && <InstallmentForm categories={data.categories} primaryWalletId={primaryWalletId} onClose={() => setModal(null)} onSubmit={async value => { await db.installments.add({ id: newId(), ...value, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); setModal(null); await refresh(); }} />}
      {modal === "recurring" && <RecurringForm categories={data.categories} primaryWalletId={primaryWalletId} onClose={() => setModal(null)} onSubmit={async value => { await db.recurringRules.add({ id: newId(), ...value, active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); setModal(null); await refresh(); }} />}
      {modal === "backup" && <BackupForm onClose={() => setModal(null)} onDone={async password => { const encrypted = await encryptBackup(await exportBackup(), password); downloadFile(`daily-money-backup-${today()}.dailymoney`, JSON.stringify(encrypted), "application/json"); await db.settings.update("settings", { lastBackupAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); setModal(null); await refresh(); }} />}
      {modal === "restore" && <RestoreForm inputRef={fileRef} onClose={() => setModal(null)} onRestore={async (file, password) => { if (file.size > 20 * 1024 * 1024) return alert("File backup quá lớn (vượt quá 20MB)."); const encrypted = JSON.parse(await file.text()); const backup = await decryptBackup(encrypted, password); const backupPrimaryWallet = primaryWallet(backup.wallets ?? []); const legacyWalletNote = backup.wallets && backup.wallets.length > 1 ? `\n\nBackup chứa ${backup.wallets.length} ví. Daily Money sẽ dùng ví chính: ${backupPrimaryWallet?.name ?? "ví active đầu tiên"}. Dữ liệu các ví cũ vẫn được giữ để không mất lịch sử.` : ""; if (!window.confirm(`Khôi phục ${backup.transactions?.length || 0} giao dịch? Dữ liệu hiện tại trên thiết bị sẽ bị thay thế.${legacyWalletNote}`)) return; const preRestorePayload = await exportBackup(); const preRestoreEncrypted = await encryptBackup(preRestorePayload, password); alert("Hệ thống chuẩn bị tải xuống một file sao lưu an toàn của dữ liệu HIỆN TẠI.\nLưu ý: File này sẽ dùng chung mật khẩu với file bạn đang khôi phục."); downloadFile(`daily-money-pre-restore-${today()}.dailymoney`, JSON.stringify(preRestoreEncrypted), "application/json"); if (!window.confirm("Ứng dụng đã yêu cầu trình duyệt tải bản lưu phòng hờ. Hãy kiểm tra file đã xuất hiện trong thư mục Tải xuống trước khi bấm OK tiếp tục.")) return; await restoreBackup(backup); setModal(null); await refresh(); }} />}
      {modal === "smart-plan" && <SmartPlanModal data={data} month={month} onClose={() => setModal(null)} onApplied={async () => { setModal(null); await refresh(); }} />}
      {modal === "pin" && <PinForm settings={data.settings} onClose={() => setModal(null)} onSave={async pin => { const salt = toBase64(crypto.getRandomValues(new Uint8Array(16))); const pinHash = await hashPin(pin, salt); await db.settings.update("settings", { lockEnabled: true, pinHash, pinSalt: salt, updatedAt: new Date().toISOString() }); setModal(null); await refresh(); }} onDisable={async () => { await db.settings.update("settings", { lockEnabled: false, pinHash: undefined, pinSalt: undefined, updatedAt: new Date().toISOString() }); setModal(null); await refresh(); }} />}
      {modal === "categories" && <CategoryManager categories={data.categories} onClose={() => setModal(null)} onChange={refresh} />}
      {modal === "opening-balance" && <OpeningBalanceForm current={currentPrimaryWallet?.initialBalance ?? data.settings.openingBalance} onClose={() => setModal(null)} onSave={async openingBalance => { await db.settings.update("settings", { openingBalance, updatedAt: new Date().toISOString() }); await db.wallets.update(primaryWalletId, { initialBalance: openingBalance, updatedAt: new Date().toISOString() }); setModal(null); await refresh(); }} />}
      {modal === "reminder" && <ReminderForm settings={data.settings} onClose={() => setModal(null)} onSave={async (enabled, reminderTime) => { if (isNativeApp()) { if (enabled) await setDailyReminder(reminderTime); else await clearDailyReminder(); } else if (enabled) await setWebPushReminder(reminderTime); else await clearWebPushReminder(); await db.settings.update("settings", { reminderEnabled: enabled, reminderTime, updatedAt: new Date().toISOString() }); setModal(null); await refresh(); }} />}
    </main>
  );
}
