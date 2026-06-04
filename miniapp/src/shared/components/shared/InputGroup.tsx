import React from "react";

/**
 * Input group for forms
 */
export function InputGroup({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <label className="ui-input-group">
      <span className="ui-input-label">{label}</span>
      {children}
    </label>
  );
}
