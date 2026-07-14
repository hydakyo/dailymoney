import React, { useState, useEffect } from "react";
import { LockKeyhole } from "lucide-react";
import type { AppSettings } from "../../domain";
import { hashPin } from "../../utils";

export function Unlock({ settings, onUnlocked }: { settings: AppSettings; onUnlocked: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (lockoutUntil > 0) {
      const interval = setInterval(() => {
        const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
        if (remaining <= 0) {
          setLockoutUntil(0);
          setAttempts(0);
          setError("");
          clearInterval(interval);
        } else {
          setTimeLeft(remaining);
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [lockoutUntil]);

  const lockedOut = lockoutUntil > Date.now();

  return (
    <main className="unlock">
      <div className="brand-mark">
        <LockKeyhole size={30} />
      </div>
      <h1>Daily Money đang khóa</h1>
      <p className="muted">Nhập mã PIN để mở sổ tài chính.</p>
      
      <input
        className="pin-input"
        inputMode="numeric"
        maxLength={6}
        autoFocus
        value={pin}
        disabled={lockedOut}
        onChange={event => {
          setPin(event.target.value.replace(/\D/g, ""));
          setError("");
        }}
      />
      
      {lockedOut ? (
        <p className="form-error">Quá nhiều lần thử. Thử lại sau {timeLeft}s.</p>
      ) : (
        <p className="form-error">{error}</p>
      )}
      
      <button
        className="primary full"
        disabled={lockedOut || pin.length < 4}
        onClick={async () => {
          if (!settings.pinSalt || !settings.pinHash) return;
          
          try {
            if (settings.pinSalt.length === 36) {
              // Old SHA-256 PIN detected, gracefully bypass to force reset
              setError("Mã PIN cũ đã bị vô hiệu hóa vì bảo mật. Hãy vào Cài đặt để thiết lập lại.");
              setTimeout(onUnlocked, 3000);
              return;
            }

            const hashed = await hashPin(pin, settings.pinSalt);
            if (hashed === settings.pinHash) {
              onUnlocked();
            } else {
              const newAttempts = attempts + 1;
              setAttempts(newAttempts);
              setPin("");
              if (newAttempts >= 5) {
                setLockoutUntil(Date.now() + 30000);
              } else {
                setError(`Mã PIN chưa đúng (còn ${5 - newAttempts} lần).`);
              }
            }
          } catch (e: any) {
            setError("Lỗi xử lý PIN.");
          }
        }}
      >
        Mở khóa
      </button>
    </main>
  );
}
