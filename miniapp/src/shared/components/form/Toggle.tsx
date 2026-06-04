import React from "react";
import { useBots } from "../../../domains/bot/store";

/**
 * Toggle Switch component
 */
export function Toggle({ 
  checked, 
  onChange,
  disabled
}: { 
  checked: boolean, 
  onChange: (checked: boolean) => void,
  disabled?: boolean
}) {
  const { isGlobalLoading } = useBots();
  const isDisabled = disabled || isGlobalLoading;
  
  return (
    <label className="ui-toggle" style={{ opacity: isDisabled ? 0.6 : 1, cursor: isDisabled ? 'not-allowed' : 'pointer' }}>
      <input 
        type="checkbox" 
        checked={checked} 
        onChange={(e) => onChange(e.target.checked)} 
        disabled={isDisabled}
      />
      <span className="ui-toggle-slider"></span>
    </label>
  );
}
