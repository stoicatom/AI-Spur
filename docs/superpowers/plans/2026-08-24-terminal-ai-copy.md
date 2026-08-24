# Terminal AI Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Claude Code-specific user-facing copy so AISpur consistently describes support for terminal AI tools such as Claude Code and Codex.

**Architecture:** Keep runtime target detection unchanged and update only localized UI copy, onboarding copy, and Cargo package metadata. Validate with exact source scans, JSON parsing, TypeScript checks, and Rust tests.

**Tech Stack:** React/TypeScript, JSON locale files, Tauri/Rust Cargo metadata, pnpm, Vitest, Cargo.

---

### Task 1: Update localized UI copy

**Files:**
- Modify: `src/i18n/zh-CN.json:3-28`
- Modify: `src/i18n/en-US.json:3-28`
- Modify: `src/onboarding/steps.tsx:24-27`

- [x] **Step 1: Replace the locale descriptions**

Change the Chinese values to:

```json
"description": "AI 终端加速器，兼容 Claude Code、Codex 等终端 AI 工具"
```

and:

```json
"description": "随机选择一条发送到终端 AI"
```

Change the English values to:

```json
"description": "Terminal AI accelerator for Claude Code, Codex, and more"
```

and:

```json
"description": "Randomly select one to send to a terminal AI"
```

- [x] **Step 2: Replace the onboarding-specific sentence**

In `StepHotkey`, change only the lead paragraph to:

```tsx
<p className="onboard-step__lead">有时候终端 AI 实在太慢了。催它一下。</p>
```

- [x] **Step 3: Parse both locale files**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('src/i18n/zh-CN.json')); JSON.parse(require('fs').readFileSync('src/i18n/en-US.json')); console.log('locale JSON valid')"
```

Expected: `locale JSON valid`.

### Task 2: Update native application metadata

**Files:**
- Modify: `src-tauri/Cargo.toml:4`

- [x] **Step 1: Replace the package description**

Change:

```toml
description = "Spur Claude Code into moving faster"
```

to:

```toml
description = "Spur terminal AI tools into moving faster"
```

- [x] **Step 2: Confirm runtime target names remain intact**

Run:

```bash
rg -n '"Claude Code"|"Codex"' src-tauri/src/target_window.rs
```

Expected: both target names remain in the allowlist.

### Task 3: Verify copy coverage and project health

**Files:**
- Test: `src/i18n/zh-CN.json`, `src/i18n/en-US.json`, `src/onboarding/steps.tsx`, `src-tauri/Cargo.toml`

- [x] **Step 1: Scan user-facing source for stale Claude Code copy**

Run:

```bash
rg -n -i 'claude.?code|claudecode' src/i18n src/onboarding src/settings src/settings.html src-tauri/Cargo.toml
```

Expected: no output.

- [x] **Step 2: Run TypeScript checks and unit tests**

Run:

```bash
pnpm run typecheck
pnpm test -- --runInBand
```

Expected: both commands exit with code 0.

- [x] **Step 3: Run focused Rust tests**

Run:

```bash
cargo test target_window --manifest-path src-tauri/Cargo.toml
```

Expected: target-window tests pass, including Claude Code and Codex recognition.

- [x] **Step 4: Review the final diff**

Run:

```bash
git diff -- src/i18n/zh-CN.json src/i18n/en-US.json src/onboarding/steps.tsx src-tauri/Cargo.toml
```

Expected: only the approved copy values and native description change.
