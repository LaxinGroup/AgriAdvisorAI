# Figma navigation implementation plan

## Goal

Add the four-item bottom navigation shown in `figma-screens-review.pdf` to the Expo
assistant app: Ask, Sources, Support, and Workspace.

## Scope

- Keep the existing Assistant conversation as the Ask tab.
- Use Expo Router's existing tab navigator with visible labels and cross-platform icons.
- Match the reference's white navigation surface, green active state, and muted inactive
  state while preserving dark-mode contrast.
- Add simple placeholder destinations for Sources, Support, and Workspace. Do not invent
  policy content or imply that live support is connected.
- Leave API, server, dependencies, and Assistant conversation behavior unchanged.

## Files

- Create this plan.
- Update `MOBILE-DESIGN.md` and `prompts/mobile-app-build-plan.md` to reflect the new
  navigation.
- Update `mobile/app/(tabs)/_layout.tsx`.
- Move `mobile/app/(tabs)/two.tsx` to `mobile/app/(tabs)/sources.tsx` and replace the
  scaffold content with the Sources placeholder.
- Create `mobile/app/(tabs)/support.tsx` and `mobile/app/(tabs)/workspace.tsx`.

## Validation

- Run Expo lint and TypeScript checking in `mobile/`.
- Verify that the web app bundles with all four routes.
- Report platform checks that require a simulator or physical device.
