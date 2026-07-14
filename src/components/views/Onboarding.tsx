import React, { useState } from "react";
import { ChevronRight, WalletCards } from "lucide-react";
import { db } from "../../db";
import { AmountInput } from "../ui/AmountInput";

export function Onboarding({ onDone }: { onDone: () => Promise<void> }) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

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
          const balance = Number(amount || 0);
          await db.settings.update("settings", {
            onboardingComplete: true,
            openingBalance: balance,
            updatedAt: new Date().toISOString()
          });
          // Cập nhật ví chính (ví đầu tiên) với số dư ban đầu
          const wallets = await db.wallets.toArray();
          if (wallets.length > 0) {
            await db.wallets.update(wallets[0].id, {
              initialBalance: balance,
              updatedAt: new Date().toISOString()
            });
          }
          await onDone();
        }}
      >
        Bắt đầu sử dụng <ChevronRight size={20} />
      </button>
    </main>
  );
}
