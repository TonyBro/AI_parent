import React from "react";

/**
 * Centered header for actions like "New bot"
 */
export function ActionHeader({ icon, title, subtitle }: { icon: React.ReactNode, title: string, subtitle?: string }) {
  return (
    <div className="ui-action-header">
      <div className="ui-action-icon-circle">
        {icon}
      </div>
      <h1 className="ui-action-title">{title}</h1>
      {subtitle && <p className="ui-action-subtitle">{subtitle}</p>}
    </div>
  );
}
