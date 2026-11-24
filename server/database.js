import pg from 'pg';

import { toVectorLiteral } from './embeddings.js';

const { Pool } = pg;
let pool;

const MAX_SEARCH_WORDS = 32;

// Cosine distance (0 = same meaning, 2 = opposite) above which a passage is treated as
// unrelated. Calibrated on real data; see prompts/meaning-search-plan.md.
export const DEFAULT_MAX_DISTANCE = 0.35;

// Combines meaning-based results (closest first, within the cut-off) with keyword
// results, without duplicates, up to `limit` passages.
export function mergeSearchResults(vectorRows, keywordRows, limit, maxDistance = DEFAULT_MAX_DISTANCE) {
  const merged = [];
  const seen = new Set();
  const closeEnough = vectorRows.filter((row) => Number(row.distance) <= maxDistance);
  for (const row of [...closeEnough, ...keywordRows]) {
    if (merged.length >= limit) break;
    if (seen.has(row.match_id)) continue;
    seen.add(row.match_id);
    const { distance: _distance, rank: _rank, ...passage } = row;
    merged.push(passage);
  }
  return merged;
}

// Turns a question into a full-text query that matches passages containing ANY of its
// words (ranked so passages with more matching words come first). Words shorter than
// three letters are skipped unless they are numbers. Only letters and digits are kept,
// so the result is always a valid to_tsquery expression.
export function buildSearchQuery(text) {
  const words = String(text).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const keywords = [...new Set(words)]
    .filter((word) => word.length >= 3 || /^\p{N}+$/u.test(word))
    .slice(0, MAX_SEARCH_WORDS);
  return keywords.map((word) => `'${word}'`).join(' | ');
}

export function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured.');
  }

  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

export const sourceRepository = {
  async listSources() {
    const result = await getPool().query(
      `SELECT id, title, source_type, source_url, created_at, updated_at
       FROM knowledge_sources
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC, id`,
    );
    return result.rows;
  },

  async createSource({ id, title, sourceType, sourceUrl, objectKey, createdBy, chunks }) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const sourceResult = await client.query(
        `INSERT INTO knowledge_sources
          (id, title, source_type, source_url, object_key, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, title, source_type, source_url, created_at, updated_at`,
        [id, title, sourceType, sourceUrl, objectKey, createdBy],
      );
      for (const chunk of chunks) {
        await client.query(
          `INSERT INTO knowledge_source_chunks
            (source_id, chunk_index, location, content, embedding)
           VALUES ($1, $2, $3, $4, $5::vector)`,
          [
            id,
            chunk.index,
            chunk.location,
            chunk.content,
            chunk.embedding ? toVectorLiteral(chunk.embedding) : null,
          ],
        );
      }
      await client.query('COMMIT');
      return sourceResult.rows[0] ?? { id };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return id;
  },

  async updateSourceTitle(id, title) {
    const result = await getPool().query(
      `UPDATE knowledge_sources
       SET title = $2, updated_at = now()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [id, title],
    );
    return result.rowCount > 0;
  },

  async findSource(id) {
    const result = await getPool().query(
      `SELECT id, object_key
       FROM knowledge_sources
       WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return result.rows[0] ?? null;
  },

  async deleteSource(id) {
    const result = await getPool().query(
      `UPDATE knowledge_sources
       SET deleted_at = now(), updated_at = now()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [id],
    );
    return result.rowCount > 0;
  },

  async isCurator(userId) {
    const result = await getPool().query(
      'SELECT 1 FROM curator_allowlist WHERE auth_user_id = $1',
      [userId],
    );
    return result.rowCount > 0;
  },

  async upsertProfile(userId, displayName, preferredLanguage) {
    const result = await getPool().query(
      `INSERT INTO user_profiles (auth_user_id, display_name, preferred_language)
       VALUES ($1, $2, $3)
       ON CONFLICT (auth_user_id) DO UPDATE
         SET display_name = EXCLUDED.display_name,
             preferred_language = EXCLUDED.preferred_language,
             updated_at = now()
       RETURNING display_name, preferred_language`,
      [userId, displayName, preferredLanguage],
    );
    return result.rows[0];
  },

  // Keyword search. With `onlyWithoutEmbedding`, only passages that have no embedding yet
  // are searched (the backup for passages the meaning search cannot see).
  async keywordSearch(query, limit, { onlyWithoutEmbedding = false } = {}) {
    const searchQuery = buildSearchQuery(query);
    if (!searchQuery) return [];

    const result = await getPool().query(
      `WITH search_query AS (
         SELECT to_tsquery('simple', $1) AS value
       )
       SELECT c.id::text AS match_id,
              s.id::text AS source_id,
              s.title,
              s.source_url AS url_or_reference,
              c.location,
              c.content AS excerpt,
              ts_rank_cd(c.search_vector, search_query.value) AS rank
       FROM knowledge_source_chunks c
       JOIN knowledge_sources s ON s.id = c.source_id
       CROSS JOIN search_query
       WHERE s.deleted_at IS NULL
         AND search_query.value <> ''::tsquery
         AND c.search_vector @@ search_query.value
         AND (NOT $3::boolean OR c.embedding IS NULL)
       ORDER BY rank DESC, s.created_at DESC, c.chunk_index
       LIMIT $2`,
      [searchQuery, limit, onlyWithoutEmbedding],
    );
    return result.rows;
  },

  // Meaning-based search: the passages whose embeddings are closest to the question's.
  async vectorSearch(questionEmbedding, limit) {
    const result = await getPool().query(
      `SELECT c.id::text AS match_id,
              s.id::text AS source_id,
              s.title,
              s.source_url AS url_or_reference,
              c.location,
              c.content AS excerpt,
              c.embedding <=> $1::vector AS distance
       FROM knowledge_source_chunks c
       JOIN knowledge_sources s ON s.id = c.source_id
       WHERE s.deleted_at IS NULL
         AND c.embedding IS NOT NULL
       ORDER BY c.embedding <=> $1::vector
       LIMIT $2`,
      [toVectorLiteral(questionEmbedding), limit],
    );
    return result.rows;
  },

  // Meaning-based search when a question embedding is given, keyword search otherwise.
  async searchSources(query, limit = 8, { questionEmbedding, maxDistance } = {}) {
    if (!questionEmbedding) {
      return mergeSearchResults([], await this.keywordSearch(query, limit), limit);
    }
    const [vectorRows, keywordRows] = await Promise.all([
      this.vectorSearch(questionEmbedding, limit),
      this.keywordSearch(query, limit, { onlyWithoutEmbedding: true }),
    ]);
    return mergeSearchResults(vectorRows, keywordRows, limit, maxDistance);
  },

  async listChunksWithoutEmbedding(limit) {
    const result = await getPool().query(
      `SELECT c.id::text AS id, s.title, c.location, c.content
       FROM knowledge_source_chunks c
       JOIN knowledge_sources s ON s.id = c.source_id
       WHERE s.deleted_at IS NULL AND c.embedding IS NULL
       ORDER BY s.created_at, c.chunk_index
       LIMIT $1`,
      [limit],
    );
    return result.rows;
  },

  async setChunkEmbedding(id, embedding) {
    await getPool().query(
      'UPDATE knowledge_source_chunks SET embedding = $2::vector WHERE id = $1',
      [id, toVectorLiteral(embedding)],
    );
  },
};

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
