import { useEffect, useRef } from 'react';
import { useBots } from '../../domains/bot/store';

interface MainButtonOptions {
  text?: string;
  onClick?: () => void;
  isVisible?: boolean;
  isEnabled?: boolean;
}

export function useMainButton({ text, onClick, isVisible = true, isEnabled = true }: MainButtonOptions) {
  const { isGlobalLoading } = useBots();
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  const actualEnabled = isEnabled && !isGlobalLoading;

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg) return;

    const mainButton = tg.MainButton;

    if (text) mainButton.setText(text);
    
    if (isVisible) {
      mainButton.show();
    } else {
      mainButton.hide();
    }

    if (actualEnabled) {
      mainButton.enable();
    } else {
      mainButton.disable();
    }

    const handleClick = () => {
      onClickRef.current?.();
    };

    mainButton.onClick(handleClick);

    return () => {
      mainButton.offClick(handleClick);
      mainButton.hide();
    };
  }, [text, isVisible, actualEnabled]);
}

