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

import { PasswordInput, usePlaceholderColor } from '@/components/PasswordInput';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/lib/i18n';
import { saveProfile } from '@/lib/profile';
import { LANGUAGES, TranslatableError } from '@/lib/translations';

const INPUT_CLASS =
  'min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white';
const LABEL_CLASS = 'mb-2 text-sm font-medium text-slate-800 dark:text-slate-200';

export default function RegisterScreen() {
  const { refreshSession, signUp } = useAuth();
  // The preferred-language buttons are linked to the app language: tapping one switches the app.
  const { errorMessage, language, setLanguage, t } = useLanguage();
  const placeholderColor = usePlaceholderColor();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Kept as the caught error so the message follows a language change.
  const [error, setError] = useState<unknown>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Set once the Neon Auth account exists, so a retry only re-saves the profile.
  const [accountCreated, setAccountCreated] = useState(false);

  async function handleRegister() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(new TranslatableError('register.nameRequired'));
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
      setError(registerError);
    } finally {
      setIsSubmitting(false);
    }
  }

  const buttonLabel = accountCreated ? t('register.retryProfile') : t('register.submit');
  const errorText = error ? errorMessage(error, 'register.failed') : null;

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
              {t('register.title')}
            </Text>
            <Text className="mt-2 text-base text-slate-600 dark:text-slate-300">
              {t('register.subtitle')}
            </Text>

            <View className="mt-8">
              <Text className={LABEL_CLASS}>{t('register.name')}</Text>
              <TextInput
                accessibilityLabel={t('register.name')}
                autoComplete="name"
                className={INPUT_CLASS}
                editable={!accountCreated}
                onChangeText={setName}
                placeholder={t('register.namePlaceholder')}
                placeholderTextColor={placeholderColor}
                returnKeyType="next"
                textContentType="name"
                value={name}
              />
            </View>

            <View className="mt-5">
              <Text className={LABEL_CLASS}>{t('register.email')}</Text>
              <TextInput
                accessibilityLabel={t('register.email')}
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                className={INPUT_CLASS}
                editable={!accountCreated}
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder={t('register.emailPlaceholder')}
                placeholderTextColor={placeholderColor}
                returnKeyType="next"
                textContentType="emailAddress"
                value={email}
              />
            </View>

            <View className="mt-5">
              <Text className={LABEL_CLASS}>{t('register.password')}</Text>
              <PasswordInput
                accessibilityLabel={t('register.password')}
                autoComplete="new-password"
                editable={!accountCreated}
                onChangeText={setPassword}
                placeholder={t('register.passwordPlaceholder')}
                returnKeyType="done"
                textContentType="newPassword"
                value={password}
              />
            </View>

            <View className="mt-5">
              <Text className={LABEL_CLASS}>{t('register.language')}</Text>
              <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
                {LANGUAGES.map((option) => {
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

            {errorText ? (
              <Text accessibilityRole="alert" className="mt-4 text-sm text-red-700 dark:text-red-300">
                {accountCreated ? t('register.accountCreatedBut', { error: errorText }) : errorText}
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
                {isSubmitting ? t('register.submitting') : buttonLabel}
              </Text>
            </Pressable>

            {!accountCreated ? (
              <Link href={'/(auth)/sign-in' as Href} replace asChild>
                <Pressable
                  accessibilityRole="link"
                  className="mt-5 min-h-11 items-center justify-center active:opacity-75">
                  <Text className="text-sm text-slate-600 dark:text-slate-300">
                    {t('register.haveAccount')}{' '}
                    <Text className="font-semibold text-brand-600">{t('register.signIn')}</Text>
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
