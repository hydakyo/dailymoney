import { useState } from "react";
import { RefreshCcw, WalletCards } from "lucide-react";

export function DataRecoveryView({ onCreatePrimaryWallet, onReset }: { onCreatePrimaryWallet: () => Promise<void>; onReset: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Không thể khôi phục dữ liệu.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="onboarding">
      <div className="brand-mark"><WalletCards size={38} /></div>
      <p className="eyebrow">DAILY MONEY</p>
      <h1>Không tìm thấy ví chính</h1>
      <p className="muted">Dữ liệu trên thiết bị có thể đã được khôi phục không đầy đủ. Bạn có thể tạo lại ví chính mà không xóa lịch sử hiện có.</p>
      <button className="primary full" disabled={busy} onClick={() => void run(onCreatePrimaryWallet)}>Tạo lại ví chính</button>
      <button className="soft full" disabled={busy} onClick={() => void run(onReset)}><RefreshCcw size={18} /> Xóa và khởi tạo lại</button>
      {error && <p className="form-error">{error}</p>}
    </main>
  );
}
