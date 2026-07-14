# Daily Money

Daily Money là PWA quản lý tài chính cá nhân bằng tiếng Việt, lưu dữ liệu hoàn toàn trên thiết bị qua IndexedDB.

## Chức năng

- Thu/chi, số dư chung, danh mục, tìm kiếm, sửa và xóa giao dịch.
- Ngân sách tháng theo danh mục, không rollover.
- Giao dịch lặp cần xác nhận theo ngày, tuần, tháng hoặc năm; sổ phải thu/phải trả, mục tiêu tiết kiệm.
- Báo cáo theo danh mục và xu hướng dòng tiền sáu tháng.
- PIN khóa giao diện; backup AES-GCM có mật khẩu và xuất CSV.
- PWA có manifest, service worker và cấu hình Capacitor để bọc native về sau.

## Chạy và kiểm tra

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run test
npm.cmd run build
```

## Phục vụ qua Cloudflare Tunnel

Tunnel cho `https://dm.kelvin.io.vn` đang dùng origin cổng `4173`. Sau khi máy khởi động lại, mở PowerShell tại thư mục dự án và chạy:

```powershell
npm.cmd run host
```

Giữ cửa sổ này chạy để domain tiếp tục phục vụ bản production mới nhất. Dịch vụ Cloudflared được cài dạng Windows service và tự khởi động cùng máy.

## Cài trên iPhone

1. Mở `https://dm.kelvin.io.vn` trong Safari trên iPhone.
2. Chọn Share → Add to Home Screen → Add.
3. Mở Daily Money từ icon vừa thêm; sau lần mở đầu, app shell có thể chạy offline.

Vì origin hiện ở máy cá nhân, cần giữ máy và lệnh `npm.cmd run host` chạy khi muốn cài mới hoặc nhận cập nhật. Dữ liệu tài chính vẫn nằm local trên iPhone; hãy tạo backup mã hóa từ Cài đặt định kỳ.

## Bản native iOS và nhắc local

Project Capacitor nằm trong `ios/` và đã tích hợp `@capacitor/local-notifications`. Trong bản native, vào **Cài đặt → Nhắc ghi chép hằng ngày**, chọn giờ rồi cho phép thông báo. Lịch được iPhone lưu trực tiếp trên thiết bị, kể cả khi app đóng và không có internet.

Để build/cài native cần một máy Mac có Xcode:

```bash
npm install
npm run ios:sync
npx cap open ios
```

Trong Xcode, chọn Signing Team của bạn, chọn iPhone đích rồi Run. Mỗi lần thay đổi web app, chạy lại `npm run ios:sync` trước khi build Xcode.

## Nhắc PWA qua Cloudflare Worker

Không có Mac vẫn có thể nhận nhắc hằng ngày từ bản PWA đã thêm vào Màn hình chính. Worker chỉ lưu endpoint Web Push và giờ nhắc, không lưu số dư hay giao dịch.

Sau khi đăng nhập Cloudflare, tạo D1 rồi thay `database_id` trong `workers/reminders/wrangler.jsonc` bằng ID vừa nhận:

```bash
npx wrangler login
npx wrangler d1 create daily-money-reminders
npx wrangler d1 execute daily-money-reminders --remote --file=workers/reminders/schema.sql
```

Tạo VAPID keys, đặt chúng thành Worker secrets, sau đó deploy:

```bash
npx web-push generate-vapid-keys
npx wrangler secret put VAPID_PUBLIC_KEY --config workers/reminders/wrangler.jsonc
npx wrangler secret put VAPID_PRIVATE_KEY --config workers/reminders/wrangler.jsonc
npx wrangler secret put VAPID_SUBJECT --config workers/reminders/wrangler.jsonc
npm run reminders:deploy
```

Worker dùng route `https://dm.kelvin.io.vn/api/reminders/*`. Sau khi deploy, mở PWA từ Màn hình chính → **Cài đặt → Nhắc ghi chép hằng ngày** → bật và chọn giờ.
