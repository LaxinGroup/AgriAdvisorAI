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

import type { SupportedLocale } from '@/lib/assistant';
import {
  LANGUAGES,
  translate,
  TranslatableError,
  type TranslationKey,
} from '@/lib/translations';

const STORAGE_KEY = 'app_language';
const DEFAULT_LANGUAGE: SupportedLocale = 'en';

type TranslateParams = Record<string, string | number>;

type LanguageContextValue = {
  language: SupportedLocale;
  setLanguage: (language: SupportedLocale) => void;
  t: (key: TranslationKey, params?: TranslateParams) => string;
  // Message for a caught error: app errors are translated, server messages are shown as sent.
  errorMessage: (error: unknown, fallbackKey: TranslationKey) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function isSupportedLanguage(value: unknown): value is SupportedLocale {
  return LANGUAGES.some((option) => option.code === value);
}

// SecureStore has no web implementation, so web uses browser storage.
async function readStoredLanguage(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
    return await SecureStore.getItemAsync(STORAGE_KEY);
  } catch {
    return null;
  }
}

async function writeStoredLanguage(language: SupportedLocale): Promise<void> {
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(STORAGE_KEY, language);
    else await SecureStore.setItemAsync(STORAGE_KEY, language);
  } catch {
    // The choice still applies for this session if it cannot be saved.
  }
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLocale>(DEFAULT_LANGUAGE);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    void readStoredLanguage().then((stored) => {
      if (isSupportedLanguage(stored)) setLanguageState(stored);
      setIsLoaded(true);
    });
  }, []);

  const setLanguage = useCallback((next: SupportedLocale) => {
    setLanguageState(next);
    void writeStoredLanguage(next);
  }, []);

  const value = useMemo<LanguageContextValue>(() => {
    const t = (key: TranslationKey, params?: TranslateParams) => translate(language, key, params);
    return {
      language,
      setLanguage,
      t,
      errorMessage: (error, fallbackKey) => {
        if (error instanceof TranslatableError) return t(error.key, error.params);
        if (error instanceof Error && error.message) return error.message;
        return t(fallbackKey);
      },
    };
  }, [language, setLanguage]);

  // Keep the splash screen up until the saved language is known.
  if (!isLoaded) return null;
  return createElement(LanguageContext.Provider, { value }, children);
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) {
    throw new Error('useLanguage must be used inside LanguageProvider.');
  }
  return value;
}
