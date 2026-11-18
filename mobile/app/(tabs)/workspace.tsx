import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/lib/i18n';

export default function WorkspaceScreen() {
  const { signOut, user } = useAuth();
  const { errorMessage, t } = useLanguage();
  // Kept as the caught error so the message follows a language change.
  const [error, setError] = useState<unknown>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setError(null);
    setIsSigningOut(true);
    try {
      await signOut();
    } catch (signOutError) {
      setError(signOutError);
      setIsSigningOut(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-zinc-950" edges={['top', 'left', 'right']}>
      <View className="w-full max-w-3xl flex-1 self-center px-5 pt-4">
        <Text className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          {t('workspace.title')}
        </Text>
        <View className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <Text className="text-sm leading-6 text-slate-600 dark:text-slate-300">
            {t('workspace.placeholder')}
          </Text>
        </View>

        <View className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <Text className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t('workspace.account')}
          </Text>
          <Text className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
            {t('workspace.signedInAs', { email: user?.email ?? t('workspace.unknownUser') })}
          </Text>

          {error ? (
            <Text accessibilityRole="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">
              {errorMessage(error, 'workspace.signOutFailed')}
            </Text>
          ) : null}

          <Pressable
            accessibilityLabel={t('workspace.signOut')}
            accessibilityRole="button"
            accessibilityState={{ disabled: isSigningOut }}
            className="mt-4 min-h-11 items-center justify-center rounded-xl border border-slate-300 px-4 active:opacity-75 dark:border-zinc-700"
            disabled={isSigningOut}
            onPress={() => void handleSignOut()}>
            <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {isSigningOut ? t('workspace.signingOut') : t('workspace.signOut')}
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
