import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, Download, RefreshCcw, Trash2 } from "lucide-react";
import { downloadFile } from "../backup";
import { db, exportBackup } from "../db";
import { confirmDeviceDataDeletion } from "../data-reset";

type State = { error: Error | null; busy: boolean; message: string };

export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, busy: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { error, busy: false, message: "" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Daily Money recovery boundary", error, info);
  }

  private run = async (action: () => Promise<void>) => {
    this.setState({ busy: true, message: "" });
    try { await action(); }
    catch (error) { this.setState({ message: error instanceof Error ? error.message : "Không thể hoàn tất thao tác khôi phục." }); }
    finally { this.setState(state => ({ ...state, busy: false })); }
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="onboarding">
        <div className="brand-mark"><AlertTriangle size={38} /></div>
        <p className="eyebrow">DAILY MONEY</p>
        <h1>Ứng dụng cần được khôi phục</h1>
        <p className="muted">Một lỗi dữ liệu hoặc phiên bản đã ngăn Daily Money mở bình thường. Dữ liệu trên thiết bị chưa bị xóa.</p>
        <button className="primary full" disabled={this.state.busy} onClick={() => window.location.reload()}><RefreshCcw size={18} /> Thử tải lại</button>
        <button className="soft full" disabled={this.state.busy} onClick={() => void this.run(async () => {
          const backup = await exportBackup();
          downloadFile("daily-money-recovery-raw.json", JSON.stringify(backup), "application/json");
          this.setState({ message: "Đã yêu cầu trình duyệt tải dữ liệu khôi phục thô." });
        })}><Download size={18} /> Xuất dữ liệu khôi phục</button>
        <button className="text-button danger-text full" disabled={this.state.busy} onClick={() => void this.run(async () => {
          const settings = await db.settings.get("settings").catch(() => undefined);
          if (!(await confirmDeviceDataDeletion(settings))) return;
          await db.delete();
          window.location.reload();
        })}><Trash2 size={18} /> Xóa dữ liệu và khởi tạo lại</button>
        {this.state.message && <p className="form-error">{this.state.message}</p>}
      </main>
    );
  }
}
