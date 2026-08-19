# AISpur v3 — 素材包系统设计（Material Pack System）

> 日期：2026-08-19
> 状态：已确认（用户 2026-08-19 决策）
> 分支：feat/materials-sounds-interaction-overhaul

## 1. 背景与动机

旧架构将「素材（图标）」「配色皮肤」「音效包」解耦为三条独立选择轴，用户需要分别配置，
心智负担重；且内置 52 素材的图标与动画质量不满足产品愿景。本次升级将三者合一为
**素材包（Material Pack）**——一个强关联实体：图标 + 专属运动轨迹 + 专属声音 + 配色。

### 用户已确认决策

1. **素材包完全取代皮肤体系**，并支持「新建素材」流程：选/上传图标 → 选/上传声音 → 从预设动画库选轨迹。
2. **内置 30 个高质量素材全部重新设计**（不参考现有 52 个），用 Figma 精绘，高清立体、体积小（SVG < 8KB）。
3. **运动轨迹特效库 = 30 个预设**（可参数化）；内置 30 素材的动画 = 预设 + 每素材独家参数打磨，保证独一无二且酷炫。
4. **自定义素材**：图标与音频全部手动上传，仅特效从 30 预设中选取。
5. **声音全面升级 = 程序化合成**（Web Audio API），解决安装包 <15MB 硬预算（旧 52 音频已占 9.3MB）。
6. 皮肤页整体重构为素材包浏览器 + 新建向导。
7. 全面性能优化：内存泄漏、帧率、边界问题、全量测试。

## 2. 新架构

```
Material Pack（素材包）—— 用户眼中的唯一选择轴
├── 图标     icon        —— Figma 精绘高清立体 SVG
├── 运动轨迹  effect      —— 30 预设之一 + 参数化覆盖（内置素材独家调参）
├── 声音      sound       —— Web Audio 程序化合成配方（多层：主击+共鸣+余韵）
└── 配色      palette     —— 图标主色推导的鞭身/粒子渐变 + 色相
```

### 删除

- 配色皮肤轴：`skins/`、`SkinManifest`、`activate_skin`、`list_skins`
- 独立音效包轴：`sounds/` 目录 preset、`SoundPreset`、`crackSoundId`
- 旧素材轴：`activeMaterialId` 独立于声音的用法

### 保留

- 快捷键 / 提示词 / 动画模式（standard/fast/auto）/ 统计 / 主题 / 语言 / 首次引导
- `playSound`、`showBorderFlash`、`crackSensitivity`
- overlay 物理引擎（whip）+ 爆裂渲染层（重构为预设参数驱动）

## 3. 数据模型

### config.json v2 → v3

| 字段 | v2 | v3 | 说明 |
|---|---|---|---|
| `activeSkin` | ✓ | ✗ 删除 | 并入素材包 |
| `crackSoundId` | ✓ | ✗ 删除 | 并入素材包 |
| `activeMaterialId` | ✓ | ✗ 删除 | 并入素材包 |
| `activePackId` | ✗ | ✓ 新增 | 默认 `rocket` |

迁移：v2 读取 `activeMaterialId` 作为初始 `activePackId`（若无则 `rocket`）。

### 素材包（TS + Rust 双端同步）

```typescript
EffectPresetSchema = z.enum([30 个预设 id])

MaterialPackSchema = {
  id: string; name: string; builtin: boolean;
  icon: { imageFile: string; dataUri: string };
  effect: { preset: EffectPreset; params: Record<string, number> };
  sound: { recipe: SoundRecipe };   // 程序化合成配方
  palette: { bodyGradient: [string, string]; particleHue: number };
}
```

磁盘布局（内置）：`packs/<id>/icon.svg` + `pack.json`
磁盘布局（自定义）：`app_data_dir()/packs/custom/<id>/icon.<ext>` + `pack.json`

### SoundRecipe（程序化合成配方）

```typescript
SoundRecipe = {
  layers: Array<{
    type: 'noise' | 'tone' | 'sweep' | 'impact' | 'chime';
    attack: number; decay: number;
    filter?: { type: FilterType; freq: number; freqEnd?: number; q: number };
    osc?: { type: OscillatorType; freq: number; freqEnd?: number };
    noiseColor?: 'white' | 'pink';
    gain: number;
  }>;
  reverb?: { decay: number; mix: number };
}
```

## 4. 30 个内置素材包（全新设计）

| id | 名称 | 特效预设（定制参数） | 音色主题 |
|---|---|---|---|
| rocket | 火箭 | jet（升空尾焰） | 喷射+轰鸣 |
| phoenix | 凤凰 | rise（展翅上腾） | 凤鸣长啸 |
| lightning | 闪电 | bolt（劈裂） | 电击爆响 |
| dragon | 神龙 | wave（龙腾蜿蜒） | 低沉龙吟 |
| ninja-star | 手里剑 | orbit（飞旋环绕） | 破空锐音 |
| katana | 武士刀 | dash（拔刀一斩） | 金属出鞘 |
| crystal | 水晶 | shatter（晶体碎裂） | 清脆崩裂 |
| skull | 骷髅 | burst（幽魂爆散） | 低鸣幽响 |
| flame | 烈焰 | flame-rise（火焰升腾） | 燃烧呼呼 |
| ice | 寒冰 | shatter-ice（冰晶爆碎） | 冰裂脆响 |
| thunder | 雷鼓 | shock-ring（雷震环波） | 雷声轰鸣 |
| water | 碧波 | water-splash（水花四溅） | 水花哗啦 |
| wind | 疾风 | whirl（旋风回旋） | 风啸尖鸣 |
| star | 星芒 | star-burst（星形爆发） | 星光叮咚 |
| moon | 月刃 | impact（月弧斩击） | 幽光嗡鸣 |
| sun | 烈日 | burst（烈日放射） | 炽热轰鸣 |
| meteor | 流星 | comet（坠击爆燃） | 撞击巨响 |
| comet | 彗星 | trail-burst（拖尾爆裂） | 嗖声划过 |
| guitar | 电吉他 | pulse（弦振脉冲） | 电吉他弦音 |
| drum | 战鼓 | shock-ring（鼓面冲击） | 低沉鼓声 |
| bell | 铃铛 | echo（声波回荡） | 清脆铃声 |
| harp | 竖琴 | petal（琶音飘散） | 竖琴琶音 |
| trumpet | 号角 | ring（号角放射） | 嘹亮号声 |
| bow | 长弓 | dash（箭矢齐射） | 弓弦震鸣 |
| shield | 坚盾 | impact（盾面格挡） | 金属钝响 |
| axe | 战斧 | impact（斧刃劈砍） | 沉重劈砍 |
| spear | 长矛 | dash（长矛投掷） | 破空锐响 |
| bomb | 炸弹 | burst（猛烈爆炸） | 爆炸巨响 |
| lotus | 莲花 | petal（花瓣绽放） | 空灵悠远 |
| aurora | 极光 | wave（流光涌动） | 梦幻幻声 |

## 5. 子系统与实施顺序

| # | 子系统 | 内容 | 产出 |
|---|---|---|---|
| S1 | 数据模型+迁移 | `material-packs.ts`、Rust `packs.rs`、config v3 迁移、IPC、契约测试 | 地基 |
| S2 | Figma 图标 | 30 个高清立体 SVG（Figma 设计系统 + 批量导出） | `packs/<id>/icon.svg` |
| S3 | 特效预设库 | `src/overlay/effects.ts` 30 预设参数化实现 + 每素材参数 | 动画核心 |
| S4 | 声音引擎 | `src/overlay/audio-engine.ts` Web Audio 合成器 + 30 配方 | 音质核心 |
| S5 | 皮肤页重构 | 素材包浏览器（大卡片网格）+ 新建向导 3 步 | UI |
| S6 | 性能+边界 | 内存/帧率/音频节点生命周期/全量测试 | 收尾 |

## 6. 验收标准

1. 配置 v2→v3 迁移无损：旧 `activeMaterialId` 变为新 `activePackId`。
2. 30 内置素材包：图标 SVG 每枚 < 8KB，动画每素材视觉可区分，声音可区分。
3. 自定义素材：上传图标+声音 → 选 30 预设特效之一 → 生效。
4. 皮肤页：素材包大卡片网格 + 新建向导，全部走 frontend-design 规范。
5. 安装包 < 15MB（程序化声音零音频资产）。
6. 60fps 动画，无内存泄漏（重复触发 500 次 RSS 稳定）。
7. 测试全绿：TypeScript 单测 + 契约 + Rust 单测 + 组件。
