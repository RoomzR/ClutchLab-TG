import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  getMe,
  isPending2FA,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  verify2FA as apiVerify2FA,
  type AuthTokens,
  type AuthUser,
} from '../api/auth';
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from '../api/tokenStorage';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Resolves to a pending token string when the account requires a 2FA code. */
  login: (email: string, password: string) => Promise<{ pending2fa?: string }>;
  verify2FA: (pendingToken: string, code: string) => Promise<void>;
  register: (params: {
    email: string;
    username: string;
    password: string;
    referral_code?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getAccessToken() && !getRefreshToken()) {
        setIsLoading(false);
        return;
      }
      try {
        const me = await getMe();
        if (!cancelled) setUser(me);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyTokens = useCallback((tokens: AuthTokens) => {
    setTokens(tokens.access_token, tokens.refresh_token);
    setUser(tokens.user);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await apiLogin(email, password);
      if (isPending2FA(result)) {
        return { pending2fa: result.pending_token };
      }
      applyTokens(result);
      return {};
    },
    [applyTokens],
  );

  const verify2FA = useCallback(
    async (pendingToken: string, code: string) => {
      const tokens = await apiVerify2FA(pendingToken, code);
      applyTokens(tokens);
    },
    [applyTokens],
  );

  const register = useCallback(
    async (params: {
      email: string;
      username: string;
      password: string;
      referral_code?: string;
    }) => {
      const tokens = await apiRegister(params);
      applyTokens(tokens);
    },
    [applyTokens],
  );

  const logout = useCallback(async () => {
    const refresh = getRefreshToken();
    if (refresh) {
      try {
        await apiLogout(refresh);
      } catch {
        // Token may already be revoked — clearing locally is enough.
      }
    }
    clearTokens();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const me = await getMe();
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      login,
      verify2FA,
      register,
      logout,
      refreshUser,
    }),
    [user, isLoading, login, verify2FA, register, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
