import React, { useState } from "react";
import { LockKeyhole } from "lucide-react";
import type { AppSettings } from "../../domain";
import { hashPin } from "../../utils";

export function Unlock({ settings, onUnlocked }: { settings: AppSettings; onUnlocked: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

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
        onChange={event => setPin(event.target.value.replace(/\D/g, ""))}
      />
      <p className="form-error">{error}</p>
      <button
        className="primary full"
        onClick={async () => {
          if (!settings.pinSalt || !settings.pinHash) return;
          if ((await hashPin(pin, settings.pinSalt)) === settings.pinHash) {
            onUnlocked();
          } else {
            setError("Mã PIN chưa đúng.");
          }
        }}
      >
        Mở khóa
      </button>
    </main>
  );
}
