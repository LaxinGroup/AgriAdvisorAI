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

type AuthUser = {
  id: string;
  email: string;
};

type AuthState = 'loading' | 'signed-in' | 'signed-out' | 'error';

type AuthContextValue = {
  error: string | null;
  refreshSession: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  state: AuthState;
  user: AuthUser | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function createNeonAuthClient() {
  const baseURL = process.env.EXPO_PUBLIC_NEON_AUTH_URL?.trim();
  if (!baseURL) {
    throw new Error('Set EXPO_PUBLIC_NEON_AUTH_URL before signing in.');
  }

  return createAuthClient({
    baseURL,
    fetchOptions: { credentials: 'include' },
    plugins:
      Platform.OS === 'web'
        ? [jwtClient()]
        : [jwtClient(), expoClient({ storage: SecureStore, scheme: 'mobile' })],
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
    throw new Error(result.error.message ?? 'Your sign-in session has expired. Sign in again.');
  }
  const token = result.data?.token;
  if (!token) {
    throw new Error('Your sign-in session has expired. Sign in again.');
  }
  return token;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>('loading');
  const [error, setError] = useState<string | null>(null);
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
          ? sessionError.message
          : 'The sign-in service could not be reached.',
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
      throw new Error(result.error.message ?? 'Registration failed. Check your details and retry.');
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
