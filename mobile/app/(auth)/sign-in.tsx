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

import { useAuth } from '@/lib/auth';

export default function SignInScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSignIn() {
    setError(null);
    setIsSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (signInError) {
      setError(
        signInError instanceof Error
          ? signInError.message
          : 'Sign-in failed. Check your details and retry.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-zinc-950">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-center px-6">
        <View className="mx-auto w-full max-w-md">
          <Text className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
            AgriAdvisor
          </Text>
          <Text className="mt-2 text-base text-slate-600 dark:text-slate-300">
            Sign in with your staff account to access the knowledge library.
          </Text>

          <View className="mt-8">
            <Text className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-200">
              Email
            </Text>
            <TextInput
              accessibilityLabel="Email"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              className="min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="name@organization.org"
              returnKeyType="next"
              textContentType="emailAddress"
              value={email}
            />
          </View>

          <View className="mt-5">
            <Text className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-200">
              Password
            </Text>
            <TextInput
              accessibilityLabel="Password"
              autoComplete="current-password"
              className="min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
              onChangeText={setPassword}
              onSubmitEditing={() => void handleSignIn()}
              placeholder="Password"
              returnKeyType="go"
              secureTextEntry
              textContentType="password"
              value={password}
            />
          </View>

          {error ? (
            <Text accessibilityRole="alert" className="mt-4 text-sm text-red-700 dark:text-red-300">
              {error}
            </Text>
          ) : null}

          <Pressable
            accessibilityLabel="Sign in"
            accessibilityRole="button"
            accessibilityState={{ disabled: isSubmitting }}
            className="mt-7 min-h-12 items-center justify-center rounded-xl bg-brand-600 px-4 active:opacity-75"
            disabled={isSubmitting}
            onPress={() => void handleSignIn()}>
            <Text className="text-base font-semibold text-white">
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
