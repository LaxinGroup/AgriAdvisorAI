# Mobile design direction

## App Read

A secure workplace knowledge assistant for employees, content curators, and support
staff. The interface is calm, neutral, and task-focused, using Expo Router,
React Native, and NativeWind. iOS and Android are first-class; web is best-effort.
The posture is unified-brand with native navigation chrome.

## Nav Read

- Four primary destinations in the persistent bottom tab bar: Ask, Sources, Support,
  and Workspace.
- Ask is the existing Assistant conversation. Sources, Support, and Workspace have
  placeholder destinations until approved content or integrations are connected.
- No additional sheets or modals.
- Entry point: Ask.
- Deep links: none added in this slice.
- Android back: Expo Router default behavior.

## Dials

- `DESIGN_EXPRESSION: 4` - branded content, restrained native-feeling chrome.
- `MOTION_INTENSITY: 2` - native transitions only; no decorative motion.
- `VISUAL_DENSITY: 4` - readable conversation with clear citation and handoff areas.

## Product constraints

- The API returns a safe human-review fallback until an approved knowledge base and
  live-support integration are connected.
- Supported response locales in this slice: English (`en`), Afrikaans (`afr`), Spanish
  (`es`), and French (`fr`). The device locale is used; unsupported locales fall back
  to English.
- No citation is displayed unless it is returned by a future approved source.
- Network failure is shown inline with a retry action; conversation content is not cached.

## Visual tokens

Use the neutral slate ramp and muted green accent configured in Tailwind. Both light
and dark color schemes are supported. Keep the 20-point content gutter, 12/16-point
surface radii, and 44-point minimum interactive targets consistent across screens.
