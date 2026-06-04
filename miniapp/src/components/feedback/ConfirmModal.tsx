import React from "react";
import { useBots } from "../../domains/bot/store";
import { Button } from "./Button";

/**
 * Confirmation Modal
 */
interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  onConfirm: () => void;
  onCancel: () => void;
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
      className="ui-modal-overlay" 
      onClick={onCancel}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
      }}
    >
      <div 
        className="ui-modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '12px',
          padding: '20px',
          maxWidth: '400px',
          width: '100%',
        }}
      >
        <h3 style={{ 
          margin: '0 0 8px', 
          fontSize: '18px', 
          fontWeight: '600',
          color: 'var(--text)'
        }}>
          {title}
        </h3>
        <p style={{ 
          margin: '0 0 20px', 
          fontSize: '14px', 
          color: 'var(--muted)',
          lineHeight: '1.4'
        }}>
          {message}
        </p>
        <div style={{ 
          display: 'flex', 
          gap: '8px',
        }}>
          <Button 
            variant="secondary" 
            onClick={onCancel}
            disabled={isGlobalLoading}
            fullWidth
          >
            {cancelText}
          </Button>
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
