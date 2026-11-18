import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import { jwtClient } from 'better-auth/client/plugins';
import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform } from 'react-native';

import { TranslatableError } from '@/lib/translations';

type AuthUser = {
  id: string;
  email: string;
};

type AuthState = 'loading' | 'signed-in' | 'signed-out' | 'error';

type AuthContextValue = {
  // The caught error, so screens can show it in the chosen language.
  error: unknown;
  refreshSession: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  state: AuthState;
  user: AuthUser | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// Native apps send no Origin header, and Neon Auth rejects sign-up and sign-in
// without one. This origin must be listed in Neon Auth's trusted domains.
const NATIVE_AUTH_ORIGIN = 'https://agriadvisorai-33wk.onrender.com';

function createNeonAuthClient() {
  const baseURL = process.env.EXPO_PUBLIC_NEON_AUTH_URL?.trim();
  if (!baseURL) {
    throw new TranslatableError('error.authNotConfigured');
  }

  return createAuthClient({
    baseURL,
    fetchOptions: {
      credentials: 'include',
      ...(Platform.OS === 'web' ? {} : { headers: { Origin: NATIVE_AUTH_ORIGIN } }),
    },
    plugins:
      Platform.OS === 'web'
        ? [jwtClient()]
        : [jwtClient(), expoClient({ storage: SecureStore, scheme: 'mobile', cookiePrefix: 'neon-auth' })],
  });
}

let neonAuthClient: ReturnType<typeof createNeonAuthClient> | undefined;

function getNeonAuthClient() {
  neonAuthClient ??= createNeonAuthClient();
  return neonAuthClient;
}

// Returns a signed JWT for the API. The session token from getSession() is an
// opaque ID that the server cannot verify, so the JWT is requested from /token.
export async function getAccessToken(): Promise<string> {
  const result = await getNeonAuthClient().$fetch<{ token: string }>('/token', {
    method: 'GET',
  });
  if (result.error) {
    throw result.error.message
      ? new Error(result.error.message)
      : new TranslatableError('error.sessionExpired');
  }
  const token = result.data?.token;
  if (!token) {
    throw new TranslatableError('error.sessionExpired');
  }
  return token;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>('loading');
  const [error, setError] = useState<unknown>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  const refreshSession = useCallback(async () => {
    setError(null);
    try {
      const result = await getNeonAuthClient().getSession();
      if (result.error) throw new Error(result.error.message);

      const currentUser = result.data?.user;
      if (currentUser?.id && currentUser.email) {
        setUser({ id: currentUser.id, email: currentUser.email });
        setState('signed-in');
      } else {
        setUser(null);
        setState('signed-out');
      }
    } catch (sessionError) {
      setUser(null);
      setState('error');
      setError(
        sessionError instanceof Error
          ? sessionError
          : new TranslatableError('error.authUnreachable'),
      );
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await getNeonAuthClient().signIn.email({ email, password });
    if (result.error) {
      throw new Error(result.error.message);
    }
    await refreshSession();
  }, [refreshSession]);

  // Creates the Neon Auth account and its session. The caller refreshes the
  // session afterwards so it can save the profile before the screen changes.
  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const result = await getNeonAuthClient().signUp.email({ name, email, password });
    if (result.error) {
      throw result.error.message
        ? new Error(result.error.message)
        : new TranslatableError('register.failed');
    }
  }, []);

  const signOut = useCallback(async () => {
    const result = await getNeonAuthClient().signOut();
    if (result.error) {
      throw new Error(result.error.message);
    }
    setUser(null);
    setError(null);
    setState('signed-out');
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const value = useMemo(
    () => ({ error, refreshSession, signIn, signOut, signUp, state, user }),
    [error, refreshSession, signIn, signOut, signUp, state, user],
  );
  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }
  return value;
}
