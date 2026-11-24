import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_MAX_DISTANCE, mergeSearchResults } from '../database.js';
import {
  EMBEDDING_DIMENSIONS,
  createGeminiEmbedder,
  formatPassageForEmbedding,
  formatQuestionForEmbedding,
  toVectorLiteral,
} from '../embeddings.js';
import { backfillEmbeddings } from '../scripts/backfill-embeddings.js';

const vector = (seed) => Array.from({ length: EMBEDDING_DIMENSIONS }, () => seed);

function fakeClient() {
  const requests = [];
  return {
    requests,
    models: {
      async embedContent(params) {
        requests.push(params);
        return { embeddings: params.contents.map((_, index) => ({ values: vector(index) })) };
      },
    },
  };
}

test('passages and questions use Google\'s retrieval format', () => {
  assert.equal(
    formatPassageForEmbedding({ title: 'Home - AgriSETA', location: 'Section: Tenders', content: 'Text.' }),
    'title: Home - AgriSETA | text: Section: Tenders\nText.',
  );
  assert.equal(
    formatPassageForEmbedding({ title: '', location: '', content: 'Text.' }),
    'title: none | text: Text.',
  );
  assert.equal(formatQuestionForEmbedding('What is AgriSETA?'), 'task: question answering | query: What is AgriSETA?');
  assert.equal(toVectorLiteral([0.5, -1, 2]), '[0.5,-1,2]');
});

test('passages are embedded in small batches, one embedding per passage', async () => {
  const client = fakeClient();
  const embedder = createGeminiEmbedder({ client, model: 'test-embedding' });
  const passages = Array.from({ length: 10 }, (_, index) => ({ title: 'T', location: '', content: `p${index}` }));

  const vectors = await embedder.embedPassages(passages);

  assert.equal(vectors.length, 10);
  assert.equal(client.requests.length, 2);
  assert.equal(client.requests[0].contents.length, 8);
  assert.equal(client.requests[1].contents.length, 2);
  assert.deepEqual(client.requests[0].contents[0], { parts: [{ text: 'title: T | text: p0' }] });
  assert.equal(client.requests[0].model, 'test-embedding');
  assert.equal(client.requests[0].config.outputDimensionality, 768);
  assert.ok(client.requests[0].config.abortSignal);
});

test('question embedding uses the question format', async () => {
  const client = fakeClient();
  const embedder = createGeminiEmbedder({ client });
  const result = await embedder.embedQuestion('Where is the office?');

  assert.equal(result.length, EMBEDDING_DIMENSIONS);
  assert.equal(client.requests[0].contents[0].parts[0].text, 'task: question answering | query: Where is the office?');
});

test('an unexpected embedding response is rejected', async () => {
  const embedder = createGeminiEmbedder({
    client: { models: { embedContent: async () => ({ embeddings: [{ values: [1, 2, 3] }] }) } },
  });
  await assert.rejects(embedder.embedQuestion('q'), /unexpected result/);
  assert.equal(createGeminiEmbedder({ apiKey: '' }), null);
});

test('search results keep close passages, drop distant ones, and fill with keyword backups', () => {
  const row = (id, distance) => ({ match_id: id, excerpt: id, distance });
  const merged = mergeSearchResults(
    [row('close', 0.2), row('both', 0.3), row('far', DEFAULT_MAX_DISTANCE + 0.1)],
    [{ match_id: 'both', excerpt: 'both', rank: 1 }, { match_id: 'keyword', excerpt: 'keyword', rank: 0.5 }],
    8,
  );

  assert.deepEqual(merged.map((passage) => passage.match_id), ['close', 'both', 'keyword']);
  assert.equal('distance' in merged[0], false);
  assert.equal('rank' in merged[2], false);
  assert.equal(mergeSearchResults([row('a', 0.1), row('b', 0.1)], [], 1).length, 1);
});

test('the catch-up script embeds passages that have none', async () => {
  const pending = [
    { id: 'c1', title: 'T', location: 'L', content: 'one' },
    { id: 'c2', title: 'T', location: 'L', content: 'two' },
  ];
  const saved = new Map();
  const repository = {
    async listChunksWithoutEmbedding(limit) {
      return pending.filter((chunk) => !saved.has(chunk.id)).slice(0, limit);
    },
    async setChunkEmbedding(id, embedding) {
      saved.set(id, embedding);
    },
  };
  const embedder = { embedPassages: async (chunks) => chunks.map((_, index) => [index]) };

  const updated = await backfillEmbeddings({ repository, embedder, log: () => {} });

  assert.equal(updated, 2);
  assert.deepEqual([...saved.keys()], ['c1', 'c2']);
});
