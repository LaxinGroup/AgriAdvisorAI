import Constants from 'expo-constants';

const LOCAL_API_PORT = 3000;

function withoutTrailingSlash(url: string) {
  return url.replace(/\/+$/, '');
}

// The computer running `expo start`, e.g. "192.168.1.20:8081" -> "192.168.1.20".
// Expo only provides this during development.
function getDevMachineHost(): string | null {
  const hostUri = Constants.expoConfig?.hostUri;
  if (!hostUri) return null;
  const host = hostUri.split('/')[0].replace(/:\d+$/, '');
  return host || null;
}

// Release builds (APK) always use EXPO_PUBLIC_API_URL (Render).
// In development, EXPO_PUBLIC_API_TARGET=render uses Render too; anything else uses the
// local server: EXPO_PUBLIC_LOCAL_API_URL if set, otherwise the dev machine on port 3000.
function resolveApiBaseUrl(): string {
  const useRender = process.env.EXPO_PUBLIC_API_TARGET?.trim().toLowerCase() === 'render';

  if (__DEV__ && !useRender) {
    const localUrl = process.env.EXPO_PUBLIC_LOCAL_API_URL?.trim();
    if (localUrl) return withoutTrailingSlash(localUrl);
    return `http://${getDevMachineHost() ?? 'localhost'}:${LOCAL_API_PORT}/api`;
  }

  const remoteUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  return withoutTrailingSlash(remoteUrl || `http://localhost:${LOCAL_API_PORT}/api`);
}

export const API_BASE_URL = resolveApiBaseUrl();
