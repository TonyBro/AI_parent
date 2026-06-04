import React from "react";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}

export function Checkbox({ checked, onChange, label, description }: CheckboxProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <label className="checkbox-container">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div className="checkbox-custom"></div>
        <span>{label}</span>
      </label>
      {description && (
        <p className="muted" style={{ fontSize: "12px", margin: "0 0 0 30px" }}>
          {description}
        </p>
      )}
    </div>
  );
}

