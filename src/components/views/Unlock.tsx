import React, { useState, useEffect } from "react";
import { LockKeyhole } from "lucide-react";
import type { AppSettings } from "../../domain";
import { hashPin, hashLegacyPin, timingSafeEqual, toBase64 } from "../../utils";
import { db } from "../../db";

export function Unlock({ settings, onUnlocked }: { settings: AppSettings; onUnlocked: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState(() => Number(localStorage.getItem("pin_failedAttempts") || "0"));
  const [lockoutUntil, setLockoutUntil] = useState<number>(() => Number(localStorage.getItem("pin_lockoutUntil") || "0"));
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (lockoutUntil > 0) {
      const interval = setInterval(() => {
        const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
        if (remaining <= 0) {
          setLockoutUntil(0);
          setAttempts(0);
          setError("");
          localStorage.removeItem("pin_failedAttempts");
          localStorage.removeItem("pin_lockoutUntil");
          clearInterval(interval);
        } else {
          setTimeLeft(remaining);
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [lockoutUntil]);

  const lockedOut = lockoutUntil > Date.now();

  const registerFailedAttempt = () => {
    const newAttempts = attempts + 1;
    setAttempts(newAttempts);
    localStorage.setItem("pin_failedAttempts", newAttempts.toString());
    setPin("");
    
    if (newAttempts >= 5) {
      let penaltySeconds = 30; // 30s
      if (newAttempts >= 20) penaltySeconds = 3600; // 1 hour max
      else if (newAttempts >= 15) penaltySeconds = 600; // 10 minutes
      else if (newAttempts >= 10) penaltySeconds = 120; // 2 minutes
      
      const newLockoutUntil = Date.now() + penaltySeconds * 1000;
      setLockoutUntil(newLockoutUntil);
      localStorage.setItem("pin_lockoutUntil", newLockoutUntil.toString());
    } else {
      setError(`Mã PIN chưa đúng (còn ${5 - (newAttempts % 5)} lần).`);
    }
  };

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
              const legacyHash = await hashLegacyPin(pin, settings.pinSalt);
              if (!timingSafeEqual(legacyHash, settings.pinHash)) {
                registerFailedAttempt();
                return;
              }
              // Transparent migration to PBKDF2
              const newSalt = toBase64(crypto.getRandomValues(new Uint8Array(16)));
              const newHash = await hashPin(pin, newSalt);
              await db.settings.update("settings", {
                pinHash: newHash,
                pinSalt: newSalt,
                updatedAt: new Date().toISOString()
              });
              onUnlocked();
              return;
            }

            const hashed = await hashPin(pin, settings.pinSalt);
            if (timingSafeEqual(hashed, settings.pinHash)) {
              localStorage.removeItem("pin_failedAttempts");
              localStorage.removeItem("pin_lockoutUntil");
              onUnlocked();
            } else {
              registerFailedAttempt();
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
