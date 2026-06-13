# AGENTS.md

## Scope

This file covers the frontend in `src/`.
Read this only for UI, interaction, i18n, and frontend-to-Tauri bridge work.

## Main Files

- `main.tsx` - React entrypoint
- `App.tsx` - main screen and almost all current frontend orchestration
- `App.css` - global app styling
- `Dropdown.tsx` - reusable local dropdown
- `i18n.ts` - i18next setup, language resolution, persistence
- `locales/en.json` and `locales/uk.json` - UI text

## What Lives Where

### `App.tsx`

This is the primary file for frontend behavior.
It owns:

- tab navigation: `session | transfer | settings`
- port and baud selection
- connect/disconnect actions
- terminal log rendering
- serial input send action
- drag-and-drop and file picker for `.bin`
- Tauri event listeners for serial and Kermit events
- transfer progress and transfer status messages

For most frontend tasks, start here before reading anything else.

### `Dropdown.tsx`

Use this file for:

- dropdown interaction bugs
- accessibility behavior for the custom select
- shared dropdown styling hooks and option rendering

Do not modify `App.tsx` for dropdown internals that belong here.

### `i18n.ts` and `locales/*.json`

Use these files for:

- new strings
- language switching behavior
- persistence of selected language
- fallback language rules

Do not hardcode user-facing strings in components if they belong in translations.

## Frontend Read Order By Task

- UI layout/styling: `App.tsx` -> `App.css`
- terminal/session behavior: `App.tsx`
- transfer screen behavior: `App.tsx`
- dropdown behavior: `Dropdown.tsx`, then `App.tsx` if needed
- language/text issues: `i18n.ts` -> `locales/*.json` -> consuming component

## Frontend Boundaries

- Do not implement serial protocol details in frontend code.
- Do not duplicate backend state machines in React.
- Use Tauri `invoke` for commands and event listeners for backend output.

## Token Saving Rules

- Ignore `assets/` unless the task is explicitly about images or static frontend assets.
- For nearly all frontend work, only `App.tsx`, `App.css`, `Dropdown.tsx`, `i18n.ts`, and `locales/*.json` are relevant.
- If a bug appears to be caused by command payloads or emitted events, stop and move to `../src-tauri/AGENTS.md`.
