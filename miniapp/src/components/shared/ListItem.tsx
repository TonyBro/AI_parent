import React from "react";
import { useBots } from "../../domains/bot/store";
import { IconChevron, IconDrag } from "./icons";

/**
 * A single row item with an icon, label, and chevron
 */
interface ListItemProps {
  icon?: React.ReactNode;
  label: string;
  subtitle?: string;
  onClick?: () => void;
  isAction?: boolean;
  isDanger?: boolean;
  trailing?: React.ReactNode;
  dragHandleProps?: any;
  disabled?: boolean;
}

export function ListItem({ icon, label, subtitle, onClick, isAction, isDanger, trailing, dragHandleProps, disabled }: ListItemProps) {
  const { isGlobalLoading } = useBots();
  const isDisabled = disabled || isGlobalLoading;

  return (
    <div className="ui-list-item-container" style={{ display: 'flex', alignItems: 'center' }}>
      {dragHandleProps && (
        <div {...dragHandleProps} className="ui-sortable-handle">
          <IconDrag />
        </div>
      )}
      <button 
        className={`ui-list-item ${isAction ? 'action' : ''} ${isDanger ? 'danger' : ''}`} 
        onClick={onClick}
        disabled={isDisabled}
        style={{ 
          flex: 1, 
          paddingLeft: dragHandleProps ? '8px' : '16px',
          opacity: isDisabled ? 0.6 : 1,
          cursor: isDisabled ? 'not-allowed' : 'pointer'
        }}
      >
        {icon && (
          <div className="ui-list-item-icon">
            {typeof icon === 'string' ? <span>{icon}</span> : icon}
          </div>
        )}
        <div className="ui-list-item-content">
          <div className="ui-list-item-label">{label}</div>
          {subtitle && <div className="ui-list-item-subtitle">{subtitle}</div>}
        </div>
        <div className="ui-list-item-arrow">
          {isDanger ? null : (trailing || <IconChevron />)}
        </div>
      </button>
    </div>
  );
}
