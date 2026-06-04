import React from "react";
import { useBots } from "../../../domains/bot/store";
import { Toggle } from "../form/Toggle";

/**
 * List item with a toggle
 */
export function ToggleItem({ 
  label, 
  subtitle,
  checked, 
  onChange,
  disabled
}: { 
  label: string, 
  subtitle?: string,
  checked: boolean, 
  onChange: (checked: boolean) => void,
  disabled?: boolean
}) {
  const { isGlobalLoading } = useBots();
  const isDisabled = disabled || isGlobalLoading;

  return (
    <div className="ui-list-item" style={{ cursor: 'default', flexDirection: 'column', alignItems: 'stretch' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div className="ui-list-item-label" style={{ flex: 1, paddingRight: '8px', opacity: isDisabled ? 0.6 : 1 }}>{label}</div>
        <Toggle checked={checked} onChange={onChange} disabled={isDisabled} />
      </div>
      {subtitle && (
        <div className="ui-list-item-subtitle" style={{ marginTop: '4px', opacity: isDisabled ? 0.6 : 1 }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}
