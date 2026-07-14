import { useState } from "react";
import { WalletCards } from "lucide-react";
import { db } from "../../db";
import type { Wallet } from "../../domain";
import { formatVnd, newId } from "../../domain";
import { AmountInput } from "../ui/AmountInput";
import { Modal } from "../ui/Modal";

export function WalletManager({ wallets, onChange, onClose }: { wallets: Wallet[]; onChange: () => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState("");
  const [initialBalance, setInitialBalance] = useState("");

  const addWallet = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const now = new Date().toISOString();
    await db.wallets.add({
      id: newId(),
      name: trimmedName,
      icon: "Wallet",
      color: "#14b8a6",
      initialBalance: Number(initialBalance || 0),
      archived: false,
      createdAt: now,
      updatedAt: now
    });
    setName("");
    setInitialBalance("");
    await onChange();
  };

  return (
    <Modal title="Ví & tài khoản" onClose={onClose}>
      <div className="category-list">
        {wallets.filter(wallet => !wallet.archived).map(wallet => (
          <div className="category-manage-row" key={wallet.id}>
            <WalletCards size={18} />
            <span>{wallet.name}</span>
            <small>{formatVnd(wallet.initialBalance)} ban đầu</small>
          </div>
        ))}
      </div>
      <label className="field">
        <span>Tên ví mới</span>
        <input value={name} onChange={event => setName(event.target.value)} placeholder="Ví dụ: Ngân hàng" />
      </label>
      <AmountInput label="Số dư ban đầu" value={initialBalance} onChange={setInitialBalance} />
      <button className="primary full" disabled={!name.trim()} onClick={() => void addWallet()}>Thêm ví</button>
      <p className="form-note">Sau khi có từ hai ví, bạn có thể dùng “Chuyển ví” khi ghi giao dịch.</p>
    </Modal>
  );
}
