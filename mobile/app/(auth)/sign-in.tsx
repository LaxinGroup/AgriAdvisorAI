import { Link, type Href } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LanguageDropdown } from '@/components/LanguageDropdown';
import { PasswordInput, usePlaceholderColor } from '@/components/PasswordInput';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/lib/i18n';

export default function SignInScreen() {
  const { signIn } = useAuth();
  const { errorMessage, t } = useLanguage();
  const placeholderColor = usePlaceholderColor();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Kept as the caught error so the message follows a language change.
  const [error, setError] = useState<unknown>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSignIn() {
    setError(null);
    setIsSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (signInError) {
      setError(signInError);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-zinc-950">
      <LanguageDropdown />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-center px-6">
        <View className="mx-auto w-full max-w-md">
          <Text className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
            {t('signIn.title')}
          </Text>
          <Text className="mt-2 text-base text-slate-600 dark:text-slate-300">
            {t('signIn.subtitle')}
          </Text>

          <View className="mt-8">
            <Text className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-200">
              {t('signIn.email')}
            </Text>
            <TextInput
              accessibilityLabel={t('signIn.email')}
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              className="min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder={t('signIn.emailPlaceholder')}
              placeholderTextColor={placeholderColor}
              returnKeyType="next"
              textContentType="emailAddress"
              value={email}
            />
          </View>

          <View className="mt-5">
            <Text className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-200">
              {t('signIn.password')}
            </Text>
            <PasswordInput
              accessibilityLabel={t('signIn.password')}
              autoComplete="current-password"
              onChangeText={setPassword}
              onSubmitEditing={() => void handleSignIn()}
              placeholder={t('signIn.passwordPlaceholder')}
              returnKeyType="go"
              textContentType="password"
              value={password}
            />
          </View>

          {error ? (
            <Text accessibilityRole="alert" className="mt-4 text-sm text-red-700 dark:text-red-300">
              {errorMessage(error, 'signIn.failed')}
            </Text>
          ) : null}

          <Pressable
            accessibilityLabel={t('signIn.submit')}
            accessibilityRole="button"
            accessibilityState={{ disabled: isSubmitting }}
            className="mt-7 min-h-12 items-center justify-center rounded-xl bg-brand-600 px-4 active:opacity-75"
            disabled={isSubmitting}
            onPress={() => void handleSignIn()}>
            <Text className="text-base font-semibold text-white">
              {isSubmitting ? t('signIn.submitting') : t('signIn.submit')}
            </Text>
          </Pressable>

          <Link href={'/(auth)/register' as Href} replace asChild>
            <Pressable
              accessibilityRole="link"
              className="mt-5 min-h-11 items-center justify-center active:opacity-75">
              <Text className="text-sm text-slate-600 dark:text-slate-300">
                {t('signIn.noAccount')}{' '}
                <Text className="font-semibold text-brand-600">{t('signIn.createOne')}</Text>
              </Text>
            </Pressable>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
