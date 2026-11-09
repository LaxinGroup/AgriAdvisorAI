# Source library setup

The application stores source metadata and searchable text in Neon Postgres.
Original PDF files are stored in a private Neon Object Storage bucket. The Express
server handles ingestion and retrieval; the mobile app receives only public service
URLs and short-lived Neon Auth JWTs.

## 1. Configure Neon Auth

1. Enable Neon Auth for the project branch and use the Better Auth provider.
2. Enable email and password sign-in and disable public sign-up. Provision staff
   accounts through the Neon Auth user directory.
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

## Processing behavior

- Public HTTP/HTTPS webpages and direct PDF links are accepted. Private and local
  network destinations are rejected.
- PDF files are limited to 10 MB. Text-based PDFs are supported; scanned PDFs are
  not OCR-processed.
- Pasted text requires a title and is limited to 100,000 characters.
- Sources are split into 800-word chunks with 120-word overlap. Ask returns up to
  four matching excerpts with source title, URL or reference, and page or section.
- No AI-generated source summaries are produced.
