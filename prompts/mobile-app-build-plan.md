# Mobile assistant first-build plan

## Goal

Implement the first mobile assistant slice from the user's master prompt using Expo,
React Native, NativeWind, and the existing Node.js/Express API. Treat Figma journeys as
interaction references, not as an approved source of policy or troubleshooting facts.

## Current state and constraints

- The mobile app uses Expo SDK 58, React Native 0.88, and Expo Router.
- The server already has Express, a health route, an assistant route, and request tests.
- There is no approved knowledge base, answer-generation service, or live-support
  integration.
- Therefore, this slice must not generate factual answers, invent citations, or claim a
  handoff has been received. It returns explicit human-review metadata instead.
- Response locales are English (`en`), Afrikaans (`afr`), Spanish (`es`), and French
  (`fr`), selected from the device locale. Unsupported device locales use English.

## Implementation

1. Use the user's `language_detected` / `intent_category` response schema in both client
   and server, with strict runtime validation in the client.
2. Keep the Assistant conversation as the Ask destination. Add the Figma-referenced
   bottom tabs for Ask, Sources, Support, and Workspace, with simple placeholder states
   for destinations that do not yet have connected content. Use NativeWind tokens, safe
   areas, a virtualized message list, accessible composer controls, and clear citation
   and handoff containers.
3. Use a localized, safe fallback. Eligibility questions must never be decided and route
   to `eligibility_review`; missing approved knowledge routes to `content_curators`.
   Both remain explicit that live routing is not connected.
4. Pass the Expo device locale to the API. Do not expose secrets; document only the
   public API base URL.
5. Add focused tests for validation, locale behavior, eligibility routing, and
   knowledge-base gaps.

## Approved files

- `MOBILE-DESIGN.md` — create the App Read, Nav Read, dials, and mobile constraints.
- `prompts/mobile-app-build-plan.md` — update this plan to the selected contract.
- `mobile/app.json` — configure supported locales.
- `mobile/app/_layout.tsx` — load the NativeWind global stylesheet.
- `mobile/app/(tabs)/index.tsx` — implement the localized NativeWind chat UI.
- `mobile/lib/assistant.ts` — update request and response types and validation.
- `mobile/package.json` and `mobile/package-lock.json` — add SDK-compatible
  NativeWind, Tailwind, and Expo Localization dependencies.
- `mobile/babel.config.js`, `mobile/metro.config.js`, `mobile/tailwind.config.js`,
  `mobile/global.css`, and `mobile/nativewind-env.d.ts` — configure NativeWind.
- `mobile/.env.example` already documents the public API URL and will remain unchanged.
- `server/index.js` — pass the requested locale into the response builder.
- `server/assistant.js` — validate input and return localized safe fallback payloads.
- `server/test/assistant.test.js` — test the new response contract and fallback paths.
- `prompts/figma-navigation-plan.md` — record the approved navigation implementation plan.
- `mobile/app/(tabs)/_layout.tsx` — configure the visible four-item bottom tab bar.
- `mobile/app/(tabs)/two.tsx` — move and repurpose the scaffold route as Sources.
- `mobile/app/(tabs)/support.tsx` and `mobile/app/(tabs)/workspace.tsx` — add placeholder
  destinations for the other Figma tabs.

The approved navigation work is limited to the files listed above. For other tasks, do
not edit unlisted files; if an implementation requires another file or a materially
different approach, stop and ask for approval first.

## Validation

Run the backend tests, Expo lint if available, TypeScript checking, and a web export.
Report device-only checks that cannot be verified without a simulator or device.
