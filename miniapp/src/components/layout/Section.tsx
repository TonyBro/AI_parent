import React from "react";

/**
 * Section title as seen in Telegram settings
 */
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="section-title">{children}</div>;
}

/**
 * A group of list items with a background card and separators
 */
export function Section({ 
  title, 
  children, 
  contentClassName 
}: { 
  title?: React.ReactNode; 
  children: React.ReactNode;
  contentClassName?: string;
}) {
  return (
    <div className="ui-section">
      {title && <SectionTitle>{title}</SectionTitle>}
      <div className={`ui-card ${contentClassName || ''}`}>
        {children}
      </div>
    </div>
  );
}
