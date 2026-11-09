# Source ingestion and retrieval plan

## Goal

Connect the Sources and Ask screens to a shared, authenticated knowledge library.
Staff can view sources; only authorized curators can add, rename, and delete them.

## Approved behavior

- Accept a public webpage URL, a direct PDF URL, a local text-based PDF up to 10 MB,
  or a pasted paragraph with a required title.
- Fetch and process sources synchronously. A source is reported as successful only
  after text extraction, chunking, and indexing complete.
- Derive webpage titles from the page and PDF titles from the filename. Curators can
  edit a source title later.
- Store private PDF originals in Neon Object Storage. Store source metadata,
  extracted text, and chunks in Neon Postgres.
- Split extracted text into 800-word chunks with 120-word overlap.
- Retrieve up to four excerpts using PostgreSQL full-text/keyword search. Display
  the retrieved excerpts with source citations in Ask. Do not generate summaries.
- Preserve safe human-review behavior when no source matches and preserve the
  eligibility-review rule.
- Use Neon Auth email/password sign-in for pre-provisioned accounts, with no
  sign-up screen. The Express API verifies Neon JWTs. The database-backed curator
  allowlist uses verified Neon Auth user IDs.
- Keep server credentials in server-side configuration. Include a setup checklist
  without asking the user to share secret values in chat.
- Protect public URL ingestion against private-network/localhost destinations,
  unsafe redirects, oversized responses, and unsupported content types.

## Implementation sequence

1. Add server database, auth, source-ingestion, and schema modules.
2. Add authenticated source APIs for listing, ingestion, title updates, and deletion.
3. Add retrieval to the existing assistant API and include excerpt text in citations.
4. Add the Neon Auth sign-in/session flow and require authentication for the app.
5. Connect Sources upload/list/rename/delete UI and Ask excerpt rendering.
6. Document Neon Auth, database, storage, environment setup, and curator allowlisting.
7. Add focused ingestion, authorization, retrieval, and citation tests, then run the
   server tests, mobile lint/type-check, and web export.

## Files in scope

Create:

- `server/auth.js`
- `server/database.js`
- `server/source-ingestion.js`
- `server/schema.sql`
- `server/SETUP.md`
- `server/test/source-ingestion.test.js`
- `mobile/app/(auth)/_layout.tsx`
- `mobile/app/(auth)/sign-in.tsx`
- `mobile/lib/auth.ts`
- `mobile/lib/sources.ts`

Edit:

- `server/index.js`
- `server/assistant.js`
- `server/test/assistant.test.js`
- `server/package.json`
- `server/pnpm-lock.yaml`
- `mobile/app/_layout.tsx`
- `mobile/app/(tabs)/sources.tsx`
- `mobile/app/(tabs)/index.tsx`
- `mobile/lib/assistant.ts`
- `mobile/.env.example`
- `mobile/package.json`
- `mobile/pnpm-lock.yaml`
- `prompts/source-ingestion-plan.md`

No files are moved or deleted.
