import React from "react";

export function AmountInput({ value, onChange, label = "Số tiền" }: { value: string; onChange: (value: string) => void; label?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input 
        inputMode="numeric" 
        placeholder="0" 
        value={value} 
        onChange={event => onChange(event.target.value.replace(/\D/g, ""))} 
      />
    </label>
  );
}
