import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useBots } from '../../domains/bot/store';

export function useBackButton(customHandler?: () => void) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isGlobalLoading } = useBots();

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg) return;

    const backButton = tg.BackButton;

    // Show back button if we're not at the root
    if (location.pathname === '/' || location.pathname === '/landing') {
      backButton.hide();
    } else {
      backButton.show();
    }

    const handleBack = () => {
      if (isGlobalLoading) return;
      if (customHandler) {
        customHandler();
      } else {
        // Logic for back navigation
        // If we are deep in the app, we might want custom logic, 
        // but for now, simple navigate(-1) works for basic routing.
        navigate(-1);
      }
    };

    backButton.onClick(handleBack);

    return () => {
      backButton.offClick(handleBack);
    };
  }, [location.pathname, navigate, customHandler, isGlobalLoading]);
}

