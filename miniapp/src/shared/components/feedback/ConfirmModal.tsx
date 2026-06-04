import React from "react";
import { useBots } from "../../../domains/bot/store";
import { Button } from "./Button";

/**
 * Confirmation Modal
 */
interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  variant?: "danger" | "primary";
}

export function ConfirmModal({ 
  isOpen, 
  title, 
  message, 
  confirmText, 
  cancelText, 
  onConfirm, 
  onCancel,
  variant = "danger"
}: ConfirmModalProps) {
  const { isGlobalLoading } = useBots();
  
  if (!isOpen) return null;

  return (
    <div 
      className="ui-loader-overlay" 
      onClick={onCancel}
      style={{
        zIndex: 9999,
        padding: '24px',
      }}
    >
      <div 
        className="ui-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          padding: '24px',
          maxWidth: '320px',
          width: '100%',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        }}
      >
        <h3 style={{ 
          margin: '0 0 12px', 
          fontSize: '18px', 
          fontWeight: '700',
          color: 'var(--fg)',
          textAlign: 'center'
        }}>
          {title}
        </h3>
        <p style={{ 
          margin: '0 0 24px', 
          fontSize: '15px', 
          color: 'var(--fg)',
          lineHeight: '1.4',
          textAlign: 'center',
          opacity: 0.9
        }}>
          {message}
        </p>
        <div style={{ 
          display: 'flex', 
          gap: '12px',
        }}>
          {cancelText && onCancel && (
            <Button 
              variant="secondary" 
              onClick={onCancel}
              disabled={isGlobalLoading}
              fullWidth
            >
              {cancelText}
            </Button>
          )}
          <Button 
            variant={variant}
            onClick={onConfirm}
            disabled={isGlobalLoading}
            fullWidth
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}
