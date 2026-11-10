# Registration and user profile plan

Status: approved 2026-11-10.

## Goal

Let people without an account register from the mobile app. Accounts are created in
Neon Auth. Each new user also gets a row in a new `user_profiles` table.

## Decisions

- Anyone with an email address can register (Neon Auth public sign-up enabled).
- No email verification. The user is signed in right after registering.
- Profile fields: display name and preferred language (`en`, `afr`, `es`, `fr`,
  matching the app's supported locales). `en` is preselected.
- The user runs the SQL in the Neon SQL Editor. The agent does not connect to the
  database.

## Flow

1. Sign-in screen links to a new Register screen.
2. Register calls Neon Auth `signUp.email({ name, email, password })`.
3. The app calls `POST /api/profile` with the new session token to save the
   display name and preferred language.
4. The app refreshes the session and opens the main tabs.

The profile save is an upsert, so retrying is safe if it fails.

## Files

- `prompts/registration-plan.md` (new)
- `mobile/app/(auth)/register.tsx` (new)
- `mobile/app/(auth)/sign-in.tsx` (link to Register)
- `mobile/lib/auth.ts` (`signUp`)
- `mobile/lib/profile.ts` (new, `saveProfile`)
- `server/schema.sql` (`user_profiles` table)
- `server/database.js` (`upsertProfile`)
- `server/index.js` (`POST /api/profile`)
- `server/test/profile.test.js` (new)
- `server/SETUP.md` (enable sign-up, list new table)

## Table

```sql
CREATE TABLE IF NOT EXISTS user_profiles (
  auth_user_id text PRIMARY KEY,
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 100),
  preferred_language text NOT NULL CHECK (preferred_language IN ('en', 'afr', 'es', 'fr')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

## Checks

- `node --test` in `server/`
- `npx tsc --noEmit` and `npx expo lint` in `mobile/`
- Manual: register, confirm the `user_profiles` row, sign out, sign back in.
