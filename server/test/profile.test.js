import assert from 'node:assert/strict';
import { after, test } from 'node:test';

import { createApp } from '../index.js';

const profiles = new Map();
const repository = {
  async isCurator() {
    return false;
  },
  async upsertProfile(userId, displayName, preferredLanguage) {
    const profile = { display_name: displayName, preferred_language: preferredLanguage };
    profiles.set(userId, profile);
    return profile;
  },
};

const app = createApp({
  authUrl: 'http://localhost:3000/auth',
  verifyToken: async (token) => {
    if (token !== 'new-user-token') throw new Error('Invalid test token.');
    return { sub: 'new-user' };
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

function postProfile(body, token = 'new-user-token') {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${baseUrl}/api/profile`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

test('profile saving requires a signed-in user', async () => {
  const response = await postProfile({ displayName: 'Thandi', preferredLanguage: 'en' }, null);
  assert.equal(response.status, 401);
  assert.equal(profiles.size, 0);
});

test('profile saving rejects invalid input', async () => {
  const blankName = await postProfile({ displayName: '   ', preferredLanguage: 'en' });
  assert.equal(blankName.status, 400);

  const longName = await postProfile({ displayName: 'a'.repeat(101), preferredLanguage: 'en' });
  assert.equal(longName.status, 400);

  const badLanguage = await postProfile({ displayName: 'Thandi', preferredLanguage: 'de' });
  assert.equal(badLanguage.status, 400);
  assert.equal(profiles.size, 0);
});

test('profile saving stores the profile for the signed-in user only', async () => {
  const response = await postProfile({
    displayName: '  Thandi  ',
    preferredLanguage: 'afr',
    userId: 'someone-else',
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    profile: { displayName: 'Thandi', preferredLanguage: 'afr' },
  });
  assert.deepEqual(profiles.get('new-user'), {
    display_name: 'Thandi',
    preferred_language: 'afr',
  });
  assert.equal(profiles.has('someone-else'), false);
});
