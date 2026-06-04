import React from "react";
import { useBots } from "../../../domains/bot/store";

/**
 * Simple button component
 */
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
  fullWidth?: boolean;
}

export function Button({ variant = "primary", fullWidth, children, className = "", ...props }: ButtonProps) {
  const { isGlobalLoading } = useBots();
  const baseStyle: React.CSSProperties = {
    padding: '12px 16px',
    borderRadius: '8px',
    border: 'none',
    fontWeight: '600',
    fontSize: '15px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: fullWidth ? '100%' : 'auto',
    opacity: (isGlobalLoading || props.disabled) ? 0.6 : 1,
    pointerEvents: (isGlobalLoading || props.disabled) ? 'none' : 'auto',
    transition: 'background 0.2s',
  };

  const variants = {
    primary: { background: 'var(--accent)', color: 'white' },
    secondary: { background: 'rgba(255, 255, 255, 0.1)', color: 'white' },
    danger: { background: 'var(--danger)', color: 'white' },
  };

  const style = { ...baseStyle, ...variants[variant] };

  return (
    <button style={style} className={className} {...props}>
      {children}
    </button>
  );
}
