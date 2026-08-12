import { z } from 'zod';

export const ParticleEffectSchema = z.enum(['none', 'sparks', 'stars', 'lightning']);
export type ParticleEffect = z.infer<typeof ParticleEffectSchema>;

export const SkinVisualsSchema = z.object({
  handleColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  bodyGradient: z.tuple([
    z.string().regex(/^#[0-9a-fA-F]{6}$/),
    z.string().regex(/^#[0-9a-fA-F]{6}$/),
  ]),
  tipGlow: z.boolean().default(false),
  particleEffect: ParticleEffectSchema.default('none'),
  outlineColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffffff'),
  bgAlpha: z.number().min(0).max(0.1).default(0.011),
});

export const SkinSoundsSchema = z.object({
  crack: z.array(z.string().min(1)).min(1).max(10),
  whoosh: z.array(z.string()).max(5).default([]),
});

export const SkinManifestSchema = z.object({
  specVersion: z.literal('1'),
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(40),
  description: z.string().max(100).optional(),
  author: z.string().optional(),
  visuals: SkinVisualsSchema,
  sounds: SkinSoundsSchema,
});

export type SkinManifest = z.infer<typeof SkinManifestSchema>;
export type SkinVisuals = z.infer<typeof SkinVisualsSchema>;
export type SkinSounds = z.infer<typeof SkinSoundsSchema>;

/** The 4 built-in skin IDs, as defined in design spec §6.2 */
export const BUILTIN_SKIN_IDS = ['default', 'fire', 'electric', 'neon'] as const;
export type BuiltinSkinId = (typeof BUILTIN_SKIN_IDS)[number];
