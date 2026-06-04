import React from 'react';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getMyBots } from './api';
import type { BotDto } from './types';
import { useTranslation } from '../../shared/i18n';

interface BotContextType {
  bots: BotDto[];
  loading: boolean;
  isGlobalLoading: boolean;
  setGlobalLoading: (loading: boolean) => void;
  error: string | null;
  refreshBots: () => Promise<void>;
  getBotById: (id: string) => BotDto | undefined;
  getBotAvatarUrl: (bot: BotDto) => string;
  updateBotAvatar: (botId: string) => void;
}

const BotContext = createContext<BotContextType | undefined>(undefined);

export const BotProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t, translateError } = useTranslation();
  const [bots, setBots] = useState<BotDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGlobalLoading, setGlobalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarVersions, setAvatarVersions] = useState<Record<string, number>>({});

  const refreshBots = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await getMyBots();
      setBots(list);
    } catch (err: any) {
      setError(translateError(err));
    } finally {
      setLoading(false);
    }
  }, [translateError]);

  useEffect(() => {
    refreshBots();
  }, [refreshBots]);

  const getBotById = useCallback((id: string) => {
    return bots.find(b => b.id === id);
  }, [bots]);

  const getBotAvatarUrl = useCallback((bot: BotDto) => {
    const version = avatarVersions[bot.id] || 0;
    const baseUrl = bot.bot_username 
      ? `https://t.me/i/userpic/320/${bot.bot_username}.jpg` 
      : `/api/bots/${bot.id}/avatar`;
    
    return version > 0 ? `${baseUrl}?v=${version}` : baseUrl;
  }, [avatarVersions]);

  const updateBotAvatar = useCallback((botId: string) => {
    setAvatarVersions(prev => ({
      ...prev,
      [botId]: Date.now()
    }));
  }, []);

  const value = { 
    bots, 
    loading, 
    isGlobalLoading, 
    setGlobalLoading, 
    error, 
    refreshBots, 
    getBotById,
    getBotAvatarUrl,
    updateBotAvatar
  };

  return React.createElement(
    BotContext.Provider,
    { value: value },
    children
  );
};

export const useBots = () => {
  const context = useContext(BotContext);
  if (context === undefined) {
    throw new Error('useBots must be used within a BotProvider');
  }
  return context;
};
