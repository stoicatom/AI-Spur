# Material Identity Animation Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each material's own sprite animation visible, three times larger in animation area, and 1.5 times longer across WebGL and Canvas.

**Architecture:** A shared constants module defines the area, linear-size, and duration multipliers and scales each preset `SpriteFrame`. Every render contract keeps its specialized physical stage and enables the source-sprite identity layer; WebGL and Canvas consume the same preset frame, while a thin Three adapter only maps coordinate systems. The shared duration helper and particle decay/delay scaling keep visible lifetimes aligned without changing the fixed 60 Hz simulation step.

**Tech Stack:** TypeScript strict, Three.js, Canvas 2D, Vitest, Vite.

---

### Task 1: Lock the animation scaling contract with tests

**Files:**
- Create: `src/__tests__/material-identity-animation-scale.test.ts`
- Modify: `src/__tests__/three-effect-contract.test.ts`
- Modify: `src/__tests__/material-visual.test.ts`

- [ ] **Step 1: Write failing tests**

  Assert `MATERIAL_ANIMATION_AREA_SCALE === 3`, the linear sprite scale squared is 3, and `effectDurationFor('jet')` is 1.5 times the old 1200 ms baseline. Pass a preset frame through `scaleMaterialSpriteFrame` and assert exact displacement/size multipliers with unchanged rotation/alpha. Assert every preset contract has `sourceSprite: true`, verify WebGL consumes the same preset frame after texture load, and update lifecycle boundary samples to the new duration.

- [ ] **Step 2: Run the targeted tests and verify the expected failures**

  Run `pnpm exec vitest run src/__tests__/material-identity-animation-scale.test.ts src/__tests__/three-effect-contract.test.ts src/__tests__/material-visual.test.ts`.

  Expected: failures for missing scaling exports, old source-sprite contract values, and old 1200 ms lifecycle assertions.

### Task 2: Implement shared scale and duration behavior

**Files:**
- Create: `src/overlay/material-animation-constants.ts`
- Create: `src/overlay/canvas-material-sprite.ts`
- Create: `src/overlay/three-sprite-frame.ts`
- Modify: `src/overlay/effect-timings.ts`
- Modify: `src/overlay/three-effect-contract.ts`
- Modify: `src/overlay/three-material-domains.ts`
- Delete: `src/overlay/three-family-timeline.ts`
- Modify: `src/overlay/three-effects.ts`
- Modify: `src/overlay/three-particle-motion.ts`
- Modify: `src/overlay/image-material.ts`
- Modify: `src/overlay/effects-family-presets.ts`

- [ ] **Step 1: Add the constants**

  Export area `3`, linear sprite scale `Math.sqrt(3)`, duration `1.5`, and a pure `SpriteFrame` scaling helper from the new module.

- [ ] **Step 2: Apply the shared duration multiplier**

  Keep existing per-preset base overrides, return their rounded value multiplied by `1.5`, and make the legacy default use the same scaled default.

- [ ] **Step 3: Enable the identity sprite layer without removing specialized stages**

  Change specialized/default contracts to `sourceSprite: true` while leaving generic particles and point-light decisions unchanged.

- [ ] **Step 4: Apply spatial scale consistently**

  Evaluate the current preset's `sprite(t, vel, params)` in both paths and pass it through the shared helper. Canvas draws the scaled frame directly; Three only flips `dy` and `rot` while placing the same frame. Apply the size multiplier once per path, remove the duplicate family timeline, and replace the downpour sprite's hardcoded `1900` clock with `effectDurationFor('downpour')`.

- [ ] **Step 5: Extend particle visibility with the timeline**

  After Canvas emission divide `decay` by `1.5` and multiply optional `delay` by `1.5`; divide WebGL seeded particle `decay` by `1.5`. Keep the fixed 60 Hz step and elapsed-time integration unchanged.

### Task 3: Verify regressions and commit

**Files:**
- Modify: any focused tests required by the implementation

- [ ] **Step 1: Run focused tests**

  Run `pnpm exec vitest run src/__tests__/material-identity-animation-scale.test.ts src/__tests__/three-particle-motion.test.ts src/__tests__/image-material-lifecycle.test.ts src/__tests__/three-effect-lifecycle.test.ts src/__tests__/three-effect-contract.test.ts src/__tests__/material-visual.test.ts`.

- [ ] **Step 2: Run the complete verification suite**

  Run `pnpm run typecheck`, `pnpm exec vitest run`, `pnpm run build`, `cd src-tauri && cargo test`, `cd src-tauri && cargo clippy -- -D warnings`, and `git diff --check`.

- [ ] **Step 3: Commit**

  ```bash
  git add docs/superpowers/specs/2026-08-21-material-identity-animation-scale-design.md docs/superpowers/plans/2026-08-21-material-identity-animation-scale.md src/overlay src/__tests__
  git commit -m "feat: enlarge material identity animation"
  ```
