// Adds embeddings to passages that do not have one yet (sources added before
// meaning-based search, or saved while the embedding service was unavailable).
// Usage (from the server folder): pnpm backfill:embeddings
import 'dotenv/config';

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { closePool, sourceRepository } from '../database.js';
import { createGeminiEmbedder } from '../embeddings.js';

const BATCH_SIZE = 8;

export async function backfillEmbeddings({ repository, embedder, log = console.log }) {
  let updated = 0;
  while (true) {
    const chunks = await repository.listChunksWithoutEmbedding(BATCH_SIZE);
    if (chunks.length === 0) break;

    const embeddings = await embedder.embedPassages(chunks);
    for (const [index, chunk] of chunks.entries()) {
      await repository.setChunkEmbedding(chunk.id, embeddings[index]);
    }
    updated += chunks.length;
    log(`Embedded ${updated} passage(s) so far.`);
  }
  return updated;
}

const isMainModule =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMainModule) {
  const embedder = createGeminiEmbedder();
  if (!embedder) {
    console.error('GEMINI_API_KEY is not set; nothing was changed.');
    process.exitCode = 1;
  } else {
    try {
      const updated = await backfillEmbeddings({ repository: sourceRepository, embedder });
      console.log(updated === 0 ? 'All passages already have embeddings.' : `Done: ${updated} passage(s) embedded.`);
    } catch (error) {
      console.error('Backfill stopped:', error?.message);
      console.error('Passages embedded so far are saved; run the command again to continue.');
      process.exitCode = 1;
    } finally {
      await closePool();
    }
  }
}
