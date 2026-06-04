import React from "react";

/**
 * Form label for standalone form fields
 * Use this for consistent label styling across all forms
 */
export function FormLabel({ children, style }: { children: React.ReactNode, style?: React.CSSProperties }) {
  return (
    <div style={{ fontSize: '14px', marginBottom: '8px', color: 'var(--fg)', ...style }}>
      {children}
    </div>
  );
}
