import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { userClient, isAccountBlockedError, UserApiError } from '../services/user';

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

export interface TelegramWebApp {
  /** Raw signed init string for server-side validation (Telegram Mini App). */
  initData?: string;
  initDataUnsafe: { user?: TelegramUser; start_param?: string };
  /** e.g. ios, android, macos, tdesktop, weba — Stars invoice checkout is unreliable on desktop/web clients. */
  platform?: string;
  colorScheme: 'light' | 'dark';
  isExpanded: boolean;
  viewportHeight: number;
  ready: () => void;
  expand: () => void;
  close: () => void;
  HapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged: () => void;
  };
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    show: () => void;
    hide: () => void;
    enable: () => void;
    disable: () => void;
    showProgress: (leaveActive?: boolean) => void;
    hideProgress: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
    setParams: (p: {
      text?: string; color?: string; text_color?: string;
      is_active?: boolean; is_visible?: boolean;
    }) => void;
  };
  BackButton: {
    isVisible: boolean;
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  showAlert: (message: string, callback?: () => void) => void;
  showConfirm: (message: string, callback: (confirmed: boolean) => void) => void;
  showPopup: (params: {
    title?: string;
    message: string;
    buttons?: Array<{ id?: string; type: 'default' | 'ok' | 'close' | 'cancel' | 'destructive'; text?: string }>;
  }, callback?: (buttonId: string) => void) => void;

  openInvoice?: (
    url: string,
    callback?: (status: 'paid' | 'cancelled' | 'failed' | 'pending' | string) => void
  ) => void;
  /** Bot API version available in the Telegram client (e.g. "7.8"). */
  version?: string;
  isVersionAtLeast?: (version: string) => boolean;
  /** Open https / t.me links from the Mini App (Telegram 6.4+). */
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
}

export type AccountAccessState = 'loading' | 'allowed' | 'blocked' | 'waitlist_locked'

interface TelegramContextValue {
  user: TelegramUser | null;
  webApp: TelegramWebApp | null;
  isInTelegram: boolean;
  /** Signed init data from Telegram.WebApp.initData — empty outside Telegram or before load. */
  initData: string;
  accessState: AccountAccessState;
  blockMessage: string | null;
  blockStatus: 'Banned' | 'Suspended' | null;
  /** Re-check ban status (e.g. before entering app). Returns false if blocked. */
  verifyAccountAccess: () => Promise<boolean>;
  /** Called when any API reports USER_BANNED / USER_SUSPENDED */
  reportAccessBlock: (err: unknown) => void;
  /** Attempt to unlock waitlist gate with an activation code. Returns ok or error key. */
  activateWithCode: (code: string) => Promise<{ ok: boolean; error?: 'invalid_code' | 'network_error' | 'blocked' }>;
  /** Set when activation code was rejected */
  activationCodeError: string | null;
}

const TelegramContext = createContext<TelegramContextValue>({
  user: null,
  webApp: null,
  isInTelegram: false,
  initData: '',
  accessState: 'loading',
  blockMessage: null,
  blockStatus: null,
  verifyAccountAccess: async () => true,
  reportAccessBlock: () => {},
  activateWithCode: async () => ({ ok: false, error: 'network_error' }),
  activationCodeError: null,
});

async function syncUserSession(user: TelegramUser, startParam?: string): Promise<void> {
  await userClient.syncSession({
      telegramId: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      username: user.username,
      photoUrl: user.photo_url,
      languageCode: user.language_code,
      referralCode: startParam,
  });
}

export function TelegramProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null);
  const [isInTelegram, setIsInTelegram] = useState(false);
  const [initData, setInitData] = useState('');
  const [accessState, setAccessState] = useState<AccountAccessState>('loading');
  const [blockMessage, setBlockMessage] = useState<string | null>(null);
  const [blockStatus, setBlockStatus] = useState<'Banned' | 'Suspended' | null>(null);
  const [activationCodeError, setActivationCodeError] = useState<string | null>(null);

  const applyBlockFromError = useCallback((err: unknown) => {
    if (isAccountBlockedError(err)) {
      setAccessState('blocked');
      setBlockMessage(err.message);
      setBlockStatus(err.userStatus === 'Suspended' ? 'Suspended' : 'Banned');
      return true;
    }
    return false;
  }, []);

  const reportAccessBlock = useCallback(
    (err: unknown) => {
      applyBlockFromError(err);
    },
    [applyBlockFromError],
  );

  const verifyAccountAccess = useCallback(async (): Promise<boolean> => {
    if (!user?.id) {
      setAccessState('allowed');
      return true;
    }
    try {
      await syncUserSession(user, webApp?.initDataUnsafe?.start_param);
      setAccessState('allowed');
      setBlockMessage(null);
      setBlockStatus(null);
      return true;
    } catch (err) {
      if (err instanceof UserApiError && err.code === 'WAITLIST_MODE') {
        setAccessState('waitlist_locked');
        return false;
      }
      if (applyBlockFromError(err)) return false;
      setAccessState('allowed');
      return true;
    }
  }, [user, webApp?.initDataUnsafe?.start_param, applyBlockFromError]);

  const activateWithCode = useCallback(async (code: string): Promise<{ ok: boolean; error?: 'invalid_code' | 'network_error' | 'blocked' }> => {
    if (!user?.id) return { ok: false, error: 'network_error' };
    setActivationCodeError(null);
    try {
      await userClient.syncSession({
        telegramId: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        username: user.username,
        photoUrl: user.photo_url,
        languageCode: user.language_code,
        referralCode: webApp?.initDataUnsafe?.start_param,
        activationCode: code.trim().toUpperCase(),
      });
      setAccessState('allowed');
      setBlockMessage(null);
      setBlockStatus(null);
      return { ok: true };
    } catch (err) {
      if (err instanceof UserApiError && err.code === 'INVALID_CODE') {
        setActivationCodeError('Invalid or already used code. Please check and try again.');
        return { ok: false, error: 'invalid_code' };
      }
      if (applyBlockFromError(err)) return { ok: false, error: 'blocked' };
      setActivationCodeError('Connection failed. Check your internet and try again.');
      return { ok: false, error: 'network_error' };
    }
  }, [user, webApp?.initDataUnsafe?.start_param, applyBlockFromError]);

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp as TelegramWebApp | undefined;
    if (!tg) {
      setAccessState('allowed');
      return;
    }

    const pullInit = () => {
      const raw = typeof tg.initData === 'string' ? tg.initData : '';
      setInitData(raw);
      if (tg.initDataUnsafe?.user) {
        setUser(tg.initDataUnsafe.user);
      }
    };

    tg.ready();
    tg.expand();
    
    // Force light theme colors in Telegram UI
    try {
      tg.setHeaderColor('#ffffff');
      tg.setBackgroundColor('#ffffff');
    } catch (e) {
      console.warn('Failed to set Telegram theme colors', e);
    }

    setWebApp(tg);
    setIsInTelegram(true);
    pullInit();

    const t0 = window.setTimeout(pullInit, 0);
    const t1 = window.setTimeout(pullInit, 100);
    const t2 = window.setTimeout(pullInit, 400);

    if (tg.initDataUnsafe?.user) {
      const tgUser = tg.initDataUnsafe.user;
      setAccessState('loading');

      // Wait until initData is populated before syncing — it may be empty on the very first tick.
      const attemptSync = (attemptsLeft: number) => {
        const currentInitData = typeof tg.initData === 'string' ? tg.initData : '';
        if (!currentInitData && attemptsLeft > 0) {
          window.setTimeout(() => attemptSync(attemptsLeft - 1), 150);
          return;
        }
        syncUserSession(tgUser, tg.initDataUnsafe?.start_param)
          .then(() => {
            setAccessState('allowed');
            setBlockMessage(null);
            setBlockStatus(null);
          })
          .catch((err) => {
            if (err instanceof UserApiError && err.code === 'WAITLIST_MODE') {
              setAccessState('waitlist_locked');
              return;
            }
            if (!applyBlockFromError(err)) {
              console.warn('user-session-sync-failed', err);
              setAccessState('allowed');
            }
          });
      };
      attemptSync(4);
    } else {
      setAccessState('allowed');
    }

    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [applyBlockFromError]);

  return (
    <TelegramContext.Provider
      value={{
        user,
        webApp,
        isInTelegram,
        initData,
        accessState,
        blockMessage,
        blockStatus,
        verifyAccountAccess,
        reportAccessBlock,
        activateWithCode,
        activationCodeError,
      }}
    >
      {children}
    </TelegramContext.Provider>
  );
}

export const useTelegram = () => useContext(TelegramContext);
