import assert from 'node:assert/strict';
import { after, test } from 'node:test';

import { createApp } from '../index.js';

const repository = {
  async listSources() {
    return [];
  },
  async isCurator() {
    return false;
  },
  async searchSources() {
    return [];
  },
};

const app = createApp({
  authUrl: 'http://localhost:3000/auth',
  verifyToken: async (token) => {
    if (token !== 'staff-token') throw new Error('Invalid test token.');
    return { sub: 'staff-user' };
  },
  repository,
});
const server = app.listen(0, '127.0.0.1');
const baseUrl = await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.once('listening', () => {
    const address = server.address();
    if (!address || typeof address === 'string') {
      reject(new Error('The test server did not bind to a TCP port.'));
      return;
    }
    resolve(`http://127.0.0.1:${address.port}`);
  });
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

async function postAssistant(message, locale) {
  return fetch(`${baseUrl}/api/assistant`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer staff-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, locale }),
  });
}

test('health endpoint reports that the API is running', async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('unsupported questions receive an explicit knowledge-gap handoff', async () => {
  const response = await postAssistant('A colleague gets VPN error 809 on Windows.', 'en');
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.language_detected, 'en');
  assert.equal(result.intent_category, 'escalation_required');
  assert.deepEqual(Object.keys(result).sort(), [
    'citations',
    'conversational_response',
    'escalation_payload',
    'intent_category',
    'language_detected',
    'ui_hints',
  ]);
  assert.match(
    result.conversational_response,
    /approved sources because no matching passage was found/i,
  );
  assert.deepEqual(result.citations, []);
  assert.deepEqual(result.escalation_payload, {
    requires_human: true,
    routing_queue: 'content_curators',
    system_message: result.escalation_payload.system_message,
  });
  assert.equal(result.ui_hints.nativewind_card_type, 'warning');
  assert.equal(result.ui_hints.figma_layout_id, 'knowledge-gap-escalation');
  assert.match(result.escalation_payload.system_message, /no live transfer has occurred/i);
});

test('eligibility questions are not decided and route for human review', async () => {
  const response = await postAssistant('Am I eligible for the bonus?', 'en');
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.intent_category, 'eligibility_check');
  assert.match(result.conversational_response, /cannot determine eligibility/i);
  assert.equal(result.escalation_payload.requires_human, true);
  assert.equal(result.escalation_payload.routing_queue, 'eligibility_review');
  assert.deepEqual(result.citations, []);
  assert.match(result.conversational_response, /no live transfer has occurred/i);
});

test('French eligibility terms are detected and sent to the review queue', async () => {
  const response = await postAssistant('Suis-je éligible à cette aide ?', 'fr');
  const result = await response.json();

  assert.equal(result.intent_category, 'eligibility_check');
  assert.equal(result.escalation_payload.routing_queue, 'eligibility_review');
  assert.match(result.conversational_response, /Je ne peux pas prendre de décision/i);
});

test('Afrikaans device locale is normalized and the handoff is localized', async () => {
  const response = await postAssistant('Is ek geskik vir die bonus?', 'af-ZA');
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.language_detected, 'afr');
  assert.equal(result.intent_category, 'eligibility_check');
  assert.match(result.conversational_response, /Ek kan nie besluite oor geskiktheid neem nie/i);
  assert.equal(result.escalation_payload.routing_queue, 'eligibility_review');
});

test('Spanish and French locales receive localized fallback text', async () => {
  const spanishResponse = await postAssistant('¿Puedo solicitar ayuda?', 'es-MX');
  const spanish = await spanishResponse.json();
  assert.equal(spanish.language_detected, 'es');
  assert.match(spanish.conversational_response, /No puedo responder/i);

  const frenchResponse = await postAssistant('Quelle est la politique ?', 'fr-FR');
  const french = await frenchResponse.json();
  assert.equal(french.language_detected, 'fr');
  assert.match(french.conversational_response, /Je ne peux pas répondre/i);
});

test('unsupported device locales use English fallback', async () => {
  const response = await postAssistant('Where can I find the policy?', 'de-DE');
  const result = await response.json();

  assert.equal(result.language_detected, 'en');
  assert.match(result.conversational_response, /I cannot answer from the approved sources/i);
});

test('assistant endpoint rejects empty and oversized messages', async () => {
  const emptyResponse = await postAssistant('   ', 'en');
  assert.equal(emptyResponse.status, 400);
  assert.match((await emptyResponse.json()).error, /cannot be empty/i);

  const oversizedResponse = await postAssistant('a'.repeat(4001), 'en');
  assert.equal(oversizedResponse.status, 400);
  assert.match((await oversizedResponse.json()).error, /4000 characters/i);
});

test('assistant endpoint validates the locale field', async () => {
  const invalidType = await postAssistant('Question', 42);
  assert.equal(invalidType.status, 400);
  assert.match((await invalidType.json()).error, /locale field must be a string/i);

  const oversizedLocale = await postAssistant('Question', 'a'.repeat(33));
  assert.equal(oversizedLocale.status, 400);
  assert.match((await oversizedLocale.json()).error, /locale must be 32 characters/i);
});

test('assistant endpoint returns JSON for malformed request bodies', async () => {
  const response = await fetch(`${baseUrl}/api/assistant`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer staff-token',
      'Content-Type': 'application/json',
    },
    body: '{',
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: 'Request body must be valid JSON.',
  });
});

test('assistant endpoint requires a valid bearer token', async () => {
  const missingToken = await fetch(`${baseUrl}/api/assistant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'A policy question', locale: 'en' }),
  });
  assert.equal(missingToken.status, 401);

  const invalidToken = await fetch(`${baseUrl}/api/assistant`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer invalid-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: 'A policy question', locale: 'en' }),
  });
  assert.equal(invalidToken.status, 401);
});

test('assistant returns source excerpts without generating an answer', async () => {
  repository.searchSources = async () => [{
    match_id: 'chunk-1',
    source_id: 'source-1',
    title: 'VPN setup',
    url_or_reference: 'https://support.example.org/vpn',
    location: 'Section: Setup',
    excerpt: 'Connect to the VPN using the approved client.',
  }];

  try {
    const response = await postAssistant('How do I connect to the VPN?', 'en');
    const result = await response.json();

    assert.equal(response.status, 200);
    assert.equal(result.intent_category, 'standard_query');
    assert.match(result.conversational_response, /relevant excerpts/i);
    assert.deepEqual(result.citations, [{
      match_id: 'chunk-1',
      source_id: 'source-1',
      title: 'VPN setup',
      url_or_reference: 'https://support.example.org/vpn',
      location: 'Section: Setup',
      excerpt: 'Connect to the VPN using the approved client.',
    }]);
    assert.equal(result.escalation_payload.requires_human, false);
  } finally {
    repository.searchSources = async () => [];
  }
});

test('eligibility questions remain escalated when excerpts are retrieved', async () => {
  repository.searchSources = async () => [{
    match_id: 'chunk-2',
    source_id: 'source-2',
    title: 'Benefits policy',
    url_or_reference: '',
    location: 'Page 2',
    excerpt: 'The benefit is reviewed by the HR team.',
  }];

  try {
    const response = await postAssistant('Am I eligible for the bonus?', 'en');
    const result = await response.json();

    assert.equal(result.intent_category, 'eligibility_check');
    assert.equal(result.escalation_payload.requires_human, true);
    assert.equal(result.escalation_payload.routing_queue, 'eligibility_review');
    assert.equal(result.citations.length, 1);
  } finally {
    repository.searchSources = async () => [];
  }
});
