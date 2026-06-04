declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        ready: () => void;
        expand: () => void;
        openLink: (url: string) => void;
        BackButton: {
          isVisible: boolean;
          show: () => void;
          hide: () => void;
          onClick: (cb: () => void) => void;
          offClick: (cb: () => void) => void;
        };
        MainButton: {
          text: string;
          color: string;
          textColor: string;
          isVisible: boolean;
          isActive: boolean;
          isProgressVisible: boolean;
          show: () => void;
          hide: () => void;
          enable: () => void;
          disable: () => void;
          showProgress: (leaveActive: boolean) => void;
          hideProgress: () => void;
          onClick: (cb: () => void) => void;
          offClick: (cb: () => void) => void;
          setText: (text: string) => void;
          setParams: (params: { text?: string; color?: string; text_color?: string; is_active?: boolean; is_visible?: boolean }) => void;
        };
      };
    };
  }
}

export {};




