import { useState } from "react";
import { ChevronRight, WalletCards } from "lucide-react";
import { db } from "../../db";
import { AmountInput } from "../ui/AmountInput";
import { requirePrimaryWalletId } from "../../wallet";

export function Onboarding({ onDone }: { onDone: () => Promise<void> }) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <main className="onboarding">
      <div className="brand-mark">
        <WalletCards size={38} />
      </div>
      <p className="eyebrow">DAILY MONEY</p>
      <h1>
        Tiền của bạn.<br />
        <span>Rõ ràng mỗi ngày.</span>
      </h1>
      <p className="muted">
        Bắt đầu bằng số dư hiện tại. Toàn bộ dữ liệu chỉ ở trên thiết bị này.
      </p>
      <AmountInput label="Số dư hiện tại" value={amount} onChange={setAmount} />
      <button
        className="primary full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const balance = Number(amount || 0);
            if (!Number.isSafeInteger(balance)) throw new Error("Số dư phải là số nguyên hợp lệ.");
            const primaryWalletId = requirePrimaryWalletId(await db.wallets.toArray());
            const now = new Date().toISOString();
            await db.transaction("rw", db.settings, db.wallets, async () => {
              await db.settings.update("settings", {
                onboardingComplete: true,
                openingBalance: balance,
                updatedAt: now
              });
              await db.wallets.update(primaryWalletId, {
                initialBalance: balance,
                updatedAt: now
              });
            });
            await onDone();
          } catch (value) {
            setError(value instanceof Error ? value.message : "Không thể khởi tạo ví chính.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Bắt đầu sử dụng <ChevronRight size={20} />
      </button>
      {error && <p className="form-error">{error}</p>}
    </main>
  );
}
