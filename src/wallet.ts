import type { Wallet } from "./domain";

export function primaryWallet(wallets: Wallet[]) {
  return wallets.find(wallet => !wallet.archived) ?? wallets[0];
}

export function requirePrimaryWalletId(wallets: Wallet[]) {
  const wallet = primaryWallet(wallets);
  if (!wallet) throw new Error("Không tìm thấy ví chính. Hãy khởi tạo lại dữ liệu ứng dụng.");
  return wallet.id;
}
