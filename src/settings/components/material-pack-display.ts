import type { MaterialPack, SoundRecipe } from '../../shared/material-packs';

export type PackFamily = 'all' | 'nature' | 'instrument' | 'weapon' | 'daily' | 'cosmic' | 'myth' | 'other';

export interface PackFamilyMeta {
  id: PackFamily;
  label: string;
  shortLabel: string;
}

export const PACK_FAMILIES: readonly PackFamilyMeta[] = [
  { id: 'all', label: '全部系列', shortLabel: '全部' },
  { id: 'nature', label: '自然', shortLabel: '自然' },
  { id: 'instrument', label: '乐器', shortLabel: '乐器' },
  { id: 'weapon', label: '武器', shortLabel: '武器' },
  { id: 'daily', label: '日常冲击', shortLabel: '日常' },
  { id: 'cosmic', label: '宇宙趣味', shortLabel: '宇宙' },
  { id: 'myth', label: '神话奇境', shortLabel: '神话' },
  { id: 'other', label: '其他', shortLabel: '其他' },
];

const FAMILY_IDS: Record<Exclude<PackFamily, 'all' | 'other'>, readonly string[]> = {
  nature: ['tornado', 'downpour', 'wildfire', 'wind', 'water', 'lightning', 'flame', 'ice', 'thunder', 'aurora'],
  instrument: ['piano', 'saxophone', 'vinyl', 'drum', 'guitar', 'harp', 'bell', 'trumpet'],
  weapon: ['revolver', 'glass-shot', 'katana', 'bow', 'shield', 'axe', 'spear', 'ninja-star', 'bomb', 'rocket'],
  daily: ['boxing-glove', 'bullwhip'],
  cosmic: ['fireworks', 'black-hole', 'star', 'moon', 'sun', 'meteor', 'comet'],
  myth: ['phoenix', 'dragon', 'skull', 'lotus', 'crystal'],
};

const FAMILY_LOOKUP = Object.entries(FAMILY_IDS).reduce<Record<string, PackFamily>>((lookup, [family, ids]) => {
  for (const id of ids) lookup[id] = family as PackFamily;
  return lookup;
}, {});

export function familyForPack(id: string): Exclude<PackFamily, 'all'> {
  return (FAMILY_LOOKUP[id] ?? 'other') as Exclude<PackFamily, 'all'>;
}

export function familyMeta(family: PackFamily): PackFamilyMeta {
  return PACK_FAMILIES.find((item) => item.id === family) ?? PACK_FAMILIES[0];
}

const EFFECT_LABELS: Record<string, string> = {
  jet: '喷射', rise: '升腾', bolt: '雷击', wave: '流体', orbit: '轨道', dash: '冲刺',
  shatter: '碎裂', burst: '爆散', 'flame-rise': '火焰', 'shatter-ice': '冰晶',
  'shock-ring': '冲击环', 'water-splash': '水花', whirl: '旋风', 'star-burst': '星爆',
  impact: '重击', comet: '彗尾', 'trail-burst': '拖尾爆裂', pulse: '脉冲', ring: '回荡',
  petal: '花瓣', echo: '余韵', arc: '弧光', spiral: '螺旋', split: '分裂', chain: '链式',
  glow: '光', twinkle: '闪烁', vortex: '漩涡', rain: '雨幕', explode: '爆炸',
  tornado: '龙卷风', downpour: '暴雨', wildfire: '烈火', gunshot: '枪击', 'glass-break': '碎屏',
  boxing: '拳击', 'whip-crack': '鞭梢', 'note-dance': '音符跳动', groove: '黑胶律动',
  fireworks: '烟花', singularity: '奇点坍缩', 'drum-beat': '鼓点震荡',
};

const PHYSICS_MODES: Record<string, string> = {
  jet: '推力 · 加速', rise: '升力 · 展开', bolt: '电弧 · 分叉', wave: '流体 · 蜿蜒',
  orbit: '轨道 · 离心', dash: '弹道 · 斩切', shatter: '晶体 · 崩解', burst: '粒子 · 放射',
  'flame-rise': '热流 · 上浮', 'shatter-ice': '冰晶 · 断裂', 'shock-ring': '冲击 · 环波',
  'water-splash': '液滴 · 抛物', whirl: '气流 · 旋转', 'star-burst': '星尘 · 爆发',
  impact: '刚体 · 震荡', comet: '引力 · 坠击', 'trail-burst': '惯性 · 拖尾', pulse: '弦振 · 脉冲',
  ring: '声场 · 回荡', petal: '重力 · 飘落', echo: '声场 · 余韵', arc: '动量 · 弧切',
  spiral: '角动量 · 螺旋', split: '复制 · 扩散', chain: '张力 · 链式', glow: '能场 · 膨胀',
  twinkle: '光子 · 闪烁', vortex: '涡量 · 聚拢', rain: '重力 · 雨幕', explode: '爆压 · 辐射',
  tornado: '气压 · 旋涡', downpour: '重力 · 暴雨', wildfire: '热流 · 燃烧', gunshot: '弹道 · 穿透',
  'glass-break': '脆性 · 裂解', boxing: '刚体 · 拳击', 'whip-crack': '张力 · 鞭梢',
  'note-dance': '声学 · 跳动', groove: '摩擦 · 律动', fireworks: '爆压 · 绽放', singularity: '引力 · 坍缩', 'drum-beat': '声压 · 鼓击',
};

const SOUND_LAYER_LABELS: Record<SoundRecipe['layers'][number]['type'], string> = {
  noise: '噪声',
  tone: '音色',
  sweep: '扫频',
  impact: '冲击',
  chime: '泛音',
  rumble: '低频',
};

export function effectLabel(preset: string): string {
  return EFFECT_LABELS[preset] ?? preset;
}

export function physicsMode(preset: string): string {
  return PHYSICS_MODES[preset] ?? '动量 · 耦合';
}

/** 用素材自身的配方生成卡片中的紧凑音色指纹。 */
export function soundSignature(sound: SoundRecipe): string {
  if (sound.sample) return `真实录音 · ${sound.sample.sourceTitle}`;
  const uniqueLayers = [...new Set(sound.layers.map((layer) => SOUND_LAYER_LABELS[layer.type]))];
  return uniqueLayers.slice(0, 3).join(' / ');
}

export function matchesPack(pack: MaterialPack, query: string, family: PackFamily): boolean {
  if (family !== 'all' && familyForPack(pack.id) !== family) return false;
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  const haystack = [pack.id, pack.name, effectLabel(pack.effect.preset), physicsMode(pack.effect.preset), familyMeta(familyForPack(pack.id)).label]
    .join(' ')
    .toLocaleLowerCase();
  return haystack.includes(normalized);
}

export function familyCounts(packs: readonly MaterialPack[]): Record<PackFamily, number> {
  const counts = Object.fromEntries(PACK_FAMILIES.map((item) => [item.id, 0])) as Record<PackFamily, number>;
  counts.all = packs.length;
  for (const pack of packs) counts[familyForPack(pack.id)] += 1;
  return counts;
}
