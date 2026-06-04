import React from "react";
import { useTranslation } from "../../i18n";
import { useBots } from "../../../domains/bot/store";
import { Key } from "./icons";
import { ICON_SIZES } from "./constants";

/**
 * Token card with Copy and Revoke buttons
 */
export function TokenCard({ token, onCopy, onRevoke }: { token: string, onCopy: () => void, onRevoke: () => void }) {
  const { t } = useTranslation();
  const { isGlobalLoading } = useBots();
  return (
    <div className="ui-token-card">
      <div className="ui-token-input-container">
        <span className="ui-token-icon">
          <Key size={ICON_SIZES.small} color="white" />
        </span>
        <input className="ui-token-display" type="text" value={token} readOnly />
      </div>
      <div className="ui-token-actions">
        <button className="ui-btn-copy" onClick={onCopy} disabled={isGlobalLoading} style={{ opacity: isGlobalLoading ? 0.6 : 1 }}>{t("miniapp.copy")}</button>
        <button className="ui-btn-revoke" onClick={onRevoke} disabled={isGlobalLoading} style={{ opacity: isGlobalLoading ? 0.6 : 1 }}>{t("miniapp.revoke")}</button>
      </div>
    </div>
  );
}
