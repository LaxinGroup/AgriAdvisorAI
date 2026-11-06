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
      'I cannot make eligibility decisions. An authorized agent must review this request. Live routing is not connected, so no transfer has occurred.',
    eligibilitySystem:
      'Eligibility review is required. No approved criteria or live handoff are configured; no transfer has occurred.',
    escalation:
      'I cannot answer this from an approved knowledge base because none is connected. A human support team member must review the question. Live routing is not connected, so no transfer has occurred.',
    escalationSystem:
      'The question cannot be answered from approved knowledge because no knowledge base is connected. Human review is required; no transfer has occurred.',
  },
  afr: {
    eligibility:
      'Ek kan nie besluite oor geskiktheid neem nie. \'n Gemagtigde agent moet hierdie versoek beoordeel. Regstreekse roetering is nie gekoppel nie, dus is geen oordrag gedoen nie.',
    eligibilitySystem:
      'Geskiktheidshersiening is nodig. Geen goedgekeurde kriteria of regstreekse oorhandiging is opgestel nie; geen oordrag het plaasgevind nie.',
    escalation:
      'Ek kan nie hierdie vraag uit \'n goedgekeurde kennisbasis beantwoord nie, omdat geen kennisbasis gekoppel is nie. \'n Menslike ondersteuningspanlid moet die vraag beoordeel. Regstreekse roetering is nie gekoppel nie, dus is geen oordrag gedoen nie.',
    escalationSystem:
      'Die vraag kan nie met goedgekeurde kennis beantwoord word nie, omdat geen kennisbasis gekoppel is nie. Menslike hersiening is nodig; geen oordrag het plaasgevind nie.',
  },
  es: {
    eligibility:
      'No puedo tomar decisiones sobre elegibilidad. Un agente autorizado debe revisar esta solicitud. La derivación en directo no está conectada, por lo que no se ha transferido la solicitud.',
    eligibilitySystem:
      'Se requiere una revisión de elegibilidad. No hay criterios aprobados ni una derivación en directo configurados; no se ha transferido la solicitud.',
    escalation:
      'No puedo responder a esta pregunta con una base de conocimiento aprobada porque no hay ninguna conectada. Un miembro del equipo de soporte debe revisar la pregunta. La derivación en directo no está conectada, por lo que no se ha transferido la solicitud.',
    escalationSystem:
      'No se puede responder con conocimiento aprobado porque no hay una base de conocimiento conectada. Se requiere revisión humana; no se ha transferido la solicitud.',
  },
  fr: {
    eligibility:
      'Je ne peux pas prendre de décision concernant l’éligibilité. Un agent habilité doit examiner cette demande. Le transfert en direct n’est pas connecté, la demande n’a donc pas été transmise.',
    eligibilitySystem:
      'Un examen de l’éligibilité est requis. Aucun critère approuvé ni transfert en direct n’est configuré ; la demande n’a pas été transmise.',
    escalation:
      'Je ne peux pas répondre à cette question à partir d’une base de connaissances approuvée, car aucune n’est connectée. Un membre de l’équipe d’assistance doit examiner la question. Le transfert en direct n’est pas connecté, la demande n’a donc pas été transmise.',
    escalationSystem:
      'La question ne peut pas recevoir de réponse fondée sur des connaissances approuvées, car aucune base de connaissances n’est connectée. Un examen humain est requis ; la demande n’a pas été transmise.',
  },
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
