# AGENTS.md

## Purpose

This is the root routing file for coding agents in `SolderDemon Link`.
Use it to choose the correct subtree first. Do not read the whole repo by default.

## Project Shape

`SolderDemon Link` is a `Tauri v2 + React + TypeScript` desktop app.

- `src/` = frontend UI, i18n, state, Tauri command/event usage
- `src-tauri/` = Rust backend, serial communication, Kermit transfer, app packaging

## Routing Rules

- If the task is about UI, interactions, tabs, dropdowns, text, or translations:
  open `src/AGENTS.md`
- If the task is about serial ports, Tauri commands, Rust behavior, bundling, or desktop runtime:
  open `src-tauri/AGENTS.md`
- If the task is cross-layer firmware transfer:
  read in this order:
  1. `src/AGENTS.md`
  2. `src-tauri/AGENTS.md`
  3. `src-tauri/src/AGENTS.md`

## Root-Level Files Worth Reading

- `package.json` - npm scripts and frontend dependencies
- `vite.config.ts` - Vite config
- `tsconfig.json` and `tsconfig.node.json` - TypeScript config
- `src-tauri/Cargo.toml` - Rust dependencies
- `src-tauri/tauri.conf.json` - Tauri app config

Read these only when the task is about build, config, dependency, or packaging behavior.

## Do Not Scan By Default

- `node_modules/`
- `dist/`
- `src-tauri/icons/`
- `src-tauri/target/`
- `src-tauri/gen/`

These are dependencies, generated output, or packaging assets, not primary logic.

## Responsibility Boundaries

- Frontend invokes commands and reacts to emitted events. It does not implement the serial protocol itself.
- Rust backend owns serial runtime and transfer protocol behavior. It does not own UI state.
- Kermit protocol logic should stay isolated in Rust protocol files, not spread across UI code.

## Fast Decision Table

- UI bug or layout change -> `src/AGENTS.md`
- Translation or text change -> `src/AGENTS.md`
- Serial connection issue -> `src-tauri/AGENTS.md`
- Firmware send issue -> `src/AGENTS.md`, then `src-tauri/AGENTS.md`, then `src-tauri/src/AGENTS.md`
- Build or bundle issue -> root config files + `src-tauri/AGENTS.md`
