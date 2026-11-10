import type { SupportedLocale } from '@/lib/assistant';
import { getAccessToken } from '@/lib/auth';

export type UserProfile = {
  displayName: string;
  preferredLanguage: SupportedLocale;
};

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '') ?? 'http://localhost:3000/api';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getErrorMessage(payload: unknown): string {
  return isRecord(payload) && typeof payload.error === 'string'
    ? payload.error
    : 'Your profile could not be saved.';
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  const token = await getAccessToken();
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/profile`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(profile),
    });
  } catch {
    throw new Error('The server is unavailable. Your profile was not saved.');
  }

  if (!response.ok) {
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      // Use the default message below.
    }
    throw new Error(getErrorMessage(payload));
  }
}
