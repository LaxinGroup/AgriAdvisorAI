# Gemini answers plan (Part 1)

## Goal

The Ask screen returns a short written answer, in the app language, generated only from
the approved source passages the server finds, with citations. Support messaging and the
admin inbox are Part 2.

## Decisions

- Provider: Google Gemini API, package `@google/genai`, `interactions.create` call
  (checked against Google's docs on 2026-11-19).
- Model: `gemini-3.5-flash-lite` (Stable), set through `GEMINI_MODEL`.
- Tier: free. Google's pricing page states free-tier content is used to improve their
  products; the owner accepted this.
- Response format: keep the current API fields. The answer goes in
  `conversational_response`. Aligning with the AGENTS.md schema is a separate step.

## Behaviour

1. Search approved sources for up to 4 passages. The search ranks passages by how many
   question words they contain (it previously required every word, so full-sentence
   questions often matched nothing).
2. No passages: return the existing "cannot answer, specialist review" response. Gemini is
   not called.
3. Passages found: send the question, the passages, and strict instructions to Gemini:
   answer only from the passages, in the user's language, never decide eligibility.
   Gemini returns JSON: `answer`, `cited_match_ids`, `answerable`.
4. The server keeps only citations whose IDs were in the passages sent. If `answerable`
   is false or no valid citation remains, it returns the specialist-review response with
   the passages as partial context.
5. Eligibility questions keep `eligibility_check`, `requires_human: true`, and the
   eligibility warning; the answer may describe written criteria only.
6. Gemini error, timeout, or rate limit: return today's excerpt response.

## Approved files

- `server/gemini.js` (new): Gemini call, instructions, JSON schema, time limit.
- `server/assistant.js`: use the answer, validate citations, eligibility, fallbacks.
- `server/index.js`: connect the answer step to `POST /api/assistant`.
- `server/database.js`: search ranks by matching words instead of requiring all words.
- `server/package.json`, `server/pnpm-lock.yaml`: add `@google/genai`.
- `server/.env.example`: `GEMINI_API_KEY`, `GEMINI_MODEL`.
- `server/test/assistant.test.js`: tests with a fake Gemini (no real API calls).
- `server/SETUP.md`: Gemini key setup.
- `mobile/lib/translations.ts`: update the Ask disclaimer in all four languages.
- `prompts/gemini-answers-plan.md`: this plan.

The API key lives only in the server environment (Render), never in the app or `eas.json`.
