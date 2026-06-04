import React from "react";
import { FormLabel } from "./FormLabel";
import { HintText } from "./HintText";

/**
 * Clean textarea for use in cards
 */
interface FormTextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasDivider?: boolean;
  wrapperClassName?: string;
}

export function FormTextArea({ hasDivider, wrapperClassName = "", style, className = "", ...props }: FormTextAreaProps) {
  return (
    <div className={`ui-form-input-wrapper ${hasDivider ? 'divider' : ''} ${wrapperClassName}`}>
      <textarea 
        className={`ui-form-input ${className}`} 
        style={{ resize: 'none', ...style }} 
        {...props} 
      />
    </div>
  );
}

/**
 * Composable textarea field with built-in label, textarea, and hint text
 * Replaces the pattern of wrapping FormLabel + FormTextArea in a div
 */
interface FormTextAreaFieldProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  hasDivider?: boolean;
  wrapperClassName?: string;
  containerStyle?: React.CSSProperties;
}

export function FormTextAreaField({ 
  label, 
  hint, 
  hasDivider, 
  wrapperClassName,
  containerStyle,
  ...textareaProps 
}: FormTextAreaFieldProps) {
  return (
    <div style={{ padding: '0 16px 16px', ...containerStyle }}>
      {label && <FormLabel>{label}</FormLabel>}
      <FormTextArea hasDivider={hasDivider} wrapperClassName={wrapperClassName} {...textareaProps} />
      {hint && <HintText style={{ marginTop: '4px' }}>{hint}</HintText>}
    </div>
  );
}
