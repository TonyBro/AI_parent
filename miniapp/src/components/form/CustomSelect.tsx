import React, { useState, useRef, useEffect } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { ICON_SIZES } from "../shared/constants";
import { useTranslation } from "../../shared/i18n";

export interface CustomSelectOption<T> {
  value: T;
  label: string;
  subLabel?: string;
  icon?: string;
  description?: string;
}

interface CustomSelectProps<T> {
  value: T;
  onChange: (value: T) => void;
  options: CustomSelectOption<T>[];
  placeholder?: string;
  searchable?: boolean;
  maxWidth?: string;
  style?: React.CSSProperties;
}

export function CustomSelect<T extends string | number>({
  value,
  onChange,
  options,
  placeholder,
  searchable = false,
  maxWidth = "100%",
  style,
}: CustomSelectProps<T>) {
  const { t } = useTranslation();
  const displayPlaceholder = placeholder || t("miniapp.select");
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value);
  
  const filteredOptions = searchable && query.trim()
    ? options.filter((o) => 
        o.label.toLowerCase().includes(query.toLowerCase()) || 
        (o.subLabel && o.subLabel.toLowerCase().includes(query.toLowerCase())) ||
        (o.description && o.description.toLowerCase().includes(query.toLowerCase()))
      )
    : options;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleToggle() {
    setIsOpen(!isOpen);
    if (!isOpen) setQuery("");
  }

  function handleSelect(val: T) {
    onChange(val);
    setIsOpen(false);
    setQuery("");
  }

  return (
    <div className="status-selector" ref={containerRef} style={{ width: "100%", maxWidth, ...style }}>
      <button type="button" className="status-selector-button" onClick={handleToggle}>
        <span className="status-selector-value">
          {selectedOption ? (
            <>
              {selectedOption.icon && <span style={{ marginRight: "8px" }}>{selectedOption.icon}</span>}
              <span>{selectedOption.label}</span>
              {selectedOption.subLabel && <span style={{ marginLeft: "6px" }}>({selectedOption.subLabel})</span>}
            </>
          ) : (
            <span style={{ color: '#708499' }}>{displayPlaceholder}</span>
          )}
        </span>
        <span className="status-selector-arrow">
          {isOpen ? <ChevronUp size={ICON_SIZES.small} /> : <ChevronDown size={ICON_SIZES.small} />}
        </span>
      </button>
      
      {isOpen && (
        <div className="status-dropdown">
          {searchable && (
            <div style={{ padding: "8px", borderBottom: "1px solid var(--border)" }}>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("miniapp.search")}
                autoFocus
                onMouseDown={(e) => e.stopPropagation()}
              />
            </div>
          )}
          <div style={{ maxHeight: "240px", overflowY: "auto" }}>
            {filteredOptions.length === 0 ? (
              <div style={{ padding: "12px", textAlign: "center" }} className="muted">
                {t("miniapp.no_results_found")}
              </div>
            ) : (
              filteredOptions.map((opt) => (
                <div
                  key={opt.value}
                  className={`status-option ${value === opt.value ? "selected" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(opt.value);
                  }}
                >
                  <div className="status-option-main">
                    {opt.icon && <span className="status-option-icon">{opt.icon}</span>}
                    <span className="status-option-label" style={{ fontWeight: 600 }}>
                      {opt.label}
                    </span>
                    {opt.subLabel && (
                      <span className="muted" style={{ marginLeft: "6px", fontSize: "12px" }}>
                        ({opt.subLabel})
                      </span>
                    )}
                  </div>
                  {opt.description && (
                    <p className="status-option-description" style={{ paddingLeft: opt.icon ? "28px" : "0" }}>
                      {opt.description}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
