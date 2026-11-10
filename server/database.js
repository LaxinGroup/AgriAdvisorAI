import pg from 'pg';

const { Pool } = pg;
let pool;

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
            (source_id, chunk_index, location, content)
           VALUES ($1, $2, $3, $4)`,
          [id, chunk.index, chunk.location, chunk.content],
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

  async searchSources(query, limit = 4) {
    const result = await getPool().query(
      `WITH search_query AS (
         SELECT websearch_to_tsquery('simple', $1) AS value
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
       ORDER BY rank DESC, s.created_at DESC, c.chunk_index
       LIMIT $2`,
      [query, limit],
    );
    return result.rows;
  },
};

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
