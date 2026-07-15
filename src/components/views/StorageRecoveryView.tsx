import { RefreshCcw, RotateCcw, TriangleAlert } from "lucide-react";
import { useState } from "react";

export function StorageRecoveryView({ error, onRetry, onReset }: { error: string; onRetry: () => Promise<void>; onReset: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setActionError("");
    try {
      await action();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Không thể hoàn tất thao tác này.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="onboarding">
      <div className="brand-mark"><TriangleAlert size={38} /></div>
      <p className="eyebrow">DAILY MONEY</p>
      <h1>Chưa thể mở dữ liệu</h1>
      <p className="muted">{error}</p>
      <p className="form-note">Hãy thử mở lại trước. Chỉ xóa dữ liệu khi bạn đã có file backup hoặc chấp nhận khởi tạo lại ứng dụng.</p>
      <button className="primary full" disabled={busy} onClick={() => void run(onRetry)}><RefreshCcw size={18} /> Thử mở lại</button>
      <button className="soft full" disabled={busy} onClick={() => void run(onReset)}><RotateCcw size={18} /> Xóa dữ liệu và khởi tạo lại</button>
      {actionError && <p className="form-error">{actionError}</p>}
    </main>
  );
}
