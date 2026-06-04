import React from "react";

/**
 * Global page wrapper to ensure consistent layout and paddings
 */
export function Page({ children, className = "", style }: { children: React.ReactNode, className?: string, style?: React.CSSProperties }) {
  return (
    <div className={`ui-page ${className}`} style={style}>
      {children}
    </div>
  );
}
