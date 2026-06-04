import React from "react";
import { useTranslation } from "../../shared/i18n";

/**
 * Profile header with centered avatar, name, and username
 */
export function ProfileHeader({ 
  avatar, 
  name, 
  username,
  subscriberCount
}: { 
  avatar: React.ReactNode, 
  name: string, 
  username: string,
  subscriberCount?: number
}) {
  const { t } = useTranslation();
  
  return (
    <div className="ui-profile-header">
      <div className="ui-avatar-container">
        <div className="ui-avatar-large">
          {typeof avatar === 'string' ? avatar : avatar}
        </div>
      </div>
      <h1 className="ui-profile-name">{name}</h1>
      <p className="ui-profile-username">{username}</p>
      {subscriberCount !== undefined && subscriberCount > 0 && (
        <p style={{ 
          fontSize: '14px', 
          color: 'var(--muted)', 
          margin: '4px 0 0 0' 
        }}>
          {subscriberCount} {t("miniapp.followers")}
        </p>
      )}
    </div>
  );
}
