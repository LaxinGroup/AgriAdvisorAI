const MAX_MESSAGE_LENGTH = 4000;
const MAX_LOCALE_LENGTH = 32;

const ELIGIBILITY_TERMS = {
  en: /\b(?:eligible|eligibility|qualify|qualifies|qualified)\b/i,
  afr: /\b(?:geskik|geskiktheid|kwalifiseer|kwalifikasie)\b/i,
  es: /\b(?:elegible|elegibilidad|calificar|califica|calificado)\b/i,
  fr: /(?:éligible|éligibilité|admissible|admissibilité|qualifier)/i,
};

const MESSAGES = {
  en: {
    eligibility:
      'I cannot determine eligibility. An authorized specialist must review this request. No live transfer has occurred.',
    eligibilitySystem:
      'Eligibility review is required. No live handoff is configured; no transfer has occurred.',
    escalation:
      'I cannot answer from the approved sources because no matching passage was found. A specialist should review the question. No live transfer has occurred.',
    escalationSystem:
      'No matching approved source passage was found. Specialist review is required; no live transfer has occurred.',
  },
  afr: {
    eligibility:
      'Ek kan nie besluite oor geskiktheid neem nie. \'n Gemagtigde agent moet hierdie versoek beoordeel. Regstreekse roetering is nie gekoppel nie, dus is geen oordrag gedoen nie.',
    eligibilitySystem:
      'Geskiktheidshersiening is nodig. Regstreekse oorhandiging is nie opgestel nie; geen oordrag het plaasgevind nie.',
    escalation:
      'Ek kan nie hierdie vraag uit die goedgekeurde bronne beantwoord nie, omdat geen passende gedeelte gevind is nie. \'n Menslike ondersteuningspanlid moet die vraag beoordeel. Regstreekse roetering is nie gekoppel nie, dus is geen oordrag gedoen nie.',
    escalationSystem:
      'Geen passende gedeelte in die goedgekeurde bronne is gevind nie. Spesialishersiening is nodig; geen regstreekse oordrag het plaasgevind nie.',
  },
  es: {
    eligibility:
      'No puedo tomar decisiones sobre elegibilidad. Un agente autorizado debe revisar esta solicitud. La derivación en directo no está conectada, por lo que no se ha transferido la solicitud.',
    eligibilitySystem:
      'Se requiere una revisión de elegibilidad. La derivación en directo no está conectada, por lo que no se ha transferido la solicitud.',
    escalation:
      'No puedo responder con las fuentes aprobadas porque no se encontró ningún pasaje coincidente. Un especialista debe revisar la pregunta. No se ha realizado ninguna transferencia en directo.',
    escalationSystem:
      'No se encontró ningún pasaje coincidente en las fuentes aprobadas. Se requiere una revisión especializada; no se ha realizado ninguna transferencia en directo.',
  },
  fr: {
    eligibility:
      'Je ne peux pas prendre de décision concernant l’éligibilité. Un agent habilité doit examiner cette demande. Le transfert en direct n’est pas connecté, la demande n’a donc pas été transmise.',
    eligibilitySystem:
      'Un examen de l’éligibilité est requis. Le transfert en direct n’est pas configuré ; la demande n’a pas été transmise.',
    escalation:
      'Je ne peux pas répondre à partir des sources approuvées, car aucun passage correspondant n’a été trouvé. Un spécialiste doit examiner la question. Aucun transfert en direct n’a eu lieu.',
    escalationSystem:
      'Aucun passage correspondant n’a été trouvé dans les sources approuvées. Un examen spécialisé est requis ; aucun transfert en direct n’a eu lieu.',
  },
};

// Used when passages were found but they do not fully answer the question.
const PARTIAL_MESSAGES = {
  en: {
    response:
      'The approved sources I found do not fully answer this question. The related passages are shown below. A specialist should review the question. No live transfer has occurred.',
    system:
      'Related approved passages were found but do not fully answer the question. Specialist review is required; no live transfer has occurred.',
  },
  afr: {
    response:
      'Die goedgekeurde bronne wat ek gevind het, beantwoord nie hierdie vraag ten volle nie. Die verwante gedeeltes word hieronder gewys. \'n Spesialis moet die vraag beoordeel. Geen regstreekse oordrag het plaasgevind nie.',
    system:
      'Verwante goedgekeurde gedeeltes is gevind, maar beantwoord nie die vraag ten volle nie. Spesialishersiening is nodig; geen regstreekse oordrag het plaasgevind nie.',
  },
  es: {
    response:
      'Las fuentes aprobadas que encontré no responden completamente a esta pregunta. Los pasajes relacionados se muestran a continuación. Un especialista debe revisar la pregunta. No se ha realizado ninguna transferencia en directo.',
    system:
      'Se encontraron pasajes aprobados relacionados, pero no responden completamente a la pregunta. Se requiere una revisión especializada; no se ha realizado ninguna transferencia en directo.',
  },
  fr: {
    response:
      'Les sources approuvées que j’ai trouvées ne répondent pas entièrement à cette question. Les passages associés sont affichés ci-dessous. Un spécialiste doit examiner la question. Aucun transfert en direct n’a eu lieu.',
    system:
      'Des passages approuvés associés ont été trouvés, mais ils ne répondent pas entièrement à la question. Un examen spécialisé est requis ; aucun transfert en direct n’a eu lieu.',
  },
};

const SOURCE_EXCERPT_MESSAGES = {
  en: 'I found relevant excerpts in approved sources. Review the cited passages below.',
  afr: 'Ek het relevante uittreksels in goedgekeurde bronne gevind. Lees die aangehaalde gedeeltes hieronder.',
  es: 'Encontré extractos relevantes en fuentes aprobadas. Revisa los pasajes citados a continuación.',
  fr: 'J’ai trouvé des extraits pertinents dans des sources approuvées. Consultez les passages cités ci-dessous.',
};

function normalizeLocale(locale) {
  if (typeof locale !== 'string') return 'en';

  const languageCode = locale.trim().toLowerCase().split(/[-_]/, 1)[0];
  if (languageCode === 'af') return 'afr';
  return Object.hasOwn(MESSAGES, languageCode) ? languageCode : 'en';
}

export function validateAssistantRequest(body) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { valid: false, error: 'Request body must be a JSON object.' };
  }

  if (typeof body.message !== 'string') {
    return { valid: false, error: 'The message field must be a string.' };
  }

  const message = body.message.trim();
  if (!message) {
    return { valid: false, error: 'The message cannot be empty.' };
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return {
      valid: false,
      error: `The message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`,
    };
  }

  if (body.locale !== undefined && typeof body.locale !== 'string') {
    return { valid: false, error: 'The locale field must be a string.' };
  }

  if (typeof body.locale === 'string' && body.locale.length > MAX_LOCALE_LENGTH) {
    return {
      valid: false,
      error: `The locale must be ${MAX_LOCALE_LENGTH} characters or fewer.`,
    };
  }

  return {
    valid: true,
    message,
    locale: normalizeLocale(body.locale),
  };
}

export function createSafeAssistantResponse(message, requestedLocale = 'en') {
  const locale = normalizeLocale(requestedLocale);
  const isEligibilityQuestion = ELIGIBILITY_TERMS[locale].test(message);

  if (isEligibilityQuestion) {
    return {
      language_detected: locale,
      intent_category: 'eligibility_check',
      conversational_response: MESSAGES[locale].eligibility,
      citations: [],
      escalation_payload: {
        requires_human: true,
        routing_queue: 'eligibility_review',
        system_message: MESSAGES[locale].eligibilitySystem,
      },
      ui_hints: {
        nativewind_card_type: 'warning',
        figma_layout_id: 'eligibility-review',
      },
    };
  }

  return {
    language_detected: locale,
    intent_category: 'escalation_required',
    conversational_response: MESSAGES[locale].escalation,
    citations: [],
    escalation_payload: {
      requires_human: true,
      routing_queue: 'content_curators',
      system_message: MESSAGES[locale].escalationSystem,
    },
    ui_hints: {
      nativewind_card_type: 'warning',
      figma_layout_id: 'knowledge-gap-escalation',
    },
  };
}

export function createAssistantResponse(message, requestedLocale = 'en', matches = []) {
  const safeResponse = createSafeAssistantResponse(message, requestedLocale);
  const citations = matches.map((match) => ({
    match_id: match.match_id,
    source_id: match.source_id,
    title: match.title,
    url_or_reference: match.url_or_reference ?? '',
    location: match.location ?? '',
    excerpt: match.excerpt,
  }));

  if (citations.length === 0) return safeResponse;
  if (safeResponse.intent_category === 'eligibility_check') {
    return { ...safeResponse, citations };
  }

  return {
    language_detected: safeResponse.language_detected,
    intent_category: 'standard_query',
    conversational_response: SOURCE_EXCERPT_MESSAGES[safeResponse.language_detected],
    citations,
    escalation_payload: {
      requires_human: false,
      routing_queue: 'general_support',
      system_message: '',
    },
    ui_hints: {
      nativewind_card_type: 'success',
      figma_layout_id: 'approved-source-excerpts',
    },
  };
}

// Adds a written answer from `generateAnswer` (Gemini) on top of the excerpt response.
// Gemini is called only when passages were found. Any failure, an unanswerable result,
// or an answer without a valid citation falls back to a response without generated text.
export async function createAnsweredResponse(
  message,
  requestedLocale = 'en',
  matches = [],
  generateAnswer = null,
) {
  const baseResponse = createAssistantResponse(message, requestedLocale, matches);
  if (!generateAnswer || matches.length === 0) return baseResponse;

  const locale = baseResponse.language_detected;
  const isEligibility = baseResponse.intent_category === 'eligibility_check';

  let result;
  try {
    result = await generateAnswer({ question: message, locale, matches, isEligibility });
  } catch (error) {
    // Do not log the question or passages; they may contain workplace details.
    console.error('Answer generation failed; returning source excerpts.', error?.message);
    return baseResponse;
  }

  // Keep only citations for passages that were actually sent to the model.
  const citationsById = new Map(baseResponse.citations.map((citation) => [citation.match_id, citation]));
  const citedIds = [...new Set(result.citedMatchIds)].filter((id) => citationsById.has(id));
  const citations = citedIds.map((id) => citationsById.get(id));
  const answer = result.answer.trim();
  const hasSupportedAnswer = result.answerable && answer.length > 0 && citations.length > 0;

  if (isEligibility) {
    // Criteria may be described, but the eligibility warning and human review always stay.
    if (!hasSupportedAnswer) return baseResponse;
    return {
      ...baseResponse,
      conversational_response: `${answer}\n\n${MESSAGES[locale].eligibility}`,
      citations,
    };
  }

  if (!hasSupportedAnswer) {
    return {
      language_detected: locale,
      intent_category: 'escalation_required',
      conversational_response: PARTIAL_MESSAGES[locale].response,
      citations: baseResponse.citations,
      escalation_payload: {
        requires_human: true,
        routing_queue: 'content_curators',
        system_message: PARTIAL_MESSAGES[locale].system,
      },
      ui_hints: {
        nativewind_card_type: 'warning',
        figma_layout_id: 'knowledge-gap-escalation',
      },
    };
  }

  return {
    ...baseResponse,
    conversational_response: answer,
    citations,
    ui_hints: {
      nativewind_card_type: 'success',
      figma_layout_id: 'approved-source-answer',
    },
  };
}
