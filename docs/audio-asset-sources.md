# 内置声音素材来源与审计

本文件记录 42 个内置素材包的声音选型依据、来源和技术检查结果。内置包只播放真实录音或专业 Foley 采样；程序化声音层仅保留给旧版用户自定义包作兼容回退。

## 选型与处理标准

- 瞬态必须清楚，主体频段不能被混响或背景噪声掩盖；动作类优先短促冲击，环境类允许较长尾音。
- 不通过改变播放速度或音高伪造另一种声源。运行时只做轻微响度匹配、立体声定位和动态压缩防削波。
- 原始 WAV/MP3/OGG 先做活动段 RMS 对齐、软膝压缩和峰值限制，再统一转为 192 kbps CBR AAC-LC M4A，保留原采样率与声道布局。
- 每个 `pack.json` 保存条目名称、来源页和许可；Rust 扫描后将音频作为 data URI 交给 Web Audio 解码。
- 2026-08-21 使用 macOS `afinfo` 检查全部文件，使用 `afclip -x` 检查削波。42/42 均可解码且无 clipped sample。

Mixkit 条目取自 [Mixkit Sound Effects](https://mixkit.co/free-sound-effects/)，许可按 [Mixkit Sound Effects Free License](https://mixkit.co/license/#sfxFree) 使用。萨克斯来自 Wikimedia Commons，单独遵循 CC BY-SA 4.0 并保留署名。

## 逐项声音特性

| 素材包 | 声音特性与用途 | 来源条目 |
| --- | --- | --- |
| aurora | 明亮高频闪烁、柔和空气尾音；匹配极光波面展开 | [Magic sparkle whoosh](https://mixkit.co/free-sound-effects/download/2350/) |
| axe | 金属锤击的硬瞬态与短低频实体感；匹配斧刃重击 | [Metal hammer hit](https://mixkit.co/free-sound-effects/download/833/) |
| bell | 清楚钟舌瞬态、可辨识金属衰减；匹配铃声余韵 | [Cooking bell ding](https://mixkit.co/free-sound-effects/download/1791/) |
| black-hole | 低频下潜、宽频呼啸和电影式重击；匹配奇点吸入 | [Cinematic whoosh deep impact](https://mixkit.co/free-sound-effects/download/1143/) |
| bomb | 宽频爆破瞬态、低频冲击和长衰减；匹配爆炸火球 | [Explosion hit](https://mixkit.co/free-sound-effects/download/1704/) |
| bow | 拉弦释放后的高速箭矢风切；匹配定向飞行 | [Arrow shot through air](https://mixkit.co/free-sound-effects/download/2771/) |
| boxing-glove | 近场拳击的紧实瞬态和身体低频；匹配镜头冲击 | [Impact of a strong punch](https://mixkit.co/free-sound-effects/download/2155/) |
| bullwhip | 极短上升沿和清脆鞭梢爆音；匹配音爆链段 | [Fast whip strike](https://mixkit.co/free-sound-effects/download/1511/) |
| comet | 由远至近的空气摩擦和落体呼啸；匹配长拖尾 | [Small meteor falling](https://mixkit.co/free-sound-effects/download/1337/) |
| crystal | 玻璃高频碎裂配合低频锤击；匹配晶体崩解 | [Glass break with hammer thud](https://mixkit.co/free-sound-effects/download/759/) |
| downpour | 密集雨滴、宽立体声环境和连续高频纹理；匹配满屏暴雨 | [Heavy rain drops](https://mixkit.co/free-sound-effects/download/2399/) |
| dragon | 粗糙低频咆哮、气流感和自然喉音；匹配龙形波动 | [Angry dragon growl](https://mixkit.co/free-sound-effects/download/309/) |
| drum | 深鼓瞬态、明显次低频和电影式尾音；匹配鼓膜震动 | [Drum deep impact](https://mixkit.co/free-sound-effects/download/563/) |
| fireworks | 多个清楚起爆点与空中衰减；匹配延迟绽放 | [Clear firework explosions](https://mixkit.co/free-sound-effects/download/2994/) |
| flame | 快速燃烧呼啸、明亮火舌纹理；匹配火焰上冲 | [Short fire whoosh](https://mixkit.co/free-sound-effects/download/1345/) |
| glass-shot | 玻璃高频裂响和中心重击；匹配屏幕裂纹扩散 | [Glass break with hammer thud](https://mixkit.co/free-sound-effects/download/759/) |
| guitar | 清楚拨弦瞬态、短乐句和受控延音；匹配弦振脉冲 | [Cool guitar riff](https://mixkit.co/free-sound-effects/download/2321/) |
| harp | 明亮竖琴琶音、柔和合唱尾音；匹配花瓣与光带 | [Choir harp bless](https://mixkit.co/free-sound-effects/download/657/) |
| ice | 真实冰块碰撞玻璃的尖锐瞬态和颗粒声；匹配冰晶碎裂 | [Dropping ice into a glass](https://mixkit.co/free-sound-effects/download/2834/) |
| katana | 短促金属刀刃冲击和快速衰减；匹配拔刀斩 | [Samurai sword impact](https://mixkit.co/free-sound-effects/download/2789/) |
| lightning | 高频电弧撕裂、宽频爆点和电气尾音；匹配分叉闪电 | [Electricity lightning blast](https://mixkit.co/free-sound-effects/download/2601/) |
| lotus | 柔和竖琴扫弦、低刺激高频和长尾；匹配花瓣漂浮 | [Relaxing harp sweep](https://mixkit.co/free-sound-effects/download/2628/) |
| meteor | 持续加速的空气摩擦与接近感；匹配坠落轨迹 | [Small meteor falling](https://mixkit.co/free-sound-effects/download/1337/) |
| moon | 隧道式空间呼啸与深混响；匹配月弧和空间纵深 | [Cinematic tunnel reverb woosh](https://mixkit.co/free-sound-effects/download/1486/) |
| ninja-star | 高速金属风切和短击点；匹配旋转飞镖 | [Metal arrow fast hit](https://mixkit.co/free-sound-effects/download/2770/) |
| phoenix | 燃烧空气呼啸、中频火焰纹理和长尾；匹配展翅上腾 | [Fire swoosh burning](https://mixkit.co/free-sound-effects/download/1328/) |
| piano | 真实琴键起音、木质机械感与谐振；匹配音符跃动 | [Piano key strike](https://mixkit.co/free-sound-effects/download/691/) |
| revolver | 清楚枪口瞬态、短促机械感与受控尾音；匹配弹道 | [Game gun shot](https://mixkit.co/free-sound-effects/download/1662/) |
| rocket | 快速上升的喷气呼啸、低频推力和空间尾音；匹配升空 | [Fast rocket whoosh](https://mixkit.co/free-sound-effects/download/1714/) |
| saxophone | 真实次中音萨克斯演奏 C 小调 The Lick；簧片起音、气息和自然颤音均保留 | [Lick Tenor Sax.wav](https://commons.wikimedia.org/wiki/File:Lick_Tenor_Sax.wav) |
| shield | 金属展开瞬态、科幻扫频和短共鸣；匹配护盾显现 | [Sci-fi metallic reveal](https://mixkit.co/free-sound-effects/download/887/) |
| skull | 中高频幽灵风切和位置掠过感；匹配碎片爆散 | [Ghostly whoosh passing](https://mixkit.co/free-sound-effects/download/2623/) |
| spear | 金属箭头的硬击点与极短尾音；匹配长矛突刺 | [Metal arrow hit](https://mixkit.co/free-sound-effects/download/2769/) |
| star | 高频闪光瞬态与细小泛音；匹配星芒爆发 | [Fairy magic sparkle](https://mixkit.co/free-sound-effects/download/871/) |
| sun | 宽频爆发、饱满低频和持续能量；匹配太阳辉光膨胀 | [Explosion hit](https://mixkit.co/free-sound-effects/download/1704/) |
| thunder | 真实雷鸣低频、缓慢滚动和宽空间感；匹配雷震环波 | [Thunder rumble](https://mixkit.co/free-sound-effects/download/2390/) |
| tornado | 持续旋转风噪、逐渐逼近和宽频空气感；匹配漏斗旋流 | [Storm coming whoosh](https://mixkit.co/free-sound-effects/download/2408/) |
| trumpet | 隔离录制的短小号号声、清晰铜管起音；匹配声波环 | [Party trumpet horn isolated](https://mixkit.co/free-sound-effects/download/526/) |
| vinyl | 真实唱针划过唱片的摩擦瞬态；匹配唱盘律动 | [Record player vinyl scratch](https://mixkit.co/free-sound-effects/download/702/) |
| water | 近场真实水花的宽频瞬态和水滴尾音；匹配液体飞溅 | [Water splash](https://mixkit.co/free-sound-effects/download/1311/) |
| wildfire | 持续燃烧呼啸、密集火焰纹理；匹配多簇野火 | [Fire swoosh burning](https://mixkit.co/free-sound-effects/download/1328/) |
| wind | 短促电影式风切、清晰移动方向；匹配旋风回旋 | [Cinematic wind swoosh](https://mixkit.co/free-sound-effects/download/1471/) |

## 共享音源与署名

`meteor/comet`、`crystal/glass-shot`、`bomb/sun`、`phoenix/wildfire` 分别共享同一条原始录音，但在清单中使用不同增益和视觉运动参数。共享发生在语义相近的物理事件之间，不使用变调伪造新音色。

萨克斯录音作者为 Wikimedia Commons 用户 **ChickSR**，作品描述为 “The lick in C minor played on tenor saxophone”，采用 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)。仓库中的 `sound.m4a` 是保持 44.1 kHz 声音内容的 AAC-LC 转码版本，属于同许可下的格式转换版本。

## 检查摘要

- 全部转码文件：44.1 kHz、双声道、AAC-LC、192 kbps CBR；`afinfo` 实测码率范围约 191.06-192.84 kbps。
- 全部文件活动段 RMS 实测范围约 -22.37 至 -17.18 dBFS；峰值范围约 -5.16 至 -3.01 dBFS；`afclip -x` 42/42 未发现削波。
- 内置音频总数：42；当前总大小约 4.2 MB。
- 可复现导入：`node scripts/import-mixkit-audio.js`；只刷新单个素材可追加素材 id，例如 `node scripts/import-mixkit-audio.js saxophone`。
- `scripts/remaster-built-in-audio.js` 只用于紧急响度调整；发布资产应优先从上述原始来源重新导入，避免 AAC 二次转码。
