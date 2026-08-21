import type { BuiltinPackId, EffectPresetId } from '../shared/material-packs';

export type MaterialSurface =
  | 'metal' | 'wood' | 'glass' | 'ice' | 'water' | 'fire' | 'air'
  | 'stone' | 'bone' | 'fabric' | 'plastic';
export type MaterialForce =
  | 'thrust' | 'elastic' | 'fracture' | 'fluid' | 'vortex' | 'resonance'
  | 'combustion' | 'gravity' | 'electro' | 'ballistic' | 'recoil';

export type MaterialPhysicalBlueprint = Readonly<{
  surface: MaterialSurface; force: MaterialForce; mass: number; restitution: number;
  friction: number; drag: number; gravity: number; resonance: number;
  stiffness: number; phase: number;
}>;
export type MaterialAcousticBlueprint = Readonly<{
  medium: MaterialSurface; density: number; roughness: number; resonanceHz: number;
  absorption: number; spaceWidth: number; transient: number;
}>;
export type MaterialIdentity = Readonly<{
  physical: MaterialPhysicalBlueprint; acoustic: MaterialAcousticBlueprint;
}>;

type PhysicalTuple = [MaterialSurface, MaterialForce, number, number, number, number, number, number, number, number];
type AcousticTuple = [MaterialSurface, number, number, number, number, number, number];
type IdentityTuple = [PhysicalTuple, AcousticTuple];
const q = (
  surface: MaterialSurface, force: MaterialForce, mass: number, restitution: number,
  friction: number, drag: number, gravity: number, resonance: number,
  stiffness: number, phase: number,
): PhysicalTuple => [surface, force, mass, restitution, friction, drag, gravity, resonance, stiffness, phase];
const s = (
  medium: MaterialSurface, density: number, roughness: number, resonanceHz: number,
  absorption: number, spaceWidth: number, transient: number,
): AcousticTuple => [medium, density, roughness, resonanceHz, absorption, spaceWidth, transient];

/** Curated rows: the same effect preset may still have different mechanics. */
const ROWS: Record<BuiltinPackId, IdentityTuple> = {
  rocket: [q('air','thrust',.72,.18,.08,.996,.02,.35,.8,.13),s('air',.25,.18,220,.62,1.25,.42)], phoenix: [q('fire','combustion',.48,.25,.22,.985,.06,.52,.95,.31),s('fire',.38,.28,330,.48,1.1,.54)],
  lightning: [q('metal','electro',.18,.72,.05,.994,0,1.4,2.6,.47),s('metal',7.8,.12,4800,.08,.72,.98)], dragon: [q('bone','elastic',3.2,.58,.48,.978,.08,.7,1.7,.63),s('bone',1.9,.64,118,.32,1.18,.72)],
  'ninja-star': [q('metal','ballistic',.34,.66,.12,.992,-.01,1.05,1.9,.79),s('metal',7.2,.16,2650,.11,.8,.91)], katana: [q('metal','recoil',1.35,.44,.3,.978,-.01,.88,2.2,.97),s('metal',7.7,.22,1680,.16,.84,.89)],
  crystal: [q('glass','fracture',1.1,.16,.18,.972,-.12,1.65,2.8,1.11),s('glass',2.5,.08,4200,.07,1.02,.96)], skull: [q('bone','gravity',1.8,.34,.62,.979,.04,.42,1.1,1.23),s('bone',1.65,.72,185,.36,1.3,.61)],
  flame: [q('fire','combustion',.28,.08,.11,.981,.12,.38,.72,1.37),s('fire',.31,.36,510,.55,1.16,.7)], ice: [q('ice','fracture',1.28,.22,.24,.974,-.16,1.35,2.5,1.51),s('ice',.92,.1,3600,.12,.92,.94)],
  thunder: [q('stone','resonance',4.8,.12,.74,.965,-.04,.96,2.3,1.67),s('stone',2.7,.58,76,.2,1.44,.86)], water: [q('water','fluid',.62,.72,.03,.991,-.2,.22,.35,1.83),s('water',1,.18,720,.58,1.4,.5)],
  wind: [q('air','vortex',.16,.04,.02,.998,.03,.18,.26,1.99),s('air',.18,.12,680,.72,1.55,.32)], star: [q('stone','elastic',.55,.62,.2,.989,-.02,1.2,1.45,2.15),s('stone',1.1,.2,1820,.18,1.22,.88)],
  moon: [q('stone','gravity',2.4,.28,.42,.981,-.06,.68,1.8,2.31),s('stone',1.8,.34,210,.33,1.36,.6)], sun: [q('fire','combustion',2.1,.2,.3,.976,.1,.44,1.25,2.47),s('fire',1.4,.3,64,.4,1.48,.76)],
  meteor: [q('stone','gravity',3.8,.38,.68,.969,-.14,.56,1.6,2.63),s('stone',3.4,.7,92,.24,1.18,.9)], comet: [q('ice','ballistic',1.9,.42,.25,.987,-.08,.8,1.3,2.79),s('ice',1.2,.18,1480,.19,1.32,.8)],
  guitar: [q('wood','resonance',1.4,.3,.5,.982,-.03,1.15,2,2.95),s('wood',.72,.44,330,.29,1.12,.68)], drum: [q('wood','resonance',2.2,.18,.64,.974,-.05,1.02,2.45,3.11),s('wood',.86,.52,112,.21,1.25,.9)],
  bell: [q('metal','resonance',.92,.5,.2,.985,-.01,1.55,2.9,3.27),s('metal',7.4,.09,1046,.12,1.18,.93)], harp: [q('wood','elastic',.68,.48,.3,.991,-.04,1.3,1.65,3.43),s('wood',.58,.2,660,.24,1.42,.74)],
  trumpet: [q('metal','resonance',.84,.36,.25,.987,-.02,1.08,2.1,3.59),s('metal',6.6,.18,440,.2,1.34,.79)], bow: [q('wood','elastic',.74,.7,.46,.986,-.04,.9,2.35,3.75),s('wood',.64,.32,196,.31,1.02,.82)],
  shield: [q('metal','elastic',3.9,.82,.36,.967,-.02,1.18,2.7,3.91),s('metal',7.9,.26,196,.15,.92,.9)], axe: [q('metal','recoil',3.4,.3,.58,.968,-.1,.72,2.4,4.07),s('metal',7.6,.38,124,.17,.86,.95)],
  spear: [q('wood','ballistic',1.05,.38,.3,.983,-.04,.66,2.05,4.23),s('wood',.69,.29,760,.25,.9,.87)], bomb: [q('stone','recoil',3.6,.52,.7,.962,-.11,.5,1.35,4.39),s('stone',2.9,.76,82,.14,1.5,.99)],
  lotus: [q('fabric','fluid',.42,.36,.16,.994,-.05,.48,.62,4.55),s('fabric',.34,.22,520,.64,1.62,.4)], aurora: [q('air','fluid',.2,.1,.04,.997,.02,.3,.5,4.71),s('air',.21,.16,164,.78,1.82,.35)],
  tornado: [q('air','vortex',.36,.06,.03,.997,.04,.26,.72,4.87),s('air',.3,.2,58,.7,1.76,.45)], downpour: [q('water','fluid',.12,.78,.02,.999,-.24,.2,.3,5.03),s('water',1.02,.26,2400,.62,1.68,.56)],
  wildfire: [q('fire','combustion',.33,.1,.13,.98,.14,.36,.84,5.19),s('fire',.42,.4,180,.52,1.38,.72)], revolver: [q('metal','recoil',1.18,.2,.44,.97,-.01,1.28,2.35,5.35),s('metal',7.1,.46,105,.13,.76,1)],
  'glass-shot': [q('glass','fracture',.9,.12,.1,.968,-.14,1.8,2.95,5.51),s('glass',2.3,.11,3900,.05,1.08,.99)], 'boxing-glove': [q('fabric','recoil',1.05,.68,.4,.976,-.08,.3,1.1,5.67),s('fabric',.5,.82,112,.52,1.1,.88)],
  bullwhip: [q('fabric','elastic',.22,.9,.18,.993,-.03,.72,3.2,5.83),s('fabric',.28,.62,260,.48,1.28,.94)], piano: [q('wood','resonance',2.8,.24,.55,.979,-.03,1.42,2.55,5.99),s('wood',.8,.5,262,.27,1.2,.8)],
  saxophone: [q('metal','resonance',1.22,.34,.3,.986,-.02,1.18,1.9,6.15),s('metal',6.1,.4,233,.25,1.46,.69)], vinyl: [q('plastic','resonance',.76,.14,.36,.991,-.01,.82,1.15,.22),s('plastic',.94,.72,147,.34,1.58,.52)],
  fireworks: [q('fire','combustion',.58,.18,.22,.986,-.07,.62,1.05,.38),s('fire',.48,.36,3200,.22,1.7,.97)], 'black-hole': [q('stone','gravity',4.6,.02,.78,.998,0,1.05,3.1,.54),s('stone',4.2,.54,44,.82,1.9,.48)],
};

const makeIdentity = ([physical, acoustic]: IdentityTuple): MaterialIdentity => Object.freeze({
  physical: Object.freeze({ surface: physical[0], force: physical[1], mass: physical[2], restitution: physical[3], friction: physical[4], drag: physical[5], gravity: physical[6], resonance: physical[7], stiffness: physical[8], phase: physical[9] }),
  acoustic: Object.freeze({ medium: acoustic[0], density: acoustic[1], roughness: acoustic[2], resonanceHz: acoustic[3], absorption: acoustic[4], spaceWidth: acoustic[5], transient: acoustic[6] }),
});
export const MATERIAL_IDENTITIES: Readonly<Record<BuiltinPackId, MaterialIdentity>> = Object.freeze(
  Object.fromEntries(Object.entries(ROWS).map(([id, row]) => [id, makeIdentity(row)])) as Record<BuiltinPackId, MaterialIdentity>,
);

const SURFACES: readonly MaterialSurface[] = ['metal','wood','glass','ice','water','fire','air','stone','bone','fabric','plastic'];
const FORCES: readonly MaterialForce[] = ['thrust','elastic','fracture','fluid','vortex','resonance','combustion','gravity','electro','ballistic','recoil'];
function hash(value: string): number { let h = 2166136261; for (const char of value) { h ^= char.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }
function paramsText(params: Record<string, number>): string { return Object.keys(params).sort().map((key) => Number.isFinite(params[key]) ? `${key}:${params[key].toFixed(4)}` : '').join(';'); }
function fallback(packId: string, preset: EffectPresetId, params: Record<string, number>): MaterialIdentity {
  const key = `${packId}|${preset}|${paramsText(params)}`; const n = (offset: number) => hash(`${key}|${offset}`); const seed = n(0);
  return makeIdentity([q(SURFACES[Math.floor(seed * SURFACES.length)], FORCES[Math.floor(n(1) * FORCES.length)], .18 + n(2) * 4.2, .08 + n(3) * .82, .04 + n(4) * .78, .964 + n(5) * .033, -.2 + n(6) * .28, .25 + n(7) * 1.5, .45 + n(8) * 2.6, seed * Math.PI * 2), s(SURFACES[Math.floor(seed * SURFACES.length)], .2 + n(9) * 7.6, .08 + n(10) * .8, 60 + n(11) * 4800, .08 + n(12) * .78, .72 + n(13) * 1.1, .28 + n(14) * .7)]);
}
export function materialIdentityFor(packId: string, preset: EffectPresetId, params: Record<string, number> = {}): MaterialIdentity {
  return (MATERIAL_IDENTITIES as Record<string, MaterialIdentity>)[packId] ?? fallback(packId, preset, params);
}
