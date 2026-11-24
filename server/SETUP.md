# Source library setup

The application stores source metadata and searchable text in Neon Postgres.
Original PDF files are stored in a private Neon Object Storage bucket. The Express
server handles ingestion and retrieval; the mobile app receives only public service
URLs and short-lived Neon Auth JWTs.

## 1. Configure Neon Auth

1. Enable Neon Auth for the project branch and use the Better Auth provider.
2. Enable email and password sign-in and enable public sign-up so users can
   register from the app. Leave email verification off; new users are signed in
   immediately after registering.
3. Enable the JWT plugin for the auth instance. The API verifies bearer tokens using
   the branch JWKS endpoint at `<NEON_AUTH_URL>/.well-known/jwks.json`.
4. Copy the branch's Neon Auth base URL. Set it as `NEON_AUTH_URL` for the server and
   `EXPO_PUBLIC_NEON_AUTH_URL` for the mobile app. The mobile value is a public URL,
   not a credential.
5. Add the web app's origin to Neon Auth's trusted origins. For local web development,
   enable localhost access only on a development branch.

The managed Neon Auth integration and the app's custom Expo/SecureStore client must
be verified against the actual project and a device before production use.

## 2. Create the database schema

Run `schema.sql` against the application's Neon database using the database owner or
another role allowed to create tables and indexes. It creates:

- `knowledge_sources` for source metadata and object keys
- `knowledge_source_chunks` for extracted text, locations, and full-text search
- `curator_allowlist` for the user IDs permitted to manage shared sources
- `user_profiles` for each registered user's display name and preferred language,
  keyed by Neon Auth user ID

Neon Auth stores account names, emails, and passwords in its own `neon_auth` schema.

The API makes a source available to search after extraction and all chunk inserts
complete successfully.

## 3. Create private object storage

Create a private Neon Object Storage bucket for the branch. Configure the server
environment with the bucket's S3-compatible endpoint, region, access key, secret,
and bucket name:

```text
AWS_ENDPOINT_URL_S3
AWS_REGION
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
SOURCES_BUCKET
```

Also configure `DATABASE_URL` and `NEON_AUTH_URL` on the server. Keep these values in
the server's secret manager or local untracked environment file. Do not prefix
server-only values with `EXPO_PUBLIC_`, commit them, or send them in chat.
After applying the schema, use a dedicated database role with only the required
read/write access to these tables for the API runtime; reserve the database owner
role for schema changes.

## 4. Grant curator access

Add the Neon Auth user IDs for approved content curators to the allowlist. For
example, run the following for each curator in the `public` schema:

```sql
INSERT INTO curator_allowlist (auth_user_id)
VALUES ('<verified-neon-auth-user-id>')
ON CONFLICT (auth_user_id) DO NOTHING;
```

All signed-in users can list and search sources. Only allowlisted users can ingest,
rename, or delete them. The allowlist is managed on the server database and is not
exposed through the app.

## 5. Configure and run the app

Copy `mobile/.env.example` to the mobile environment file and set:

- `EXPO_PUBLIC_API_URL` to the Express API base URL ending in `/api`
- `EXPO_PUBLIC_NEON_AUTH_URL` to the Neon Auth base URL

For Android emulators, use `http://10.0.2.2:<port>/api` for the API URL. For a
physical device, use a reachable HTTPS URL or the development computer's LAN IP.
Configure the server's `CORS_ORIGINS` with the exact web app origins when using web.

Install dependencies from the repository root, then start the server from `server`
and the Expo app from `mobile`. The server binds to `PORT` (default `3000`).

## 6. Enable written answers (Google Gemini)

1. Create an API key in Google AI Studio.
2. Set `GEMINI_API_KEY` in the server environment (Render's environment variables in
   production, the untracked `server/.env` locally). Never put it in the mobile app,
   `eas.json`, or any `EXPO_PUBLIC_` variable.
3. Optionally set `GEMINI_MODEL`; the default is `gemini-3.5-flash-lite`.

Without a key the server returns source excerpts only. On Google's free tier, request
content is used to improve Google's products (see Google's Gemini API pricing and terms);
the paid tier does not use it. Free-tier rate limits apply; when a request fails or is
rate-limited, the server returns the matching excerpts instead.

## 7. Enable meaning-based search (Gemini embeddings + pgvector)

1. Apply the updated `schema.sql` to the database **before** deploying this server
   version. It enables Neon's `vector` extension, adds a nullable 768-number `embedding`
   column to `knowledge_source_chunks`, and creates an HNSW cosine index. Existing data
   is not changed.
2. Optionally set `GEMINI_EMBEDDING_MODEL`; the default is `gemini-embedding-2`.
3. From `server`, run `pnpm backfill:embeddings` once to embed passages added before this
   change. Run it again any time sources were saved while the embedding service was
   unavailable; it only processes passages without an embedding.

Each passage is embedded once when its source is added, and each question once when it
is asked. If an embedding call fails, the source is still saved and questions fall back
to keyword search.

## Processing behavior

- Public HTTP/HTTPS webpages and direct PDF links are accepted. Private and local
  network destinations are rejected.
- PDF files are limited to 10 MB. Text-based PDFs are supported; scanned PDFs are
  not OCR-processed.
- Pasted text requires a title and is limited to 100,000 characters.
- Sources are split into 800-word chunks with 120-word overlap. Each passage is embedded
  together with its source title and section heading. Ask finds up to eight passages
  closest in meaning to the question (within a distance cut-off); passages that have no
  embedding yet are found by keyword search instead. Results include source title, URL
  or reference, and page or section.
- When Gemini is enabled and passages are found, Gemini writes a short answer from those
  passages only, in the app language, and lists the passages it used. The server keeps
  only citations for passages it sent. If the passages do not answer the question, the
  response routes to specialist review. When no passage matches, Gemini is not called.
- Eligibility questions are never decided: an answer may describe written criteria, and
  the eligibility warning and human review always remain.
- Questions and passages are sent with `store: false`, so Gemini does not keep the
  interaction for later retrieval.
