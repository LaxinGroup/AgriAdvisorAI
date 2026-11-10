import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth';

export default function WorkspaceScreen() {
  const { signOut, user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setError(null);
    setIsSigningOut(true);
    try {
      await signOut();
    } catch (signOutError) {
      setError(
        signOutError instanceof Error ? signOutError.message : 'Sign-out failed. Try again.',
      );
      setIsSigningOut(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-zinc-950" edges={['top', 'left', 'right']}>
      <View className="w-full max-w-3xl flex-1 self-center px-5 pt-4">
        <Text className="text-xl font-semibold text-slate-900 dark:text-slate-100">Workspace</Text>
        <View className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <Text className="text-sm leading-6 text-slate-600 dark:text-slate-300">
            Workspace tools will appear here when available.
          </Text>
        </View>

        <View className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <Text className="text-base font-semibold text-slate-900 dark:text-slate-100">Account</Text>
          <Text className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
            Signed in as {user?.email ?? 'unknown user'}
          </Text>

          {error ? (
            <Text accessibilityRole="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">
              {error}
            </Text>
          ) : null}

          <Pressable
            accessibilityLabel="Sign out"
            accessibilityRole="button"
            accessibilityState={{ disabled: isSigningOut }}
            className="mt-4 min-h-11 items-center justify-center rounded-xl border border-slate-300 px-4 active:opacity-75 dark:border-zinc-700"
            disabled={isSigningOut}
            onPress={() => void handleSignOut()}>
            <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {isSigningOut ? 'Signing out...' : 'Sign out'}
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
