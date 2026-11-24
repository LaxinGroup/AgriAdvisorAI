import assert from 'node:assert/strict';
import { after, test } from 'node:test';

import { createAnsweredResponse } from '../assistant.js';
import { buildSearchQuery } from '../database.js';
import { createGeminiAnswerer } from '../gemini.js';
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
  // Written answers and meaning search off: these tests cover the excerpt and
  // fallback behaviour, and must never call the real Gemini API.
  generateAnswer: null,
  embedder: null,
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

// --- Written answers (Gemini is replaced by a fake; no network calls) ---

const VPN_MATCHES = [
  {
    match_id: 'chunk-a',
    source_id: 'source-a',
    title: 'VPN guide',
    url_or_reference: '',
    location: 'Page 3',
    excerpt: 'Error 809: allow UDP ports 500 and 4500 on the firewall, then reconnect.',
  },
  {
    match_id: 'chunk-b',
    source_id: 'source-b',
    title: 'IT setup',
    url_or_reference: '',
    location: 'Section: Network',
    excerpt: 'Use the approved VPN client.',
  },
];

function fakeAnswerer(result) {
  const calls = [];
  const generateAnswer = async (input) => {
    calls.push(input);
    if (result instanceof Error) throw result;
    return result;
  };
  return { calls, generateAnswer };
}

test('a supported answer is returned with only the passages it cites', async () => {
  const { calls, generateAnswer } = fakeAnswerer({
    answerable: true,
    answer: '1. Allow UDP ports 500 and 4500.\n2. Reconnect.',
    citedMatchIds: ['chunk-a'],
  });
  const result = await createAnsweredResponse('How do I fix VPN error 809?', 'fr-FR', VPN_MATCHES, generateAnswer);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].locale, 'fr');
  assert.equal(calls[0].isEligibility, false);
  assert.equal(result.intent_category, 'standard_query');
  assert.equal(result.conversational_response, '1. Allow UDP ports 500 and 4500.\n2. Reconnect.');
  assert.deepEqual(result.citations.map((citation) => citation.match_id), ['chunk-a']);
  assert.equal(result.escalation_payload.requires_human, false);
  assert.equal(result.ui_hints.figma_layout_id, 'approved-source-answer');
});

test('citations to passages that were not sent are removed', async () => {
  const { generateAnswer } = fakeAnswerer({
    answerable: true,
    answer: 'Allow the ports.',
    citedMatchIds: ['chunk-a', 'invented-id', 'chunk-a'],
  });
  const result = await createAnsweredResponse('VPN error 809', 'en', VPN_MATCHES, generateAnswer);

  assert.deepEqual(result.citations.map((citation) => citation.match_id), ['chunk-a']);
});

test('an answer with no valid citation becomes a specialist handoff', async () => {
  const { generateAnswer } = fakeAnswerer({
    answerable: true,
    answer: 'Restart your router.',
    citedMatchIds: ['invented-id'],
  });
  const result = await createAnsweredResponse('VPN error 809', 'en', VPN_MATCHES, generateAnswer);

  assert.equal(result.intent_category, 'escalation_required');
  assert.doesNotMatch(result.conversational_response, /router/i);
  assert.equal(result.escalation_payload.requires_human, true);
});

test('passages that do not answer the question lead to a localized handoff', async () => {
  const { generateAnswer } = fakeAnswerer({ answerable: false, answer: '', citedMatchIds: [] });
  const result = await createAnsweredResponse('What is the relocation allowance?', 'es', VPN_MATCHES, generateAnswer);

  assert.equal(result.language_detected, 'es');
  assert.equal(result.intent_category, 'escalation_required');
  assert.match(result.conversational_response, /no responden completamente/i);
  assert.equal(result.escalation_payload.routing_queue, 'content_curators');
  assert.match(result.escalation_payload.system_message, /no se ha realizado ninguna transferencia/i);
  assert.equal(result.citations.length, 2);
});

test('a Gemini failure falls back to the source excerpts', async () => {
  const { generateAnswer } = fakeAnswerer(new Error('429 quota exceeded'));
  const originalError = console.error;
  console.error = () => {};
  try {
    const result = await createAnsweredResponse('VPN error 809', 'en', VPN_MATCHES, generateAnswer);
    assert.equal(result.intent_category, 'standard_query');
    assert.match(result.conversational_response, /relevant excerpts/i);
    assert.equal(result.citations.length, 2);
  } finally {
    console.error = originalError;
  }
});

test('Gemini is not called when no passage matches', async () => {
  const { calls, generateAnswer } = fakeAnswerer({ answerable: true, answer: 'x', citedMatchIds: [] });
  const result = await createAnsweredResponse('Anything at all', 'en', [], generateAnswer);

  assert.equal(calls.length, 0);
  assert.equal(result.intent_category, 'escalation_required');
});

test('eligibility answers keep the warning and human review', async () => {
  const { calls, generateAnswer } = fakeAnswerer({
    answerable: true,
    answer: 'The policy lists two criteria: 12 months of service and a completed review.',
    citedMatchIds: ['chunk-a'],
  });
  const result = await createAnsweredResponse('Am I eligible for the bonus?', 'en', VPN_MATCHES, generateAnswer);

  assert.equal(calls[0].isEligibility, true);
  assert.equal(result.intent_category, 'eligibility_check');
  assert.match(result.conversational_response, /two criteria/);
  assert.match(result.conversational_response, /cannot determine eligibility/i);
  assert.equal(result.escalation_payload.requires_human, true);
  assert.equal(result.escalation_payload.routing_queue, 'eligibility_review');
});

test('the assistant endpoint uses the configured answerer', async () => {
  const { generateAnswer } = fakeAnswerer({
    answerable: true,
    answer: 'Allow UDP ports 500 and 4500.',
    citedMatchIds: ['chunk-a'],
  });
  const answeringApp = createApp({
    authUrl: 'http://localhost:3000/auth',
    verifyToken: async () => ({ sub: 'staff-user' }),
    repository: { ...repository, searchSources: async () => VPN_MATCHES },
    generateAnswer,
    embedder: null,
  });
  const answeringServer = answeringApp.listen(0, '127.0.0.1');
  await new Promise((resolve) => answeringServer.once('listening', resolve));
  try {
    const { port } = answeringServer.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/assistant`, {
      method: 'POST',
      headers: { Authorization: 'Bearer any', 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'How do I fix VPN error 809?', locale: 'en' }),
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.conversational_response, 'Allow UDP ports 500 and 4500.');
  } finally {
    await new Promise((resolve) => answeringServer.close(resolve));
  }
});

test('the Gemini request is built from the passages and parsed safely', async () => {
  const requests = [];
  const client = {
    interactions: {
      async create(params, options) {
        requests.push({ params, options });
        return {
          output_text: JSON.stringify({
            answerable: true,
            answer: 'Allow UDP ports 500 and 4500.',
            cited_match_ids: ['chunk-a'],
          }),
        };
      },
    },
  };
  const generateAnswer = createGeminiAnswerer({ client, model: 'test-model' });
  const result = await generateAnswer({
    question: 'How do I fix VPN error 809?',
    locale: 'afr',
    matches: VPN_MATCHES,
    isEligibility: false,
  });

  const { params, options } = requests[0];
  assert.equal(params.model, 'test-model');
  assert.equal(params.store, false);
  assert.equal(params.response_format.mime_type, 'application/json');
  assert.match(params.system_instruction, /Afrikaans/);
  assert.match(params.input, /\[id: chunk-a\]/);
  assert.match(params.input, /UDP ports 500 and 4500/);
  assert.ok(options.timeout_ms > 0);
  assert.deepEqual(result, {
    answerable: true,
    answer: 'Allow UDP ports 500 and 4500.',
    citedMatchIds: ['chunk-a'],
  });
});

test('a malformed Gemini reply is rejected', async () => {
  const client = {
    interactions: { create: async () => ({ output_text: '{"answer": 42}' }) },
  };
  const generateAnswer = createGeminiAnswerer({ client });
  await assert.rejects(
    generateAnswer({ question: 'q', locale: 'en', matches: VPN_MATCHES, isEligibility: false }),
    /unexpected format/,
  );
});

test('no answerer is created without an API key', () => {
  assert.equal(createGeminiAnswerer({ apiKey: '' }), null);
});

async function postToApp(options, message) {
  const testApp = createApp({
    authUrl: 'http://localhost:3000/auth',
    verifyToken: async () => ({ sub: 'staff-user' }),
    generateAnswer: null,
    ...options,
  });
  const testServer = testApp.listen(0, '127.0.0.1');
  await new Promise((resolve) => testServer.once('listening', resolve));
  try {
    const { port } = testServer.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/assistant`, {
      method: 'POST',
      headers: { Authorization: 'Bearer any', 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, locale: 'en' }),
    });
    return response.status;
  } finally {
    await new Promise((resolve) => testServer.close(resolve));
  }
}

test('questions are embedded and up to 8 passages are requested', async () => {
  const searches = [];
  const status = await postToApp({
    repository: {
      ...repository,
      searchSources: async (...args) => {
        searches.push(args);
        return [];
      },
    },
    embedder: { embedQuestion: async () => [0.1, 0.2] },
  }, 'What is AgriSETA?');

  assert.equal(status, 200);
  assert.equal(searches[0][0], 'What is AgriSETA?');
  assert.equal(searches[0][1], 8);
  assert.deepEqual(searches[0][2], { questionEmbedding: [0.1, 0.2] });
});

test('a failed question embedding falls back to keyword search', async () => {
  const searches = [];
  const originalError = console.error;
  console.error = () => {};
  try {
    const status = await postToApp({
      repository: {
        ...repository,
        searchSources: async (...args) => {
          searches.push(args);
          return [];
        },
      },
      embedder: {
        embedQuestion: async () => {
          throw new Error('quota exceeded');
        },
      },
    }, 'What is AgriSETA?');

    assert.equal(status, 200);
    assert.deepEqual(searches[0][2], { questionEmbedding: undefined });
  } finally {
    console.error = originalError;
  }
});

test('search matches any question word instead of requiring all of them', () => {
  assert.equal(
    buildSearchQuery('How do I fix VPN error 809?'),
    "'how' | 'fix' | 'vpn' | 'error' | '809'",
  );
  assert.equal(buildSearchQuery("Qu'est-ce que l'éligibilité ?"), "'est' | 'que' | 'éligibilité'");
  assert.equal(buildSearchQuery('?? !!'), '');
  assert.equal(buildSearchQuery("x'); DROP TABLE users; --"), "'drop' | 'table' | 'users'");
});
