import React from "react";
import { FormLabel } from "./FormLabel";
import { HintText } from "./HintText";

/**
 * Clean form input for use in cards
 */
interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasDivider?: boolean;
  wrapperClassName?: string;
}

export function FormInput({ hasDivider, wrapperClassName = "", ...props }: FormInputProps) {
  return (
    <div className={`ui-form-input-wrapper ${hasDivider ? 'divider' : ''} ${wrapperClassName}`}>
      <input className="ui-form-input" {...props} />
    </div>
  );
}

/**
 * Composable form field with built-in label, input, and hint text
 * Replaces the pattern of wrapping FormLabel + FormInput in a div
 */
interface FormFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  hasDivider?: boolean;
  wrapperClassName?: string;
  containerStyle?: React.CSSProperties;
}

export function FormField({ 
  label, 
  hint, 
  hasDivider, 
  wrapperClassName, 
  containerStyle,
  ...inputProps 
}: FormFieldProps) {
  return (
    <div style={{ padding: '0 16px 16px', ...containerStyle }}>
      {label && <FormLabel>{label}</FormLabel>}
      <FormInput hasDivider={hasDivider} wrapperClassName={wrapperClassName} {...inputProps} />
      {hint && <HintText style={{ marginTop: '4px' }}>{hint}</HintText>}
    </div>
  );
}
