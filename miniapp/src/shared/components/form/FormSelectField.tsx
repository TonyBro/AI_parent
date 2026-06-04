import React from "react";
import { FormLabel } from "./FormLabel";
import { HintText } from "./HintText";
import { CustomSelect, CustomSelectOption } from "./CustomSelect";

/**
 * Composable select field with built-in label, select, and hint text
 * Wraps CustomSelect with the same composable pattern as FormField
 */
interface FormSelectFieldProps<T extends string | number> {
  label?: string;
  hint?: string;
  value: T;
  onChange: (value: T) => void;
  options: CustomSelectOption<T>[];
  placeholder?: string;
  searchable?: boolean;
  maxWidth?: string;
  style?: React.CSSProperties;
  containerStyle?: React.CSSProperties;
}

export function FormSelectField<T extends string | number>({ 
  label, 
  hint, 
  containerStyle,
  ...selectProps 
}: FormSelectFieldProps<T>) {
  return (
    <div style={{ padding: '0 16px 16px', ...containerStyle }}>
      {label && <FormLabel>{label}</FormLabel>}
      <CustomSelect {...selectProps} />
      {hint && <HintText style={{ marginTop: '4px' }}>{hint}</HintText>}
    </div>
  );
}
