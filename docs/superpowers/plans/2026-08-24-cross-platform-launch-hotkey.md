# AISpur Cross-Platform Launch and Hotkey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every supported app entry point reopen AISpur settings, make shortcut capture and rebinding transactional, and verify Windows compatibility and the complete user flow.

**Architecture:** Keep Tauri v2 and the Config v3 shape. Add one Rust settings-presentation helper used by tray, command, and macOS Reopen events. Keep shortcut parsing pure in TypeScript, validate again in Rust, and rebind the primary plus optional Shift companion as an atomic set with rollback.

**Tech Stack:** Rust 2024, Tauri 2.11, `tauri-plugin-global-shortcut` 2.3 / `global-hotkey` parser, TypeScript 5, React, Vitest, cargo test/clippy/fmt.

---

## File Map

- Modify `src-tauri/src/main.rs`: expose settings presentation helper to the run-event loop and route macOS Dock Reopen to it.
- Modify `src-tauri/src/tray.rs`: call the shared helper for tray left-click and menu events.
- Modify `src-tauri/src/commands.rs`: make `open_settings` use the helper and make `save_config` call transactional shortcut rebinding before persisting.
- Modify `src-tauri/src/shortcut.rs`: add canonical validation, companion-set probing, transactional registration, rollback helpers, and pure tests.
- Modify `src/settings/hotkey.ts`: parse `KeyboardEvent.code`, normalize digits/numpad/function/navigation keys, and keep canonical modifier order.
- Modify `src/__tests__/hotkey.test.ts`: add numeric, numpad, navigation, punctuation, and unknown-code tests.
- Modify `src/__tests__/settings-panels.test.tsx`: add recorder tests for `code`-based numeric combinations and unsupported keys.
- Modify `src-tauri/tests/trigger_chain.rs`: add pure shortcut set/alternative coverage if the helper API is public from the library.
- Create `docs/product-audit/2026-08-24-flow-audit.md`: record evidence, platform limits, and P0/P1/P2 product improvements.

## Task 1: Add failing tests for canonical TypeScript capture

**Files:**
- Modify: `src/__tests__/hotkey.test.ts`

- [ ] **Step 1: Add failing tests for primary-keyboard digits and numpad digits.**

```ts
it('captures Cmd/Ctrl+Shift+Digit5 from event.code', () => {
  expect(
    accelFromEvent(ev('5', { ctrlKey: true, shiftKey: true, code: 'Digit5' }))
  ).toBe('CommandOrControl+Shift+5');
});

it('normalizes numpad digits to their numeric accelerator token', () => {
  expect(accelFromEvent(ev('5', { metaKey: true, code: 'Numpad5' }))).toBe(
    'CommandOrControl+5'
  );
});
```

Update the test helper input type to include optional `code` so the test describes the browser boundary precisely.

- [ ] **Step 2: Add failing tests for named navigation keys and unknown codes.**

```ts
it('captures modified navigation keys using event.code', () => {
  expect(accelFromEvent(ev('ArrowUp', { altKey: true, code: 'ArrowUp' }))).toBe('Alt+ArrowUp');
  expect(accelFromEvent(ev('Enter', { ctrlKey: true, code: 'Enter' }))).toBe(
    'CommandOrControl+Enter'
  );
});

it('keeps recording for an unsupported key code', () => {
  expect(accelFromEvent(ev('Unidentified', { ctrlKey: true, code: 'UnknownKey' }))).toBeNull();
});
```

- [ ] **Step 3: Run the focused test and verify it fails.**

Run: `pnpm exec vitest run src/__tests__/hotkey.test.ts`

Expected: the new digit/numpad or `code` assertions fail because the current function has no `code` parameter and treats only `event.key` as the final token.

## Task 2: Implement canonical TypeScript hotkey parsing

**Files:**
- Modify: `src/settings/hotkey.ts:8-58`
- Modify: `src/__tests__/hotkey.test.ts`

- [ ] **Step 1: Extend the event shape and define explicit code maps.**

Add `code?: string` to the event parameter. Define pure maps for `Digit0..Digit9`, `Numpad0..Numpad9`, `KeyA..KeyZ`, and stable named codes. Keep `MODIFIER_KEYS` behavior unchanged.

- [ ] **Step 2: Implement code-first normalization and preserve canonical ordering.**

Use this behavior:

```ts
function normalizeCode(code: string | undefined, key: string): string | null {
  if (code?.startsWith('Key') && code.length === 4) return code.slice(3).toUpperCase();
  if (code?.startsWith('Digit') && /^Digit[0-9]$/.test(code)) return code.slice(5);
  if (code?.startsWith('Numpad') && /^Numpad[0-9]$/.test(code)) return code.slice(6);
  if (code && /^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  if (code && STABLE_CODES.has(code)) return STABLE_CODES.get(code) ?? null;
  return normalizeKey(key);
}
```

Do not accept a bare key: require at least one modifier. Keep the output order `CommandOrControl`, `Alt`, `Shift`, then the key.

- [ ] **Step 3: Update existing test calls and run the focused suite.**

Run: `pnpm exec vitest run src/__tests__/hotkey.test.ts`

Expected: all existing and new hotkey tests pass.

- [ ] **Step 4: Commit the focused TypeScript change.**

```bash
git add src/settings/hotkey.ts src/__tests__/hotkey.test.ts
git commit -m "feat: support canonical numeric hotkey capture"
```

## Task 3: Add failing tests for transactional Rust shortcut sets

**Files:**
- Modify: `src-tauri/src/shortcut.rs`
- Modify: `src-tauri/tests/trigger_chain.rs` when pure helpers are exposed

- [ ] **Step 1: Add pure tests for companion sets and canonical validation.**

Cover:

```rust
assert_eq!(registered_set("CommandOrControl+Shift+5"), vec!["CommandOrControl+Shift+5"]);
assert_eq!(registered_set("CommandOrControl+5"), vec![
    "CommandOrControl+5",
    "CommandOrControl+Shift+5",
]);
assert!(validate_hotkey("CommandOrControl+Shift+5"));
assert!(!validate_hotkey("CommandOrControl+Shift"));
assert!(!validate_hotkey("CommandOrControl+Shift+Key5"));
```

- [ ] **Step 2: Add pure tests for numeric alternative generation and de-duplication.**

```rust
assert_eq!(generate_alternatives("CommandOrControl+Shift+5"), [
    "CommandOrControl+Shift+6".to_string(),
    "CommandOrControl+Shift+4".to_string(),
]);
assert_ne!(generate_alternatives("CommandOrControl+Shift+0")[0],
           generate_alternatives("CommandOrControl+Shift+0")[1]);
```

- [ ] **Step 3: Run Rust shortcut tests and verify the new assertions fail.**

Run: `cargo test shortcut --lib`

Expected: failure for the new set/validation assertions before implementation.

## Task 4: Implement Rust canonical validation and shortcut-set helpers

**Files:**
- Modify: `src-tauri/src/shortcut.rs`

- [ ] **Step 1: Add `registered_set` and strict token validation.**

Create a pure `pub fn registered_set(hotkey: &str) -> Vec<String>` that returns the primary and, when no Shift modifier is present, the Shift companion. Make `validate_hotkey` reject empty tokens, duplicate main keys, modifier-only values, unknown keys, and bare keys. Validate by parsing with `global_hotkey::hotkey::HotKey` (or the plugin’s public `Shortcut` alias) rather than duplicating the platform key list.

- [ ] **Step 2: Make alternatives preserve the full prefix and produce distinct valid suggestions.**

Keep letter/F-key/digit adjacency. For `0` and `9`, choose the single in-range neighbor in the first slot and the other valid neighbor in the second slot; remove duplicates before returning suggestions at the conflict boundary.

- [ ] **Step 3: Run shortcut unit tests.**

Run: `cargo test shortcut --lib`

Expected: all shortcut tests pass, including the new companion and numeric coverage.

## Task 5: Add failing tests and implement transactional registration

**Files:**
- Modify: `src-tauri/src/shortcut.rs`
- Modify: `src-tauri/src/commands.rs`

- [ ] **Step 1: Define a registration abstraction for testable rollback.**

Add a small internal trait with `register(&str)`, `unregister(&str)`, and `is_registered(&str)` operations. Keep the existing `AppHandle` implementation as an adapter. Add an in-memory fake in `#[cfg(test)]` that can fail a selected token and records registered tokens.

- [ ] **Step 2: Write failing fake-backed tests.**

Cover these exact cases:

1. New primary and companion both register, then old set is removed.
2. Companion registration fails, new primary is rolled back, old set remains.
3. Persistence is not called until the complete new set is registered (test the pure rebind result or put persistence after the helper in `commands.rs`).

- [ ] **Step 3: Implement `rebind` with commit/rollback ordering.**

The helper must:

```text
old_set = registered_set(old)
new_set = registered_set(new)
register every new member not in old_set
on failure: unregister newly registered members; return error
persist config
on persistence failure: unregister new members; re-register old members; return error
after persistence: unregister old members not in new_set
```

Never call `unregister_all` during a normal rebind. Keep primary registration intact until new registration succeeds.

- [ ] **Step 4: Update `commands::save_config` and `register_hotkey`.**

For a changed hotkey, call the transactional helper before replacing the in-memory `Config`. Save the file only at the transaction commit point. If the hotkey is unchanged, retain the existing config save path without touching registrations.

- [ ] **Step 5: Run Rust tests and commit.**

Run: `cargo test shortcut --lib && cargo test --test trigger_chain`

Expected: all unit and integration tests pass.

```bash
git add src-tauri/src/shortcut.rs src-tauri/src/commands.rs src-tauri/tests/trigger_chain.rs
git commit -m "fix: rebind global shortcuts transactionally"
```

## Task 6: Unify settings-window presentation and macOS Dock Reopen

**Files:**
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/src/tray.rs`
- Modify: `src-tauri/src/commands.rs`

- [ ] **Step 1: Add a shared `present_settings_window` helper.**

Put the helper in `commands.rs` as a non-command `pub(crate)` function so tray and main can use it. It must get `settings`, set macOS regular activation policy under `#[cfg(target_os = "macos")]`, then show, unminimize, and focus with errors propagated.

- [ ] **Step 2: Route every settings entry point through the helper.**

Replace direct `show/unminimize/set_focus` calls in tray menu, tray left-click, and `open_settings`. Keep `switch-tab` emission after the helper succeeds.

- [ ] **Step 3: Handle `RunEvent::Reopen` on macOS.**

Replace the terminal `.run(...).expect(...)` with a closure that matches `tauri::RunEvent::Reopen { .. }` under `#[cfg(target_os = "macos")]` and calls the helper. Leave all other events untouched. Ensure the callback does not call `exit` or create a second window.

- [ ] **Step 4: Add pure/testable presentation coverage where possible.**

Add a debug backdoor assertion or unit-level helper test that calls the same path used by `__test_click_tray` and verifies the settings window is made visible. Keep platform API calls behind cfg so the test compiles on Windows.

- [ ] **Step 5: Run formatting and Rust tests.**

Run: `cargo fmt --check && cargo test`

Expected: no format differences and all Rust tests pass.

## Task 7: Update recorder UI tests and behavior contract

**Files:**
- Modify: `src/__tests__/settings-panels.test.tsx`
- Modify: `src/settings/components/HotkeyRecorder.tsx` only if event handling needs a type adjustment

- [ ] **Step 1: Add a failing component test for `Cmd/Ctrl+Shift+5`.**

Dispatch a `KeyboardEvent` with `{ key: '5', code: 'Digit5', ctrlKey: true, shiftKey: true }` while recording and assert `onChange` receives `CommandOrControl+Shift+5`.

- [ ] **Step 2: Add a failing component test for unsupported keys.**

Dispatch `{ key: 'Unidentified', code: 'UnknownKey', ctrlKey: true }` and assert the recorder remains in recording mode and `checkHotkeyConflict` is not called.

- [ ] **Step 3: Run the focused component tests and verify the new cases fail before wiring.**

Run: `pnpm exec vitest run src/__tests__/settings-panels.test.tsx -t HotkeyRecorder`

Expected: the numeric event currently falls through the old `event.key` path or cannot type-check with the new code boundary.

- [ ] **Step 4: Implement only the required recorder event-shape adjustment.**

The window-level listener already prevents default and stops propagation. Preserve its Escape cancellation, modifier-only waiting, conflict state, and IPC error state; only pass `event.code` into `accelFromEvent`.

- [ ] **Step 5: Run all frontend tests and typecheck.**

Run: `pnpm test && pnpm typecheck`

Expected: Vitest exits 0 and `tsc --noEmit` exits 0.

## Task 8: Windows compatibility audit and build checks

**Files:**
- Modify only if audit finds a compile issue: `src-tauri/src/target_window.rs`, `src-tauri/src/macro_sender.rs`, `src-tauri/src/main.rs`, `src-tauri/tauri.conf.json`
- Create: `docs/product-audit/2026-08-24-flow-audit.md`

- [ ] **Step 1: Run host-independent Rust checks.**

Run: `cargo fmt --check && cargo clippy --all-targets --all-features -- -D warnings && cargo test`

Expected: format clean, clippy clean, and all tests pass. If an existing warning is unrelated, record its exact file and do not suppress it globally.

- [ ] **Step 2: Check the Windows target availability.**

Run: `rustup target list --installed` and `cargo check --target x86_64-pc-windows-msvc`.

Expected: either exit 0, or a concrete missing-target/linker error recorded in the audit. Do not claim Windows build success when the target is unavailable.

- [ ] **Step 3: Audit all cfg branches and packaging paths.**

Use:

```bash
rg -n "cfg\(|target_os|windows|macos|resource_dir|app_data_dir|skipTaskbar|focus|transparent|enigo|SendInput|keybd_event" src-tauri/src src-tauri/tauri.conf.json
```

Confirm no macOS-only symbol is compiled on Windows, no deprecated Win32 API appears, and resources resolve from Tauri paths.

- [ ] **Step 4: Write the product-flow audit with evidence.**

Document each of the five lifecycle stages from the design spec with status `已覆盖`, `需真实平台手测`, or `缺口`, plus P0/P1/P2 recommendations. Include exact commands and their exit codes, current E2E limitations, and Windows target status.

- [ ] **Step 5: Commit audit and any narrow compatibility fixes.**

```bash
git add src-tauri/src docs/product-audit/2026-08-24-flow-audit.md
git commit -m "audit: verify cross-platform app flow and windows paths"
```

## Task 9: Full verification and final requirement checklist

**Files:**
- No code changes unless a verification failure identifies a root cause.

- [ ] **Step 1: Run frontend verification.**

Run: `pnpm test && pnpm typecheck && pnpm build`

Expected: all Vitest tests pass, TypeScript exits 0, and Vite produces both pages.

- [ ] **Step 2: Run Rust verification.**

Run: `cargo fmt --check && cargo test && cargo clippy --all-targets --all-features -- -D warnings`

Expected: all commands exit 0.

- [ ] **Step 3: Run available E2E verification.**

Run: `pnpm test:e2e` when the debug Tauri binary and WebDriver prerequisites exist. Otherwise record the exact prerequisite failure in the audit.

- [ ] **Step 4: Re-read the user requirements against evidence.**

Check explicitly:

1. Dock/taskbar/tray open settings through the shared path.
2. Conflict detection covers primary and Shift companion and failed rebind preserves the old shortcut.
3. `Cmd/Ctrl+Shift+number` captures, validates, probes, persists, and displays.
4. Windows branches are cfg-safe and target check status is reported honestly.
5. Product audit lists closed loops and prioritized remaining improvements.

- [ ] **Step 5: Report only verified claims.**

Include changed files, command results, platform limitations, and the P0/P1/P2 audit summary. Do not claim physical Windows/Dock behavior was manually tested if the environment could not run it.
