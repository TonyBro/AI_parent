import React, { useEffect } from "react";
import { useBots } from "../../../domains/bot/store";

/**
 * Loader component with optional full-screen overlay
 */
export function Loader({ text, fullscreen = false }: { text?: string, fullscreen?: boolean }) {
  const { setGlobalLoading } = useBots();
  
  useEffect(() => {
    if (fullscreen) {
      setGlobalLoading(true);
      // Disable scrolling on body
      document.body.style.overflow = 'hidden';
      
      return () => {
        setGlobalLoading(false);
        // Re-enable scrolling
        document.body.style.overflow = '';
      };
    }
  }, [fullscreen, setGlobalLoading]);

  return (
    <div className={fullscreen ? "ui-loader-overlay" : "ui-loader-container"}>
      <div className="ui-loader-spinner"></div>
      {text && <div className="ui-loader-text">{text}</div>}
    </div>
  );
}
