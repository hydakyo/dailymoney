import { ChevronRight, KeyRound, BellRing, Download, Upload, ReceiptText, WalletCards, ClipboardList } from "lucide-react";
import type { AppSettings, Category, Transaction } from "../../domain";
import { formatVnd } from "../../domain";
import { isNativeApp } from "../../notifications";
import { supportsWebPush } from "../../web-push";
import { Card } from "../ui/Card";

export function SettingsView({
  settings,
  primaryBalance,
  transactions,
  categories,
  onOpeningBalance,
  onCategories,
  onReminder,
  onBackup,
  onRestore,
  onPin,
  onExportCsv,
  onReset,
}: {
  settings: AppSettings;
  primaryBalance: number;
  transactions: Transaction[];
  categories: Category[];
  onOpeningBalance: () => void;
  onCategories: () => void;
  onReminder: () => void;
  onBackup: () => void;
  onRestore: () => void;
  onPin: () => void;
  onExportCsv: () => void;
  onReset: () => void;
}) {
  return (
    <div className="settings-list">
      <Card>
        <div className="settings-row">
          <div>
            <strong>Khóa ứng dụng</strong>
            <p>{settings.lockEnabled ? "PIN đang được bật" : "Dựa vào khóa thiết bị"}</p>
          </div>
          <button className="soft" onClick={onPin}>
            <KeyRound size={17} /> {settings.lockEnabled ? "Đổi PIN" : "Bật PIN"}
          </button>
        </div>
      </Card>
      
      <section className="section-head">
        <h2>Nhắc nhở</h2>
      </section>
      <Card>
        <button className="settings-action" onClick={onReminder}>
          <BellRing />
          <span>
            <strong>Nhắc ghi chép hằng ngày</strong>
            <small>
              {settings.reminderEnabled
                ? `Mỗi ngày lúc ${settings.reminderTime ?? "20:00"}`
                : isNativeApp()
                ? "Chưa bật thông báo local"
                : supportsWebPush()
                ? "Bật thông báo PWA"
                : "Mở từ Màn hình chính để bật"}
            </small>
          </span>
          <ChevronRight />
        </button>
      </Card>
      
      <section className="section-head">
        <h2>Dữ liệu</h2>
      </section>
      <Card>
        <button className="settings-action" onClick={onBackup}>
          <Download />
          <span>
            <strong>Sao lưu mã hóa</strong>
            <small>
              {settings.lastBackupAt
                ? `Lần gần nhất: ${new Date(settings.lastBackupAt).toLocaleDateString("vi-VN")}`
                : "Tạo file .dailymoney có mật khẩu"}
            </small>
          </span>
          <ChevronRight />
        </button>
        <button className="settings-action" onClick={onRestore}>
          <Upload />
          <span>
            <strong>Khôi phục backup</strong>
            <small>Thay thế dữ liệu hiện có</small>
          </span>
          <ChevronRight />
        </button>
        <button className="settings-action" onClick={onExportCsv}>
          <ReceiptText />
          <span>
            <strong>Xuất giao dịch CSV</strong>
            <small>{transactions.length} giao dịch · file không mã hóa</small>
          </span>
          <ChevronRight />
        </button>
      </Card>
      
      <section className="section-head">
        <h2>Thông tin</h2>
      </section>
      <Card>
        <button className="settings-action" onClick={onOpeningBalance}>
          <WalletCards />
          <span>
            <strong>Số dư đầu kỳ</strong>
            <small>{formatVnd(primaryBalance)}</small>
          </span>
          <ChevronRight />
        </button>
        <button className="settings-action" onClick={onCategories}>
          <ClipboardList />
          <span>
            <strong>Danh mục</strong>
            <small>{categories.filter(item => !item.archived).length} danh mục đang dùng</small>
          </span>
          <ChevronRight />
        </button>
        <div className="settings-row">
          <div>
            <strong>Đơn vị tiền</strong>
            <p>Việt Nam Đồng</p>
          </div>
          <span className="small-muted">VND</span>
        </div>
      </Card>
      
      <button className="danger full" onClick={onReset}>
        Xóa toàn bộ dữ liệu trên thiết bị
      </button>
    </div>
  );
}
