import React from "react";
import { formatAmountInput, normalizeAmountInput } from "../../amount";

export function AmountInput({ value, onChange, label = "Số tiền" }: { value: string; onChange: (value: string) => void; label?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input 
        inputMode="numeric" 
        placeholder="0" 
        value={formatAmountInput(value)}
        onChange={event => onChange(normalizeAmountInput(event.target.value))}
      />
    </label>
  );
}
