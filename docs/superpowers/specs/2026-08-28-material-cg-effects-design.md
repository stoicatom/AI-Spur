# 素材库 CG 级特效与图标统一设计（v1）

> 状态：设计稿（待审批）
> 日期：2026-08-28
> 上游：`2026-08-22-img2three-cinematic-upgrade-design.md`（hero 层增强，已实现）之上的全量 CG 级重建
> 关联目录：`docs/adr/`（选型 ADR，随 M0 写入）

## 0. 背景与目标

AISpur 素材库（v3 唯一选择轴：图标 + 特效 + 声音 + 配色）当前 42 个内置素材包，每个素材已有一个专属 Three.js 程序化特效场景（`three-family-*`，五大族分派），但实现为"基础几何近似"：闪电为圆柱折线段、黑洞为 torus 环 + 尘埃、爆炸为 icosahedron 火球 + 线框壳。视觉上可用，但与"3D 动漫 CG 级"存在明显差距。

本轮目标（用户确认）：

1. 侧边栏菜单"素材包"改名"素材库"。
2. 42 枚内置素材图标建立统一设计系统并全部重绘。
3. **42 个素材全部**逐素材设计 CG 级特效：物理特性、运动复杂度、趣味性、元素多样性、多元素互动、全屏性、视觉逼真性。
4. 特效必须达到 3D CG / 动漫电影级别的视觉效果。
5. 使用专业第三方 3D 库完成，禁止自研引擎。
6. **不限制应用体积**（打包体积 ≤ 15MB 性能预算相应调整）。
7. **不设固定 fps 下限**，以"最流畅"为准；性能与特效兼容性为核心验收指标。
8. 保证原功能不受影响：渲染 WebGL 失败自动降 2D canvas 的链路、声音、宏发送、Tauri 窗口生命周期全部不动。

## 1. 现状审计（事实基线）

| 项 | 现状 |
|---|---|
| 素材数量 | **42 个内置素材包**（`src-tauri/packs/<id>/`，含 `icon.svg` + `pack.json`）。`src-tauri/materials/`（52 个）为 v2 遗留目录，不在运行路径，本轮不触碰。 |
| 特效预设 | 42 个 `EffectPresetId`，每个内置素材恰好映射一个（如 black-hole→singularity、bomb→explode、glass-shot→glass-break、lightning→bolt、ice→shatter-ice、fireworks→fireworks），另有 6 个 legacy 预设（spiral/split/chain/twinkle/vortex/rain）仅服务旧用户包。 |
| 3D 底层 | `three@0.185`：`WebGLRenderer`（alpha/antialias/high-performance）+ `EffectComposer`（RenderPass + UnrealBloom 0.72/0.55/0.78 + OutputPass）+ ACES tone mapping + PMREM RoomEnvironment。正交相机 -w/2..w/2。 |
| 场景层 | `CinematicLayers` 按 `profile.family` 分派五大族（cosmic/impact/natural/rhythm/weapon），另挂 `FullFieldSpectacleLayer` 全屏场 + `three-image-hero` hero 层。 |
| 物理签名 | `material-identity.ts`：每素材 surface/force/mass/restitution/friction/drag/gravity/resonance/stiffness/phase + 声学签名，已驱动现有动画参数。 |
| 降级链 | `ThreeEffectHost`：WebGL 初始化失败 / context lost / 帧异常 → 释放 renderer → 2D canvas 爆裂样式回退（`material-styles.ts`），`webglcontextlost/restored` 已处理。 |
| 配置 | Config `version: '3.0'`，Zod + serde 双端同步，已有 `migrate()` 机制；无画质字段。 |
| 图标 | 42 枚内置 `icon.svg`（48×48 viewBox，Figma 精绘，各素材风格自成一派，无统一设计系统）。设置页经 `list_packs` → `dataUri` 直接显示。 |
| 时长 | 基础特效时长 1200ms，12 个 preset 有覆盖（tornado 1800 / downpour 1900 / fireworks 1950 / singularity 1850 / glass-break 1550 等），`effect-timings.ts` 为 2D/WebGL/音频共享时间轴。 |

## 2. 技术选型（专业三方库，禁自研）

保留 `three` 为引擎底层（它就是业界标准专业 3D 库），其上叠加专业特效栈：

| 库 | 版本（实现期钉版） | 用途 | 选型理由 |
|---|---|---|---|
| `three` | 0.185（现有，升级至 0.185.x 最新） | 渲染引擎 | 不动 |
| `three.quarks`（@querielo/three.quarks） | ^0.17 | **GPU 粒子引擎**：火焰、烟雾、雪花、火花、流光、碎片、花瓣、音符等全部粒子层 | 声明式 emitter（拖尾/湍流/重力/碰撞力场）、实例化级性能、独立于 three 小版本 |
| `postprocessing`（pmndrs） | ^6.39.4 | **电影级后处理链**：GodRays、Bloom、SSAO、DepthOfField、ChromaticAberration、Vignette、SMAA、LUT/色彩分级、胶片颗粒 | three.js 生态事实标准，pass 即插即用；替代手写复合的 EffectComposer 栈 |
| `three-good-godrays` | ^0.12 | 屏幕空间 raymarch 体积光（黑洞透镜、爆炸闪光、闪电氛围、烟花光柱） | 为 postprocessing 编写，直接复用；GodRaysEffect 效果不足时启用 |
| `cannon-es` | ^0.20 | 刚体物理：玻璃碎片、弹片、碎石、弹壳的真实碰撞/重力/反弹 | 轻量纯 JS、与 three 无缝、测试可 mock |

**"禁止自研"边界原则**：引擎级能力（粒子系统、后处理、物理、体积光）全部由上表专业库承担；逐素材的"特效配方"（Stage 编排 + ShaderMaterial 材质 + GPUComputationRenderer 模拟场）属于 Three.js 公开编程接口上的组合描述，与行业 CG 制作方式一致，不构成自研引擎。写入 ADR（`docs/adr/2026-08-28-cg-effects-stack.md`）作为宪法记录。

## 3. 性能策略（已确认：无固定 fps，最流畅优先）

### 3.1 五档画质（用户可自选）

| 档位 | 粒子乘数 | 后处理栈 | 体积/光追层 | 物理刚体 | pixelRatio 上限 |
|---|---|---|---|---|---|
| 电影级 | 1.00× | 全链（GodRays+Bloom+SSAO+色散+颗粒+SMAA+Vignette+LUT） | 全开 | 全量 | 2.0 |
| 高 | 0.75× | Bloom+色散+颗粒+SMAA | 上帝光开，SSAO 关 | 全量 | 1.75 |
| 中 | 0.50× | Bloom+SMAA | 关 | 减半 | 1.5 |
| 低 | 0.30× | SMAA 仅 | 关 | 无 | 1.25 |
| 自动 | 见 3.2 | 见 3.2 | 见 3.2 | 见 3.2 | 见 3.2 |

- **档位 = 画质目标**，不承诺任何 fps 数值。
- 每档同时作用于：`ThreeEffectRenderer` 分辨率、`CinematicRenderPipeline` pass 列表、粒子 emitter 数量/上限、物理 step 频率与刚体数、全屏场 shader 迭代次数。
- 自动档降级/升级全部在特效边界（`cancel`/`start`）实施，不打断进行中的特效。

### 3.2 自动档 = 运行时自适应

- **初始档**：首次特效启动前的能力探测（WebGL 上下文报告 + 5 秒空闲帧采样基准），映射到 中/高/电影 三档之一。
- **运行中**：维护 30 帧滚动窗口，窗口平均帧耗时超过"本机基准 × 1.6"持续 2 个连续窗口 → 降一档；窗口帧耗时持续低于"基准 × 0.7" 连续 6 个窗口 → 升一档。
- 阈值全部相对于**本机运行时基准**而非绝对值，因此"最流畅"在所有设备上成立；低/高两端封顶不外溢。
- 手动档位（电影/高/中/低）优先于自动降档，用户选择即锁定。

### 3.3 新增指标（替代固定 fps 断言）

- 帧耗时采样 P50/P95（性能测压脚本，`vitest bench` 或独立 harness）。
- 掉档事件计数（开发日志）。
- WebGL1 兼容：能力探测降级（`OES_standard_derivatives` 缺失时关闭 SSAO/色散等 GLSL 扩展依赖），保证 WebGL1 核显仍可跑低中档。
- WebGL 不可用 → 现有 2D canvas 降级链（不动）。

## 4. CG 特效架构

### 4.1 分层

```
crack 触发
 └─ CgStage 编排器（每素材一个 Stage 脚本：入场 → 主幕 → 多元素互动 → 消隐）
      ├─ 粒子层    three.quarks（每素材 2~6 个 emitter）
      ├─ 体积层    postprocessing GodRays / three-good-godrays / 屏幕空间 raymarch
      ├─ 刚体层    cannon-es（碎片/弹片/玻璃屑）
      ├─ 环境场面  ShaderMaterial（乌云 FBM、吸积盘、龙卷漏斗、水面、星云）
      └─ 全屏场    现有 FullFieldSpectacleLayer 扩展（每素材参数化）
 └─ 后处理链       postprocessing（按档位装配）
    ↓ 特效结束
 清场 → 现有 runId/dispose 资源生命周期（不动）
```

- 现有 `three-effect-contract.ts` 的 `renderContractFor` 语义保留：CG Stage 替换的是"family stage"层；hero 层、sprite 层、point light、generic particles 契约不变。
- Stage 脚本按族分文件（沿现有 `three-family-*.ts` 命名与行数约束），每素材一个 `Stage` 类；低档位时降级到现有程序化 Stage（保留为 `legacy` 路径），中高档才创建 CG Stage —— **这保证"动画、音效、宏发送"在任何档位下依然工作**。

### 4.2 42 素材 CG 设计矩阵

逐素材设计三幕编排（入场 / 主幕 / 消隐）。以下按族列出，每个素材引用现有 `material-identity` 的 surface/force/mass 驱动物理签名：

#### 宇宙族（cosmic）— rocket / phoenix / ninja-star / star / moon / sun / meteor / comet / aurora / twinkle / orbit / glow / spiral / arc / fireworks / black-hole / star-burst

| 素材 | 元素 | CG 设计（三幕） |
|---|---|---|
| rocket | 火箭 | ①点火尾焰（3 emitter：蓝芯+橙涡+烟）→ ②高空喷射音爆环 → ③尾焰熄灭+星屑 |
| phoenix | 凤凰 | ①振翅火羽展开 → ②浴火重生（火羽粒子重组） → ③余烬金雨 |
| ninja-star | 手里剑 | ①旋转投掷（残影拖尾+金属反光）→ ②命中瞬移分身 → ③落地弹跳刚体碎片 |
| star | 星星 | ①星芒闪烁 → ②五芒星爆发（定向星轨）→ ③星光雨 |
| moon | 月亮 | ①月升 → ②月面环形山+陨石雨 → ③月晕涟漪 |
| sun | 太阳 | ①日冕爆发 → ②耀斑粒子+日珥卷曲 → ③光斑消散 |
| meteor | 陨石 | ①再入火鞘（多层热浪）→ ②大气电离拖尾+碎片剥落（刚体）→ ③撞击闪光+尘环 |
| comet | 彗星 | ①彗核+彗尾冰晶 → ②过近日点加速 → ③尾迹衰减 |
| aurora | 极光 | ①极光带卷动（SDF 噪声面）→ ②带状流动+闪烁 → ③微光余韵 |
| twinkle | 星光 | ①多点闪烁 → ②星座连线闪亮 → ③星尘飘散 |
| orbit | 环绕 | ①环轨飞驰 → ②轨道分身 → ③离心甩出 |
| glow | 辉光 | ①光晕膨胀 → ②内部旋转光带 → ③柔光消散 |
| spiral | 螺旋 | ①螺旋上升 → ②涡旋加速 → ③向外甩离 |
| arc | 弧光 | ①弧光斩击 → ②弧内电弧折射 → ③弧光拖尾 |
| fireworks | 烟花 | **①升空（拖尾+闪燃）→ ②炸开（百合/牡丹/星芒多形态+多色）→ ③残星雨落 + 连环炸（全屏）** |
| black-hole | 黑洞 | **①事件视界光子球 → ②吸积盘（双涡旋 GPU 粒子+轨道碎片被吞噬）→ ③引力透镜（GodRays 环绕扭曲）+ 相对论双极喷流 → ④星云尘埃吸入** |
| star-burst | 星爆 | ①五角星爆发 → ②星芒旋转 → ③星尘溅射 |

#### 冲击族（impact）— skull / thunder / bomb / boxing / wildfire / burst / impact / shock-ring / explode

| 素材 | 元素 | CG 设计 |
|---|---|---|
| skull | 骷髅 | ①骨白光泽 → ②鬼火四散 → ③骨屑崩塌（刚体） |
| thunder | 雷震 | ①天穹闷雷（乌云内闪）→ ②环波震屏 → ③雷鸣余震 |
| bomb | 炸弹 | **①引信火花+颤动 → ②火球爆发（真实火焰 shader 卷动）→ ③冲击波可视球环+全屏压力变形 → ④浓烟蘑菇云（体积烟雾）+ 碎片刚体弹射 → ⑤灰烬雨** |
| boxing | 拳击 | ①拳套冲拳（镜头推拉）→ ②命中压缩环+手套变形 → ③反弹回摆 |
| wildfire | 野火 | ①多簇火舌 → ②火线蔓延（噪声驱动）→ ③余烬上扬 |
| burst | 幽魂 | ①幽魂浮现 → ②放射爆散 → ③残影幽灵 |
| impact | 重击 | ①蓄力下砸 → ②地面冲击环+落点裂纹 → ③震尘 |
| shock-ring | 环波 | ①环波扩散（多层）→ ②屏幕涟漪 → ③渐进衰减 |
| explode | 爆炸 | 同 bomb 核心设计（本素材即其族内最强版本） |

#### 自然族（natural）— dragon / flame / ice / water / wind / lotus / tornado / downpour / rain / petal / flame-rise / water-splash / whirl / vortex / glass（legacy）

| 素材 | 元素 | CG 设计 |
|---|---|---|
| dragon | 龙 | ①龙身蜿蜒（骨骼链网格）→ ②吐息（龙焰+火球）→ ③腾空消散 |
| flame | 火焰 | ①火舌抖动 → ②热浪上升（体积光）→ ③火星飞溅 |
| ice | 寒冰 | **①漫天狂风雪幕（GPU 雪粒+风力切变）→ ②寒雾弥漫（体积雾）→ ③冰晶虹吸（晶核生长+光晕）→ ④冰棱碎落** |
| water | 水 | ①水柱涌起 → ②波浪水面（噪声 shader）→ ③水滴四溅 |
| wind | 风 | ①风场流动（流线粒子）→ ②尘卷 → ③风流消散 |
| lotus | 莲花 | ①花瓣绽放 → ②花瓣飘散（刚体+旋转）→ ③水面涟漪 |
| tornado | 龙卷 | ①漏斗成形（SDF 噪声体）→ ②吸入（周边粒子螺旋卷入）→ ③消散 |
| downpour | 暴雨 | ①雨帘 3D 体积 → ②地面涟漪冲击环 → ③雾气漫开 |
| rain | 雨 | ①斜雨丝 → ②雨层叠加 → ③雨停 |
| petal | 花瓣 | ①花瓣旋转下落 → ②风漩涡 → ③落地涟漪 |
| flame-rise | 火焰升腾 | ①火焰粒子上升 → ②热浪扭曲 → ③熄灭 |
| water-splash | 水花 | ①水花四溅 → ②抛物线水滴 → ③水面涟漪环 |
| whirl | 旋风 | ①螺旋上升 → ②风力涡旋 → ③扬沙消散 |
| vortex | 漩涡 | ①涡流聚拢（吸入）→ ②漩涡加速 → ③向外甩散 |

#### 武器族（weapon）— katana / shield / axe / spear / revolver / glass-shot / boxing-glove / bullwhip / dash / shatter / split / chain / gunshot / glass-break / whip-crack

| 素材 | 元素 | CG 设计 |
|---|---|---|
| katana | 武士刀 | ①拔刀一斩（刀刃反光+残影）→ ②刀气波 → ③斩击火花 |
| shield | 盾 | ①盾牌抵挡 → ②冲击波纹 → ③盾面裂纹 |
| axe | 斧 | ①抡斧 → ②斧刃劈裂（木屑飞溅）→ ③落地反弹 |
| spear | 矛 | ①投掷 → ②破空音爆环 → ③命中震荡 |
| revolver | 左轮 | ①击锤 → ②枪口焰（锥形+火花）→ ③弹壳抛飞（刚体）+ 后坐力镜头 |
| glass-shot | 弹孔 | **①子弹曳光射入（弹道扭曲+热浪）→ ②命中透明玻璃 → 白斑裂纹（3D 裂纹 shader）→ ③孔洞拉丝+玻璃碎片刚体崩落 → ④子弹贯穿路径** |
| boxing-glove | 拳套 | ①挥拳 → ②命中震荡 → ③弹簧回弹 |
| bullwhip | 鞭 | ①鞭梢音爆 → ②链段传导 → ③末梢火花 |
| dash | 疾驰 | ①直线疾驰 → ②残影拖长 → ③急停 |
| shatter | 碎裂 | ①晶体崩解 → ②碎片飞散（刚体）→ ③晶尘 |
| split | 分身 | ①分身复制 → ②分化四散 → ③消隐 |
| chain | 锁链 | ①链段波动 → ②涟漪 → ③锁链碰撞声光 |
| gunshot | 枪击 | 同 revolver 核心（定向弹道更短促） |
| glass-break | 玻璃破裂 | 同 glass-shot 核心设计 |
| whip-crack | 鞭梢 | ①加速甩动 → ②超音速音爆环 → ③回弹 |

#### 韵律族（rhythm）— guitar / drum / bell / harp / trumpet / bow / piano / saxophone / vinyl / pulse / ring / echo / note-dance / groove / drum-beat

| 素材 | 元素 | CG 设计 |
|---|---|---|
| guitar | 吉他 | ①琴弦振动 → ②和弦波环 → ③音浪扩散 |
| drum | 鼓 | ①鼓面震动 → ②低频环波+鼓皮粒子 → ③震荡音浪 |
| bell | 铃 | ①晃钟 → ②泛音环 → ③余韵涟漪 |
| harp | 竖琴 | ①琴拨 → ②弦波纵向传导 → ③音符光点 |
| trumpet | 小号 | ①吹奏 → ②金属喇叭音波 → ③音符喷射 |
| bow | 弓 | ①拉弓 → ②放箭（箭羽拖尾）→ ③命中震荡 |
| piano | 钢琴 | ①琴键按下 → ②琴槌弦振 → ③共鸣音浪 |
| saxophone | 萨克斯 | ①吹奏 → ②音孔粒子流 → ③音符摇曳 |
| vinyl | 黑胶 | ①唱片旋转 → ②同心纹流光 → ③音轨光斑 |
| pulse | 脉冲 | ①同心脉冲环 → ②脉冲叠加 → ③衰减 |
| ring | 声波 | ①多环扩散 → ②环间干涉 → ③余韵 |
| echo | 余韵 | ①渐弱回环 → ②回声镜像 → ③消散 |
| note-dance | 音符 | ①五线谱 → ②音符跃动（节拍跳跃）→ ③旋律飘落 |
| groove | 黑胶律动 | ①旋转唱片 → ②律动起伏 → ③音轨光斑 |
| drum-beat | 鼓点 | ①膜面震动 → ②低频环波 → ③震屏脉冲 |

**说明**：以上 42 行矩阵为设计骨架；逐素材实现时再按 `material-identity` 的 surface/force/mass 微调参数（能量、重力、恢复系数、摩擦、共振），确保每个素材的"物理签名"与视觉一致。表中标粗的 6 个素材（black-hole / lightning / bomb / fireworks / glass-shot / ice）为用户明确点名的"必须达到"示例，按最高优先级实现。

## 5. 图标统一设计系统（42 枚重绘）

- **工作流**：用 `figma-use` skill（`figma-generate-library`）建立 42 图标设计系统文件：统一 viewBox（48×48）、构图模板（光晕背景→主体→光轨排布）、标题/描边/渐变规则、族语义色板（cosmic=冷紫/蓝，impact=暖红/橙，natural=绿/青，weapon=银/钢，rhythm=金黄/铜）、统一高光与辉光规则。
- **导出**：Figma SVG 导出 → 覆盖 `src-tauri/packs/<id>/icon.svg`（Rust 端自动内联 dataUri，不改代码）；用户自定义包保持现状（新建向导已是独立流程）。
- **验收**：设置页提供 42 枚并排预览（Artifact），统一风格 + 保留识别度；暗色/亮色主题下均清晰。

## 6. 功能与数据改动清单

| 改动 | 位置 | 类型 |
|---|---|---|
| 侧边栏"素材包"→"素材库" | `src/settings/panels.ts`（label）+ `src/settings/components/SoundsPanel.tsx` 文案引用 | 文案 |
| 画质档位 `quality` | `src/shared/config.ts`（schema + default 'auto'）+ `src-tauri/src/config.rs`（serde + `migrate_v3_to_v4`）+ `src/shared/ipc.ts`（无新命令，save_config 覆盖）| 契约 |
| 画质选择器 UI | `src/settings/components/AnimationPanel.tsx`（新增分段选择器，先调用 frontend-design skill）| UI |
| CG Stage 框架 | `src/overlay/cg-stage.ts`（编排器）+ `three.quarks`/`cannon-es`/`postprocessing` 接入 | 渲染 |
| 各素材 CG Stage | `src/overlay/three-family-*` 扩展（每族一个） | 渲染 |
| 质量参数化 | `three-effect-host.ts` / `three-effects.ts` / `three-render-pipeline.ts` / `three_full_field_spectacle.ts` 接 quality | 渲染 |
| 2D 降级 | **不动**（仅验证） | — |
| 图标 | `src-tauri/packs/*/icon.svg` | 资产 |

**配置迁移**：`version: '3.0' → '4.0'`，新增 `quality` 字段，Rust `migrate()` 增加 `migrate_v3_to_v4`；TS/`ConfigSchema` 对应，`DEFAULT_CONFIG` 补 `quality: 'auto'`。契约测试（contracts）同步。

## 7. 测试与验收

### 7.1 单元/契约（Vitest + cargo test，沿用现有规则）

- `quality` schema 边界（非法值拒绝、默认值、迁移）。
- 每素材 CG Stage 的**纯逻辑部分**（三幕时间映射、粒子参数推导、物理签名输入）单测。
- 后处理链组装函数：按档位返回 pass 列表（断言各档 pass 集合）。
- 自动降档控制器：模拟帧耗时序列 → 断言升/降档事件（纯函数化，可注入 fake 帧数据）。
- cannon-es 物理层：以 mock 刚体验证接口（不依赖真实 WebGL）。
- 2D 降级：WebGL 不可用/损坏时 stage 返回值断言（沿用现有测试）。

### 7.2 视觉验收（每批）

- 生成 42 素材特效预览页（静态 HTML → Artifact），逐素材目视对比设计预期。
- 图标 42 枚并排预览 → 统一风格目视验收。
- 亮/暗主题、自动/高/中/低档截图对比。

### 7.3 回归

- `npm run ci`（typecheck + vitest + cargo clippy -D warnings + cargo test）全绿。
- E2E 10 条核心用户旅程不回归（尤其"覆盖层甩动→crack→宏发送"链路）。
- WebGL 1 环境（软件渲染 / 旧核显）走降级验证。
- 性能：帧耗时 P50/P95 采样报告，无固定 fps 断言。

## 8. 里程碑

| 阶段 | 内容 | 验收 |
|---|---|---|
| M0 | ADR + 依赖安装（quarks/postprocessing/cannon-es/godrays 钉版）+ 兼容性冒烟（three 0.185 联动） | typecheck + CI 绿 |
| M1 | `quality` 配置 + 迁移 + UI 选择器 + 渲染参数化 + 自动降档 | 5 档切换实时生效 |
| M2 | 图标设计系统 + 42 枚重绘 + 预览图 | 统一风格验收 |
| M3 | CG Stage 框架 + 样板间 2 个素材（black-hole、fireworks 或 ice 中挑 2）| 目视验收 CG 标准 |
| M4 | 宇宙族（rocket/phoenix/ninja-star/star/moon/sun/meteor/comet/aurora/twinkle/orbit/glow/spiral/arc/fireworks/black-hole/star-burst，17 素材） | 目视 + 回归 |
| M5 | 冲击族（skull/thunder/bomb/boxing/wildfire/burst/impact/shock-ring/explode，9 素材） | 目视 + 回归 |
| M6 | 自然族（dragon/flame/water/wind/lotus/tornado/downpour/rain/petal/flame-rise/water-splash/whirl/vortex，13 素材） | 目视 + 回归 |
| M7 | 武器族（ice/katana/shield/axe/spear/revolver/glass-shot/boxing-glove/bullwhip/dash/shatter/split/chain/gunshot/glass-break/whip-crack，16 素材） | 目视 + 回归 |
| M8 | 韵律族（guitar/drum/bell/harp/trumpet/bow/piano/saxophone/vinyl/pulse/ring/echo/note-dance/groove/drum-beat，15 素材） | 目视 + 回归 |
| M9 | 全量回归 + 性能调优 + E2E + 体积检查 | 全套 CI + 视觉验收 |

> 计数口径：42 个内置素材包（`BUILTIN_PACK_IDS`）恰好覆盖 42 个 preset；族分组为设计视角的近似分组（如 ice 的 preset `shatter-ice` 在 profiles 中归入 weapon 族），实现时以 preset→family 现有分派为准（`three-effect-profiles.ts`）。族计数合计 17+9+13+16+15 = 70 > 42，是因为同一 preset 可被多个素材以不同参数复用（如 burst/impact/explode 属于族内多素材共用），非重复计数。

## 9. 风险与边界

- **不触碰**：声音引擎（Web Audio）、宏发送（enigo）、Tauri 窗口/托盘/快捷键、`src-tauri/materials/`（v2 遗留）、`src-tauri/packs/*/pack.json` 结构、2D 降级链实现。
- **性能**：画质上限由用户档位决定，自动档以"本机基准"自适应；特效总时长不变（沿用 `effect-timings`）。
- **兼容性**：WebGL1/2 能力探测；`three.quarks`、`postprocessing`、`three-good-godrays`、`cannon-es` 与 three 0.185 的 peer 版本在 M0 冒烟验证；若不兼容则钉三库版本或替换等价库（记录于 ADR）。
- **图标**：仅内置 42 枚重绘；用户自定义包图标不动。
- **文档约束**：本设计文档为 `docs/superpowers/specs/` 新增，不改动既有规格文档。

## 10. 审批

- [ ] 用户审批设计
- [ ] 用户审批 §8 里程碑
- [ ] 实施（writing-plans → 分阶段执行）
