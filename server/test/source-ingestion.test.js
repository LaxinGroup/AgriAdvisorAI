import assert from 'node:assert/strict';
import { after, test } from 'node:test';

import { createSourceIngestion, fetchPublicResource } from '../source-ingestion.js';
import { createApp } from '../index.js';

class MemoryRepository {
  sources = new Map();
  chunks = new Map();
  curators = new Set(['curator-user']);

  async listSources() {
    return [...this.sources.values()];
  }

  async createSource(source) {
    this.sources.set(source.id, {
      id: source.id,
      title: source.title,
      source_type: source.sourceType,
      source_url: source.sourceUrl,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      object_key: source.objectKey,
    });
    this.chunks.set(source.id, source.chunks);
  }

  async updateSourceTitle(id, title) {
    const source = this.sources.get(id);
    if (!source) return false;
    source.title = title;
    return true;
  }

  async findSource(id) {
    const source = this.sources.get(id);
    return source ? { id, object_key: source.object_key } : null;
  }

  async deleteSource(id) {
    const deleted = this.sources.delete(id);
    this.chunks.delete(id);
    return deleted;
  }

  async isCurator(userId) {
    return this.curators.has(userId);
  }

  async searchSources() {
    return [];
  }
}

function createTestService(repository, overrides = {}) {
  return createSourceIngestion({
    repository,
    storage: {
      async putObject() {},
      async deleteObject() {},
    },
    createId: () => '11111111-1111-4111-8111-111111111111',
    ...overrides,
  });
}

test('pasted paragraphs require a title and are chunked with the selected overlap', async () => {
  const repository = new MemoryRepository();
  const ingestion = createTestService(repository);
  const words = Array.from({ length: 1500 }, (_, index) => `word${index}`).join(' ');

  await assert.rejects(
    ingestion.ingest({ body: { type: 'paragraph', text: 'No title' }, userId: 'curator-user' }),
    /source title is required/i,
  );

  const source = await ingestion.ingest({
    body: { type: 'paragraph', title: 'Workplace policy', text: words },
    userId: 'curator-user',
  });
  const chunks = repository.chunks.get(source.id);

  assert.equal(source.source_type, 'paragraph');
  assert.equal(source.title, 'Workplace policy');
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].content.split(' ').length, 800);
  assert.equal(chunks[1].content.split(' ')[0], 'word680');
  assert.equal(chunks[2].content.split(' ')[0], 'word1360');
});

test('public webpage titles and heading locations are retained', async () => {
  const repository = new MemoryRepository();
  const ingestion = createTestService(repository, {
    fetchResource: async () => ({
      url: 'https://support.example.org/policy',
      contentType: 'text/html',
      bytes: Buffer.from(
        '<html><head><title>Support policy</title></head><body><h2>Remote access</h2><p>Connect through the approved VPN client.</p></body></html>',
      ),
    }),
  });

  const source = await ingestion.ingest({
    body: { type: 'link', url: 'https://support.example.org/policy' },
    userId: 'curator-user',
  });

  assert.equal(source.title, 'Support policy');
  assert.equal(source.source_type, 'webpage');
  assert.equal(repository.chunks.get(source.id)[0].location, 'Section: Remote access');
});

test('direct PDF uploads reject non-PDF content and oversized files', async () => {
  const repository = new MemoryRepository();
  const ingestion = createTestService(repository);
  const corruptPdf = Buffer.from('%PDF-1.4 invalid');

  await assert.rejects(
    ingestion.ingest({
      file: { mimetype: 'text/plain', size: 10, originalname: 'notes.pdf', buffer: Buffer.from('text') },
      userId: 'curator-user',
    }),
    /choose a PDF/i,
  );
  await assert.rejects(
    ingestion.ingest({
      file: {
        mimetype: 'application/pdf',
        size: 7,
        originalname: 'invalid.pdf',
        buffer: Buffer.from('not-pdf'),
      },
      userId: 'curator-user',
    }),
    /not a valid PDF/i,
  );
  await assert.rejects(
    ingestion.ingest({
      file: {
        mimetype: 'application/pdf',
        size: corruptPdf.length,
        originalname: 'corrupt.pdf',
        buffer: corruptPdf,
      },
      userId: 'curator-user',
    }),
    /could not be read|no extractable text/i,
  );
  await assert.rejects(
    ingestion.ingest({
      file: {
        mimetype: 'application/pdf',
        size: 10 * 1024 * 1024 + 1,
        originalname: 'large.pdf',
        buffer: Buffer.alloc(0),
      },
      userId: 'curator-user',
    }),
    /10 MB or smaller/i,
  );
});

test('public URL fetch rejects unsafe schemes and private network targets', async () => {
  await assert.rejects(fetchPublicResource('file:///etc/passwd'), /only public HTTP or HTTPS/i);
  await assert.rejects(fetchPublicResource('http://127.0.0.1/internal'), /public IP addresses/i);
});

const repository = new MemoryRepository();
const ingestion = createTestService(repository);
const app = createApp({
  authUrl: 'http://localhost:3000/auth',
  verifyToken: async (token) => {
    if (token === 'curator-token') return { sub: 'curator-user' };
    if (token === 'staff-token') return { sub: 'staff-user' };
    throw new Error('Invalid test token.');
  },
  repository,
  ingestion,
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

test('only curator allowlist users can ingest, rename, and delete sources', async () => {
  const forbidden = await fetch(`${baseUrl}/api/sources`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer staff-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'paragraph', title: 'Policy', text: 'Approved content.' }),
  });
  assert.equal(forbidden.status, 403);

  const created = await fetch(`${baseUrl}/api/sources`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer curator-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'paragraph', title: 'Policy', text: 'Approved content.' }),
  });
  assert.equal(created.status, 201);
  const { source } = await created.json();

  const listed = await fetch(`${baseUrl}/api/sources`, {
    headers: { Authorization: 'Bearer staff-token' },
  });
  const listing = await listed.json();
  assert.equal(listing.canManage, false);
  assert.equal(listing.sources.length, 1);
  assert.equal(listing.sources[0].title, 'Policy');

  const renamed = await fetch(`${baseUrl}/api/sources/${source.id}`, {
    method: 'PATCH',
    headers: {
      Authorization: 'Bearer curator-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: 'Updated policy' }),
  });
  assert.equal(renamed.status, 200);
  assert.equal(repository.sources.get(source.id).title, 'Updated policy');

  const deleted = await fetch(`${baseUrl}/api/sources/${source.id}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer curator-token' },
  });
  assert.equal(deleted.status, 204);
  assert.equal(repository.sources.has(source.id), false);
});
