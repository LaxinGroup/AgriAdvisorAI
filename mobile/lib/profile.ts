import type { SupportedLocale } from '@/lib/assistant';
import { getAccessToken } from '@/lib/auth';
import { API_BASE_URL } from '@/lib/config';
import { TranslatableError } from '@/lib/translations';

export type UserProfile = {
  displayName: string;
  preferredLanguage: SupportedLocale;
};


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getError(payload: unknown): Error {
  return isRecord(payload) && typeof payload.error === 'string'
    ? new Error(payload.error)
    : new TranslatableError('error.profileSaveFailed');
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
    throw new TranslatableError('error.profileServerUnavailable');
  }

  if (!response.ok) {
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      // Use the default message below.
    }
    throw getError(payload);
  }
}
