import React from "react";

/**
 * Hint text for form fields (smaller, muted text)
 * Use this for helper text, descriptions, or secondary information
 */
export function HintText({ children, style }: { children: React.ReactNode, style?: React.CSSProperties }) {
  return (
    <div style={{ fontSize: '12px', color: 'var(--muted)', ...style }}>
      {children}
    </div>
  );
}
