# img→Three Cinematic Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade every material effect with an image-derived Three.js Hero layer while preserving independent physical stages.

**Architecture:** A focused `three-image-hero.ts` module owns reusable GPU hero meshes and their frame-driven update; `ThreeEffectRenderer` attaches it beside the existing source sprite and cinematic family layers. Canvas uses a small multi-pass draw helper for semantic parity, while the existing resource graph remains the single disposal boundary.

**Tech Stack:** TypeScript strict, Three.js 0.185, Canvas 2D, ShaderMaterial, Vitest, Vite.

---

### Task 1: Lock the Hero contract with failing tests

**Files:**
- Create: `src/__tests__/three-image-hero.test.ts`
- Modify: `src/__tests__/three-effect-lifecycle.test.ts`
- Modify: `src/__tests__/material-identity-animation-scale.test.ts`
- Modify: `src/__tests__/material-visual.test.ts`

- [ ] **Step 1: Write tests** for four GPU hero layers, frame/physics-driven update, lifecycle attachment, and Canvas core-plus-echo drawing.
- [ ] **Step 2: Run focused tests and confirm RED** because the Hero module and Canvas multi-pass API do not yet exist.

### Task 2: Implement the image-derived Hero layer

**Files:**
- Create: `src/overlay/three-image-hero.ts`
- Create: `src/overlay/canvas-material-hero.ts`
- Modify: `src/overlay/three-effects.ts`
- Modify: `src/overlay/image-material.ts`

- [ ] **Step 1:** Add GPU Hero creation/update helpers with a shader energy layer, two depth echoes, and a pulse ring.
- [ ] **Step 2:** Attach Hero meshes after texture load, update them from the same scaled `SpriteFrame`, and let the root resource graph dispose them.
- [ ] **Step 3:** Route Canvas fallback through the multi-pass helper while preserving the core frame and 1.5× lifetime.
- [ ] **Step 4:** Run focused tests and confirm GREEN.

### Task 3: Verify and commit

- [ ] **Step 1:** Run `pnpm run typecheck`, focused Vitest, full Vitest, `pnpm run build`, Rust tests, Clippy, and `git diff --check`.
- [ ] **Step 2:** Run desktop and narrow viewport WebGL screenshots, confirm Hero meshes are attached and alive mid-animation.
- [ ] **Step 3:** Commit as `feat: add img2three cinematic hero layers`.
