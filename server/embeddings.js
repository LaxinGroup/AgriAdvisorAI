import { GoogleGenAI } from '@google/genai';

export const EMBEDDING_DIMENSIONS = 768;
const DEFAULT_EMBEDDING_MODEL = 'gemini-embedding-2';
const REQUEST_TIMEOUT_MS = 20_000;
// Google's docs do not state a per-request limit, so passages are sent in small groups.
const BATCH_SIZE = 8;

// Google's retrieval format for gemini-embedding-2 (the model has no task_type field).
export function formatPassageForEmbedding({ title, location, content }) {
  const text = location ? `${location}\n${content}` : content;
  return `title: ${title?.trim() || 'none'} | text: ${text}`;
}

export function formatQuestionForEmbedding(question) {
  return `task: question answering | query: ${question}`;
}

// pgvector accepts vectors written as '[0.1,0.2,...]'.
export function toVectorLiteral(values) {
  return `[${values.join(',')}]`;
}

// Returns { embedPassages, embedQuestion }, or null when no API key is configured.
export function createGeminiEmbedder({
  apiKey = process.env.GEMINI_API_KEY,
  model = process.env.GEMINI_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL,
  client,
} = {}) {
  if (!client && !apiKey) return null;
  const ai = client ?? new GoogleGenAI({ apiKey });

  async function embedTexts(texts) {
    const vectors = [];
    for (let start = 0; start < texts.length; start += BATCH_SIZE) {
      const batch = texts.slice(start, start + BATCH_SIZE);
      const response = await ai.models.embedContent({
        model,
        // One Content object per text, so each text gets its own embedding
        // (plain strings would be merged into a single embedding).
        contents: batch.map((text) => ({ parts: [{ text }] })),
        config: {
          outputDimensionality: EMBEDDING_DIMENSIONS,
          abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      });

      const values = response.embeddings?.map((embedding) => embedding.values) ?? [];
      if (
        values.length !== batch.length ||
        values.some((vector) => !Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS)
      ) {
        throw new Error('The embedding service returned an unexpected result.');
      }
      vectors.push(...values);
    }
    return vectors;
  }

  return {
    embedPassages: (passages) => embedTexts(passages.map(formatPassageForEmbedding)),
    embedQuestion: async (question) => (await embedTexts([formatQuestionForEmbedding(question)]))[0],
  };
}
