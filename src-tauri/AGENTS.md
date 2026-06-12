# AGENTS.md

## Scope

This file covers the Rust and Tauri side in `src-tauri/`.
Read this for serial runtime, Tauri commands, native integration, build, and packaging work.

## Main Areas

- `src/` - Rust application code
- `Cargo.toml` - Rust dependencies
- `tauri.conf.json` - Tauri app and bundle config
- `capabilities/default.json` - Tauri capabilities
- `build.rs` - Tauri build hook

## Routing Inside `src-tauri/`

- If the task is about runtime behavior, commands, serial IO, or firmware transfer:
  open `src/AGENTS.md`
- If the task is about Rust dependencies or feature flags:
  open `Cargo.toml`
- If the task is about window config, bundle targets, app identity, or dev/build hooks:
  open `tauri.conf.json`
- If the task is about permissions/capabilities:
  open `capabilities/default.json`

## Do Not Scan By Default

- `target/` - build output
- `gen/` - generated files
- `icons/` - packaging assets
- `Cargo.lock` - only inspect when dependency resolution matters

## Boundaries

- Keep protocol logic in Rust code, not in Tauri config.
- Keep packaging config changes out of runtime files unless the task truly crosses both concerns.
- Windows device notification logic belongs in Rust runtime code, not frontend polling logic.

## Common Task Routing

- serial port enumeration issue -> `src/AGENTS.md`
- open/close/write behavior -> `src/AGENTS.md`
- firmware send issue -> `src/AGENTS.md`
- bundle/icon/window issue -> `tauri.conf.json`
- dependency/build failure -> `Cargo.toml`, then relevant runtime file
