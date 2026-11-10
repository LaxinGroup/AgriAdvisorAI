import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';
import '../global.css';

import { AuthProvider, useAuth } from '@/lib/auth';
import { useColorScheme } from '@/components/useColorScheme';
import { Redirect, useSegments, type Href } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  anchor: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  if (!loaded) {
    return null;
  }

  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { error, refreshSession, state, user } = useAuth();
  const segments = useSegments();

  useEffect(() => {
    if (state !== 'loading') {
      void SplashScreen.hideAsync();
    }
  }, [state]);

  if (state === 'loading') return null;

  if (state === 'error') {
    return (
      <SafeAreaView className="flex-1 justify-center bg-slate-50 px-6 dark:bg-zinc-950">
        <View className="mx-auto w-full max-w-md">
          <Text className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Sign-in is unavailable
          </Text>
          <Text accessibilityRole="alert" className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
            {error}
          </Text>
          <Pressable
            accessibilityLabel="Retry sign-in"
            accessibilityRole="button"
            className="mt-5 min-h-11 items-center justify-center rounded-xl bg-brand-600 px-4 active:opacity-75"
            onPress={() => void refreshSession()}>
            <Text className="text-sm font-semibold text-white">Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const isAuthRoute = String(segments[0]) === '(auth)';
  if (!user && !isAuthRoute) {
    return <Redirect href={'/(auth)/sign-in' as Href} />;
  }
  if (user && isAuthRoute) return <Redirect href="/(tabs)" />;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}
