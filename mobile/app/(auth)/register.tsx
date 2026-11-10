import { Link, type Href } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { SupportedLocale } from '@/lib/assistant';
import { useAuth } from '@/lib/auth';
import { saveProfile } from '@/lib/profile';

const LANGUAGE_OPTIONS: { code: SupportedLocale; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'afr', label: 'Afrikaans' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
];

const INPUT_CLASS =
  'min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white';
const LABEL_CLASS = 'mb-2 text-sm font-medium text-slate-800 dark:text-slate-200';

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function RegisterScreen() {
  const { refreshSession, signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [language, setLanguage] = useState<SupportedLocale>('en');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Set once the Neon Auth account exists, so a retry only re-saves the profile.
  const [accountCreated, setAccountCreated] = useState(false);

  async function handleRegister() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Enter your name.');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      if (!accountCreated) {
        await signUp(trimmedName, email.trim(), password);
        setAccountCreated(true);
      }
      await saveProfile({ displayName: trimmedName, preferredLanguage: language });
      await refreshSession();
    } catch (registerError) {
      setError(toErrorMessage(registerError, 'Registration failed. Check your details and retry.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  const buttonLabel = accountCreated ? 'Retry saving profile' : 'Create account';

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-zinc-950">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1">
        <ScrollView
          contentContainerClassName="flex-grow justify-center px-6 py-8"
          keyboardShouldPersistTaps="handled">
          <View className="mx-auto w-full max-w-md">
            <Text className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
              Create an account
            </Text>
            <Text className="mt-2 text-base text-slate-600 dark:text-slate-300">
              Register to access the AgriAdvisor knowledge library.
            </Text>

            <View className="mt-8">
              <Text className={LABEL_CLASS}>Name</Text>
              <TextInput
                accessibilityLabel="Name"
                autoComplete="name"
                className={INPUT_CLASS}
                editable={!accountCreated}
                onChangeText={setName}
                placeholder="Your name"
                returnKeyType="next"
                textContentType="name"
                value={name}
              />
            </View>

            <View className="mt-5">
              <Text className={LABEL_CLASS}>Email</Text>
              <TextInput
                accessibilityLabel="Email"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                className={INPUT_CLASS}
                editable={!accountCreated}
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="name@organization.org"
                returnKeyType="next"
                textContentType="emailAddress"
                value={email}
              />
            </View>

            <View className="mt-5">
              <Text className={LABEL_CLASS}>Password</Text>
              <TextInput
                accessibilityLabel="Password"
                autoComplete="new-password"
                className={INPUT_CLASS}
                editable={!accountCreated}
                onChangeText={setPassword}
                placeholder="Password"
                returnKeyType="done"
                secureTextEntry
                textContentType="newPassword"
                value={password}
              />
            </View>

            <View className="mt-5">
              <Text className={LABEL_CLASS}>Preferred language</Text>
              <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
                {LANGUAGE_OPTIONS.map((option) => {
                  const selected = option.code === language;
                  return (
                    <Pressable
                      accessibilityLabel={option.label}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      className={`min-h-11 justify-center rounded-full border px-4 active:opacity-75 ${
                        selected
                          ? 'border-brand-600 bg-brand-600'
                          : 'border-slate-300 bg-white dark:border-zinc-700 dark:bg-zinc-900'
                      }`}
                      key={option.code}
                      onPress={() => setLanguage(option.code)}>
                      <Text
                        className={`text-sm font-medium ${
                          selected ? 'text-white' : 'text-slate-800 dark:text-slate-200'
                        }`}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {error ? (
              <Text accessibilityRole="alert" className="mt-4 text-sm text-red-700 dark:text-red-300">
                {accountCreated ? `Your account was created, but: ${error}` : error}
              </Text>
            ) : null}

            <Pressable
              accessibilityLabel={buttonLabel}
              accessibilityRole="button"
              accessibilityState={{ disabled: isSubmitting }}
              className="mt-7 min-h-12 items-center justify-center rounded-xl bg-brand-600 px-4 active:opacity-75"
              disabled={isSubmitting}
              onPress={() => void handleRegister()}>
              <Text className="text-base font-semibold text-white">
                {isSubmitting ? 'Creating account...' : buttonLabel}
              </Text>
            </Pressable>

            {!accountCreated ? (
              <Link href={'/(auth)/sign-in' as Href} replace asChild>
                <Pressable
                  accessibilityRole="link"
                  className="mt-5 min-h-11 items-center justify-center active:opacity-75">
                  <Text className="text-sm text-slate-600 dark:text-slate-300">
                    Already have an account?{' '}
                    <Text className="font-semibold text-brand-600">Sign in</Text>
                  </Text>
                </Pressable>
              </Link>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
