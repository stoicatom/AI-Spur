# Material Identity Animation Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each material's own sprite animation visible, three times larger in animation area, and 1.5 times longer across WebGL and Canvas.

**Architecture:** A shared constants module defines the area, linear-size, and duration multipliers. Every render contract keeps its specialized physical stage and enables the source-sprite identity layer; WebGL and Canvas apply the same spatial multipliers, while the shared duration helper keeps all lifecycle boundaries aligned.

**Tech Stack:** TypeScript strict, Three.js, Canvas 2D, Vitest, Vite.

---

### Task 1: Lock the animation scaling contract with tests

**Files:**
- Create: `src/__tests__/material-identity-animation-scale.test.ts`
- Modify: `src/__tests__/three-effect-contract.test.ts`
- Modify: `src/__tests__/material-visual.test.ts`

- [ ] **Step 1: Write failing tests**

  Assert `MATERIAL_ANIMATION_AREA_SCALE === 3`, the linear sprite scale squared is 3, and `effectDurationFor('jet')` is 1.5 times the old 1200 ms baseline. Sample `placeFamilySprite` at the same progress and assert its travel magnitude is three times the unscaled trajectory. Assert every preset contract has `sourceSprite: true`, and update lifecycle boundary samples to the new duration.

- [ ] **Step 2: Run the targeted tests and verify the expected failures**

  Run `pnpm exec vitest run src/__tests__/material-identity-animation-scale.test.ts src/__tests__/three-effect-contract.test.ts src/__tests__/material-visual.test.ts`.

  Expected: failures for missing scaling exports, old source-sprite contract values, and old 1200 ms lifecycle assertions.

### Task 2: Implement shared scale and duration behavior

**Files:**
- Create: `src/overlay/material-animation-constants.ts`
- Modify: `src/overlay/effect-timings.ts`
- Modify: `src/overlay/three-effect-contract.ts`
- Modify: `src/overlay/three-family-timeline.ts`
- Modify: `src/overlay/three-effects.ts`
- Modify: `src/overlay/image-material.ts`
- Modify: `src/overlay/effects-family-presets.ts`

- [ ] **Step 1: Add the constants**

  Export area `3`, linear sprite scale `Math.sqrt(3)`, and duration `1.5` from the new module.

- [ ] **Step 2: Apply the shared duration multiplier**

  Keep existing per-preset base overrides, return their rounded value multiplied by `1.5`, and make the legacy default use the same scaled default.

- [ ] **Step 3: Enable the identity sprite layer without removing specialized stages**

  Change specialized/default contracts to `sourceSprite: true` while leaving generic particles and point-light decisions unchanged.

- [ ] **Step 4: Apply spatial scale consistently**

  Multiply final source-sprite trajectory offsets by `3` and source sprite geometry/drawn dimensions by `sqrt(3)` in WebGL and Canvas. Replace the downpour sprite's hardcoded `1900` clock with `effectDurationFor('downpour')`.

### Task 3: Verify regressions and commit

**Files:**
- Modify: any focused tests required by the implementation

- [ ] **Step 1: Run focused tests**

  Run `pnpm exec vitest run src/__tests__/material-identity-animation-scale.test.ts src/__tests__/three-effect-contract.test.ts src/__tests__/material-visual.test.ts src/__tests__/image-material-lifecycle.test.ts`.

- [ ] **Step 2: Run the complete verification suite**

  Run `pnpm run typecheck`, `pnpm exec vitest run`, `pnpm run build`, `cd src-tauri && cargo test`, `cd src-tauri && cargo clippy -- -D warnings`, and `git diff --check`.

- [ ] **Step 3: Commit**

  ```bash
  git add docs/superpowers/specs/2026-08-21-material-identity-animation-scale-design.md docs/superpowers/plans/2026-08-21-material-identity-animation-scale.md src/overlay src/__tests__
  git commit -m "feat: enlarge material identity animation"
  ```
