# Meaning-based search plan (Option B)

## Goal

Find source passages by meaning rather than exact words, so questions match word forms,
synonyms, headings and other languages. Gemini receives up to 8 passages.

## Decisions

- Embedding model: `gemini-embedding-2` (Google's latest, Stable, free tier), set through
  `GEMINI_EMBEDDING_MODEL`. 768 dimensions (auto-normalised by the model).
- Google's retrieval format (the model has no task_type field):
  passages `title: {source title} | text: {heading}\n{content}`,
  questions `task: question answering | query: {question}`.
- Storage: Neon pgvector, `knowledge_source_chunks.embedding vector(768)` with an HNSW
  cosine index.
- If embedding fails when a source is added, the source is saved without embeddings
  (keyword search still works) and the catch-up script fills them in later.
- The database change and catch-up script are run from this machine using
  `server/.env`, after the owner confirms.

## Behaviour

1. Adding a source embeds each passage and stores the vector with it.
2. A question is embedded; the closest passages within a distance cut-off are taken,
   then keyword matches are added as a backup, up to 8 passages.
3. Passages beyond the cut-off are dropped, so unrelated questions still go to
   specialist review without calling Gemini. The cut-off is calibrated on real data.
4. If the question embedding fails, search falls back to keyword search only.
5. `pnpm backfill:embeddings` embeds passages that have no embedding yet.

## Approved files

- `server/embeddings.js` (new), `server/scripts/backfill-embeddings.js` (new)
- `server/schema.sql`, `server/database.js`, `server/source-ingestion.js`, `server/index.js`
- `server/package.json` (script only), `server/.env.example`, `server/SETUP.md`
- `server/test/embeddings.test.js` (new), `server/test/source-ingestion.test.js`,
  `server/test/assistant.test.js`
- `prompts/meaning-search-plan.md` (this plan)

## Calibration

Calibrated on 2026-11-24 against the 12 passages of the AgriSETA homepage
(`gemini-embedding-2`, 768 dimensions, cosine distance):

- Related questions (English, French, Afrikaans): best match 0.164 to 0.272, and the
  correct passage ranked first in every case.
- Unrelated questions (VPN error, relocation allowance, capital of France, baking bread):
  closest passage 0.417 or more.

Cut-off set to **0.35** (`DEFAULT_MAX_DISTANCE` in `server/database.js`), midway between the
two groups. Re-check it as the library grows; Gemini's own "answerable" check remains as a
second safeguard.
