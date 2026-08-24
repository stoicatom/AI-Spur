# Material Physical Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every built-in material pack a unique, deterministic physical and acoustic identity that drives both its full-screen effect and real-recording playback.

**Architecture:** Add one immutable identity registry keyed by material pack ID. Feed its physical blueprint into the fixed-step Three.js solver and full-field layer, and feed its acoustic blueprint into both the real-sample bus and semantic audio fallback; presets remain compatibility routing only.

**Tech Stack:** TypeScript strict, Three.js 0.185, Web Audio API, Vitest 2.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/overlay/material-identity.ts` | 42 built-in physical/acoustic blueprints plus deterministic custom-pack fallback |
| `src/overlay/three-effect-physics.ts` | Merge manifest controls, whip velocity and physical blueprint into bounded solver values |
| `src/overlay/three-particle-motion.ts` | Apply identity force, mass, damping, gravity and ground restitution at fixed 60Hz |
| `src/overlay/three-family-shared.ts` | Carry pack ID and resolved material physics into specialized stages |
| `src/overlay/three-full-field-spectacle.ts` | Drive full-screen field geometry and motion from surface/force identity |
| `src/overlay/three-effect-layers.ts` | Build stages with the resolved identity context |
| `src/overlay/three-effects.ts` | Resolve identity once per effect and pass it through the render graph |
| `src/overlay/main.ts` | Send active pack ID to the renderer |
| `src/overlay/audio-sample-soundscape.ts` | Derive real-sample EQ/body/presence/space from the pack acoustic blueprint |
| `src/overlay/audio-engine.ts` | Send pack identity and strike velocity into real-sample playback |
| `src/overlay/audio-semantics.ts` | Apply the same acoustic identity to synthesized fallback events |
| `src/__tests__/material-identity.test.ts` | Exhaustive coverage, uniqueness and deterministic fallback contract |

### Task 1: Material identity registry

**Files:**
- Create: `src/overlay/material-identity.ts`
- Create: `src/__tests__/material-identity.test.ts`

- [ ] **Step 1: Write the failing registry tests**

```ts
import { describe, expect, it } from 'vitest';
import { BUILTIN_PACK_IDS } from '../shared/material-packs';
import { MATERIAL_IDENTITIES, materialIdentityFor } from '../overlay/material-identity';

describe('material identities', () => {
  it('covers all 42 built-ins with unique physical and acoustic signatures', () => {
    expect(Object.keys(MATERIAL_IDENTITIES).sort()).toEqual([...BUILTIN_PACK_IDS].sort());
    const identities = BUILTIN_PACK_IDS.map((id) => MATERIAL_IDENTITIES[id]);
    const physical = identities.map(({ physical: p }) =>
      [p.surface, p.force, p.mass, p.restitution, p.friction, p.drag, p.gravity, p.phase].join(':'));
    const acoustic = identities.map(({ acoustic: a }) =>
      [a.density, a.roughness, a.resonanceHz, a.absorption, a.spaceWidth, a.transient].join(':'));
    expect(new Set(physical).size).toBe(42);
    expect(new Set(acoustic).size).toBe(42);
  });

  it('creates a deterministic bounded identity for custom packs', () => {
    const a = materialIdentityFor('custom-rain', 'downpour', { density: 1.4 });
    const b = materialIdentityFor('custom-rain', 'downpour', { density: 1.4 });
    expect(a).toEqual(b);
    expect(a.physical.mass).toBeGreaterThan(0);
    expect(a.physical.restitution).toBeGreaterThanOrEqual(0);
    expect(a.physical.restitution).toBeLessThanOrEqual(1);
    expect(a.acoustic.resonanceHz).toBeGreaterThanOrEqual(20);
    expect(a.acoustic.resonanceHz).toBeLessThanOrEqual(12000);
  });
});
```

- [ ] **Step 2: Run the focused test and verify module-not-found failure**

Run: `pnpm vitest run src/__tests__/material-identity.test.ts`
Expected: FAIL because `material-identity.ts` does not exist.

- [ ] **Step 3: Implement immutable identities and fallback**

Define `MaterialSurface`, `MaterialForce`, `MaterialPhysicalBlueprint`, `MaterialAcousticBlueprint`, and `MaterialIdentity`. Populate `MATERIAL_IDENTITIES` with all IDs from `BUILTIN_PACK_IDS`; every row receives physically plausible values for its actual subject. Implement an FNV-1a hash over `packId`, preset, sorted finite params; use that fingerprint to select a surface/force and bounded numeric properties for unknown packs.

- [ ] **Step 4: Run registry tests**

Run: `pnpm vitest run src/__tests__/material-identity.test.ts`
Expected: PASS, 42 physical signatures and 42 acoustic signatures.

- [ ] **Step 5: Commit**

```bash
git add src/overlay/material-identity.ts src/__tests__/material-identity.test.ts
git commit -m "feat: define independent material identities"
```

### Task 2: Fixed-step physical solver integration

**Files:**
- Modify: `src/__tests__/three-effect-physics.test.ts`
- Modify: `src/__tests__/three-particle-motion.test.ts`
- Modify: `src/__tests__/material-pack-physics.test.ts`
- Modify: `src/overlay/three-effect-physics.ts`
- Modify: `src/overlay/three-particle-motion.ts`

- [ ] **Step 1: Add failing behavior tests**

Add assertions that rocket and water with equal preset controls resolve different `mass`, `drag`, `force`, and `identityPhase`; that high whip speed increases impulse without exceeding existing energy/count bounds; and that a metal/stone state crossing `groundY` rebounds using restitution while fluid/fire states do not receive a rigid bounce.

- [ ] **Step 2: Run focused physics tests**

Run: `pnpm vitest run src/__tests__/three-effect-physics.test.ts src/__tests__/three-particle-motion.test.ts src/__tests__/material-pack-physics.test.ts`
Expected: FAIL because resolved physics has no identity fields.

- [ ] **Step 3: Extend resolved solver values**

Add `surface`, `force`, `mass`, `restitution`, `friction`, `stiffness`, and `identityPhase` to `MaterialPhysics`. Make `resolveMaterialPhysics(profile, params, rawSpeed, blueprint?)` preserve its compatibility default while using the supplied blueprint to compute impulse as `speed / sqrt(mass)`, drag from the physical drag coefficient, gravity from the blueprint, and phase from blueprint phase plus the manifest fingerprint.

- [ ] **Step 4: Apply forces and collision at fixed dt**

Store `groundY` on each particle state. In `integrateParticleStep`, apply a small deterministic force selected by `physics.force`, then perform semi-implicit damping and a ground collision for rigid surfaces using `vy = -vy * restitution` and `vx *= 1 - friction`. Keep `DT = 1 / 60` and avoid per-frame allocations.

- [ ] **Step 5: Run focused physics tests and commit**

Run: `pnpm vitest run src/__tests__/three-effect-physics.test.ts src/__tests__/three-particle-motion.test.ts src/__tests__/material-pack-physics.test.ts`
Expected: PASS.

```bash
git add src/overlay/three-effect-physics.ts src/overlay/three-particle-motion.ts src/__tests__/three-effect-physics.test.ts src/__tests__/three-particle-motion.test.ts src/__tests__/material-pack-physics.test.ts
git commit -m "feat: drive effects with material physics"
```

### Task 3: Pack identity in the full-screen render graph

**Files:**
- Modify: `src/__tests__/three-full-field-spectacle.test.ts`
- Modify: `src/__tests__/three-effect-lifecycle.test.ts`
- Modify: `src/overlay/three-family-shared.ts`
- Modify: `src/overlay/three-effect-layers.ts`
- Modify: `src/overlay/three-full-field-spectacle.ts`
- Modify: `src/overlay/three-effects.ts`
- Modify: `src/overlay/main.ts`

- [ ] **Step 1: Add failing render identity tests**

Build two contexts with the same profile but different pack IDs/blueprints (dragon and aurora). Assert their full-field object names, energy geometry/matrices and update results differ at the same timestamp, while repeated updates for one pack are deterministic.

- [ ] **Step 2: Run render tests**

Run: `pnpm vitest run src/__tests__/three-full-field-spectacle.test.ts src/__tests__/three-effect-lifecycle.test.ts`
Expected: FAIL because `FamilyContext` and `ThreeEffectSpec` lack pack identity.

- [ ] **Step 3: Wire the identity once per effect**

Add `packId` to `ThreeEffectSpec`; pass `activePack.id` from `main.ts`. Resolve `materialIdentityFor(spec.packId, spec.preset, spec.params)` once in `ThreeEffectRenderer.start`, pass its physical blueprint to `resolveMaterialPhysics`, and add `packId` plus `physics` to `FamilyContext`.

- [ ] **Step 4: Replace family-only field variation**

Make full-field geometry select by `physics.surface`, motion select by `physics.force`, and deterministic angular offsets use `physics.identityPhase`. Name resources `full-field-${packId}-*`; use mass, stiffness, drag, restitution and friction to control reach, ring eccentricity, particle stretch, acceleration and fade. Preserve resize/disposal behavior and the existing viewport-corner coverage contract.

- [ ] **Step 5: Run render tests and commit**

Run: `pnpm vitest run src/__tests__/three-full-field-spectacle.test.ts src/__tests__/three-effect-lifecycle.test.ts src/__tests__/three-effect-host.test.ts`
Expected: PASS.

```bash
git add src/overlay/three-family-shared.ts src/overlay/three-effect-layers.ts src/overlay/three-full-field-spectacle.ts src/overlay/three-effects.ts src/overlay/main.ts src/__tests__/three-full-field-spectacle.test.ts src/__tests__/three-effect-lifecycle.test.ts
git commit -m "feat: render full fields from pack identity"
```

### Task 4: Physical processing for real sound recordings

**Files:**
- Modify: `src/__tests__/audio-engine.test.ts`
- Modify: `src/__tests__/audio-semantics.test.ts`
- Modify: `src/overlay/audio-sample-soundscape.ts`
- Modify: `src/overlay/audio-engine.ts`
- Modify: `src/overlay/audio-semantics.ts`

- [ ] **Step 1: Add failing acoustic tests**

Assert that all 42 built-ins resolve unique sample profiles; crystal has higher presence cutoff/transient than bomb, thunder has more body than bell, and faster strikes increase gain/playback rate only within bounded limits. Assert semantic fallback event gain, resonance and spread remain deterministic for one pack and differ for two pack identities.

- [ ] **Step 2: Run focused audio tests**

Run: `pnpm vitest run src/__tests__/audio-engine.test.ts src/__tests__/audio-semantics.test.ts`
Expected: FAIL because sample profiles are preset-only.

- [ ] **Step 3: Derive the real-sample bus from acoustic identity**

Change `sampleSoundscapeProfileFor(packId, preset)` to merge the preset compatibility profile with `materialIdentityFor(...).acoustic`. Derive dry/body/presence/space gains, body and presence filters, stereo delays and playback-rate bounds from density, roughness, resonance, absorption, width and transient. Pass pack ID and velocity speed through `playSample`; keep the real recording as the only source.

- [ ] **Step 4: Apply identity to semantic fallback**

In `createSemanticSoundPlan`, map events through the acoustic blueprint: bound gain to 1, bias existing frequencies toward the material resonance without replacing semantic pitches, and scale spread by space width. Do not introduce random identity values.

- [ ] **Step 5: Run audio tests and commit**

Run: `pnpm vitest run src/__tests__/audio-engine.test.ts src/__tests__/audio-semantics.test.ts src/__tests__/audio-lifecycle.test.ts`
Expected: PASS and all created nodes are released.

```bash
git add src/overlay/audio-sample-soundscape.ts src/overlay/audio-engine.ts src/overlay/audio-semantics.ts src/__tests__/audio-engine.test.ts src/__tests__/audio-semantics.test.ts
git commit -m "feat: shape sounds with material acoustics"
```

### Task 5: Full verification and visual audit

**Files:**
- Modify only files required to fix verification regressions.

- [ ] **Step 1: Run static and unit verification**

Run: `pnpm run typecheck && pnpm run test`
Expected: TypeScript succeeds and the complete Vitest suite passes.

- [ ] **Step 2: Run Rust contract verification**

Run: `cd src-tauri && cargo test && cargo clippy -- -D warnings`
Expected: Rust tests and clippy pass.

- [ ] **Step 3: Build production frontend**

Run: `pnpm run build`
Expected: Vite production build succeeds.

- [ ] **Step 4: Inspect representative visual domains**

Run the app and capture rocket/water, dragon/aurora, katana/bow/spear, harp/lotus, piano/saxophone and bomb/thunder at desktop and compact viewport sizes. Verify a nonblank canvas, viewport coverage, no overlaps, and visibly different geometry/force response for materials that previously shared a preset.

- [ ] **Step 5: Confirm the worktree contains only intentional changes**

Run: `git status --short`
Expected: only the implementation and test files listed by Tasks 1-4, or an empty worktree after their commits.
