import { getAccessToken } from '@/lib/auth';

export type SupportedLocale = 'en' | 'afr' | 'es' | 'fr';
export type IntentCategory = 'standard_query' | 'eligibility_check' | 'escalation_required';
export type RoutingQueue = 'general_support' | 'eligibility_review' | 'content_curators';
export type CardType = 'success' | 'warning' | 'error';

export type Citation = {
  match_id: string;
  source_id: string;
  title: string;
  url_or_reference: string;
  location: string;
  excerpt: string;
};

export type AssistantResponse = {
  language_detected: SupportedLocale;
  intent_category: IntentCategory;
  conversational_response: string;
  citations: Citation[];
  escalation_payload: {
    requires_human: boolean;
    routing_queue: RoutingQueue;
    system_message: string;
  };
  ui_hints: {
    nativewind_card_type: CardType;
    figma_layout_id: string;
  };
};

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '') ?? 'http://localhost:3000/api';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isCitation(value: unknown): value is Citation {
  return (
    isRecord(value) &&
    isString(value.match_id) &&
    isString(value.source_id) &&
    isString(value.title) &&
    isString(value.url_or_reference) &&
    isString(value.location) &&
    isString(value.excerpt)
  );
}

export function isAssistantResponse(value: unknown): value is AssistantResponse {
  if (
    !isRecord(value) ||
    !isRecord(value.escalation_payload) ||
    !isRecord(value.ui_hints)
  ) {
    return false;
  }

  const validLocale =
    value.language_detected === 'en' ||
    value.language_detected === 'afr' ||
    value.language_detected === 'es' ||
    value.language_detected === 'fr';
  const validIntent =
    value.intent_category === 'standard_query' ||
    value.intent_category === 'eligibility_check' ||
    value.intent_category === 'escalation_required';
  const validQueue =
    value.escalation_payload.routing_queue === 'general_support' ||
    value.escalation_payload.routing_queue === 'eligibility_review' ||
    value.escalation_payload.routing_queue === 'content_curators';
  const validCardType =
    value.ui_hints.nativewind_card_type === 'success' ||
    value.ui_hints.nativewind_card_type === 'warning' ||
    value.ui_hints.nativewind_card_type === 'error';
  return (
    validLocale &&
    validIntent &&
    isString(value.conversational_response) &&
    Array.isArray(value.citations) &&
    value.citations.every(isCitation) &&
    typeof value.escalation_payload.requires_human === 'boolean' &&
    validQueue &&
    isString(value.escalation_payload.system_message) &&
    validCardType &&
    isString(value.ui_hints.figma_layout_id)
  );
}

export async function askAssistant(
  message: string,
  locale: SupportedLocale,
): Promise<AssistantResponse> {
  const token = await getAccessToken();
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/assistant`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, locale }),
    });
  } catch {
    throw new Error('The assistant server is unavailable.');
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('The assistant server returned an invalid response.');
  }

  if (!response.ok) {
    const errorMessage =
      isRecord(payload) && isString(payload.error)
        ? payload.error
        : 'The assistant server rejected the request.';
    throw new Error(errorMessage);
  }

  if (!isAssistantResponse(payload)) {
    throw new Error('The assistant server returned a response in an unexpected format.');
  }

  return payload;
}
