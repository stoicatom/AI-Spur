# ADR-003：CG 级特效技术栈（three.quarks / postprocessing / cannon-es / three-good-godrays）

**日期：** 2026-08-28
**状态：** 已接受（Accepted）
**决策者：** lorain
**关联规格：** `docs/superpowers/specs/2026-08-28-material-cg-effects-design.md` §2 技术选型
**关联计划：** `docs/superpowers/plans/2026-08-28-cg-effect-plan-a.md` Task A1

---

## 背景

42 个内置素材当前各有一个专属 Three.js 程序化特效场景（`three-family-*` 五大族分派），但实现停留在"基础几何近似"层级：闪电是圆柱折线段、黑洞是 torus 环 + 尘埃、爆炸是 icosahedron 火球 + 线框壳。视觉可用，但与设计规格要求的"3D 动漫 CG 级"存在明显差距。

设计规格明确了本轮重建的两条硬性约束（用户确认）：

1. **必须使用专业第三方 3D 库完成，禁止自研引擎。**
2. 42 个素材每个都要达到 CG 级视觉：物理特性、运动复杂度、元素多样性、多元素互动、全屏性、视觉逼真性。

要在不自研引擎的前提下达到这个层级，缺口是四类**引擎级能力**：GPU 粒子、电影级后处理链、刚体物理、体积光。`three` 本体不提供其中任何一项的成品实现（`examples/jsm` 的 `UnrealBloomPass` 只是单一 pass，不构成后处理链管理；无粒子系统、无物理、无 raymarch 体积光）。

## 决策

**保留 `three@0.185` 为渲染引擎底层**（它本身就是业界标准专业 3D 库，`ADR-001` 选定的 Tauri + WebView 架构不变），在其上叠加四个专业特效库：

| 库 | 钉版 | 实测安装版本 | 用途 | 许可 |
|---|---|---|---|---|
| `three.quarks` | `^0.17` | 0.17.1 | **GPU 粒子引擎**：火焰、烟雾、雪花、火花、流光、碎片、花瓣、音符等全部粒子层 | MIT |
| `postprocessing`（pmndrs） | `^6.39.4` | 6.39.4 | **电影级后处理链**：Bloom、GodRays、SSAO、DepthOfField、ChromaticAberration、Vignette、SMAA、LUT 色彩分级、胶片颗粒 | Zlib |
| `cannon-es`（pmndrs） | `^0.20` | 0.20.0 | **刚体物理**：玻璃碎片、弹片、碎石、弹壳的真实碰撞/重力/反弹 | MIT |
| `three-good-godrays` | `^0.12` | 0.12.1 | **屏幕空间 raymarch 体积光**：黑洞透镜、爆炸闪光、闪电氛围、烟花光柱 | Zlib 风格（Casey Primozic，允许商用） |

## 选型理由

### three.quarks — GPU 粒子

- **声明式 emitter**：`ParticleSystem` + 形状发射器（`ConeEmitter` / `SphereEmitter` / `DonutEmitter` / `CircleEmitter` / `RectangleEmitter` / `GridEmitter` / `HemisphereEmitter` / `PointEmitter` / `MeshSurfaceEmitter`）+ 行为链（拖尾 / 湍流 / 重力 / 碰撞力场），正是"每场景 5~10 个专属 emitter"这种配方式编排需要的形态。
- **实例化级性能**：`BatchedRenderer` 把多个粒子系统合批，粒子数量上限可随画质档位缩放（规格 §3.1 粒子乘数 1.00×→0.30×）。
- **独立于 three 小版本**：peer 声明 `three >= 0.182.0`，与现有 0.185.1 相容，不锁死 three 升级路径。

### postprocessing — 后处理链

- three.js 生态的**事实标准**后处理库，pass 即插即用，替代手写复合 `examples/jsm` 栈。
- 规格 §3.1 要求"每档装配不同 pass 列表"（电影级全链 / 高档 Bloom+色散+颗粒+SMAA / 中档 Bloom+SMAA / 低档仅 SMAA）。`postprocessing` 的 `EffectComposer` + `EffectPass` 支持把多个 effect 合并进单一 pass，档位切换只需重装 effect 数组，比 `examples/jsm` 的一 pass 一 draw 更省 GPU。
- 现有 `CinematicRenderPipeline`（`src/overlay/three-render-pipeline.ts`）用的是 `three/examples/jsm` 的 `EffectComposer` + `UnrealBloomPass` + `OutputPass`。两套 composer **不混用**：Task A7 将该文件整体迁移到 `postprocessing`，迁移前 legacy 路径保持原状。

### cannon-es — 刚体物理

- 轻量纯 JS（338 KB 未压缩），与 three 无耦合（只需同步 body → mesh 的 position/quaternion），在 Vitest 里可直接实例化、可 mock。
- 规格中 crystal（晶屑四面体刚体）、glass-shot、bomb（弹片）、skull（骨屑）、rocket（燃料碎屑落台弹跳）等场景都要求"真实碰撞反弹"，参数化轨道无法替代。
- 无 peer 依赖，不参与 three 版本约束。

### three-good-godrays — raymarch 体积光

- 专为 `postprocessing` 编写（peer `postprocessing ^6.33.4`），作为 `Pass` 直接插入同一 composer，无需第二套渲染管线。
- 定位是**补位库**：`postprocessing` 自带的 `GodRaysEffect` 是廉价的屏幕空间径向模糊；`GodraysPass` 是真 raymarch + shadow map 采样，用于黑洞透镜、闪电云内暗闪这类必须"光穿过几何体"的场景。两者按场景需要择一，不同时启用。

## 禁止自研的边界（宪法记录）

规格 §2 的边界原则，在此固化为约束：

- **引擎级能力必须来自上表专业库。** 不得自行实现：粒子系统（发射/生命周期/合批）、后处理链管理（composer/pass 调度）、刚体碰撞求解、体积光 raymarch。
- **逐素材"特效配方"不构成自研引擎。** 每素材的 `CgStage` 编排（入场→主幕→多元素互动→消隐）、`ShaderMaterial` 材质（吸积盘、FBM 乌云、水面、星云）、`GPUComputationRenderer` 模拟场，均属于 **Three.js 公开编程接口上的组合描述**，与行业 CG 制作方式（Houdini/UE 里搭 graph）一致，允许且必要。
- **判定口径**：如果一段代码在写"通用的、与素材无关的引擎机制"，它应该来自库；如果在写"这个素材长什么样、怎么动"，它是配方。

## 兼容性

### 版本兼容矩阵（three@0.185.1）

| 库 | peer 声明 | 与 three@0.185.1 | 结论 |
|---|---|---|---|
| `three.quarks@0.17.1` | `three >= 0.182.0` | ✅ 满足 | 无冲突 |
| `postprocessing@6.39.4` | `three >= 0.168.0 < 0.186.0` | ✅ 满足 | 无冲突 |
| `cannon-es@0.20.0` | 无 peer | ✅ 无关 | 无冲突 |
| `three-good-godrays@0.12.1` | `three >= 0.125.0 <= 0.182.0` | ⚠️ **声明上限 0.182，实际 0.185.1** | 已实测通过，见下 |

### three-good-godrays peer 上限超出的处置

安装时 pnpm 报 `unmet peer three@">= 0.125.0 <= 0.182.0": found 0.185.1`。**处置为接受该警告**，理由与证据：

1. **仅为警告，不阻断安装。** pnpm 10 默认 `strict-peer-dependencies=false`，无需 `--no-strict-peer-dependencies` 或任何额外 flag；`pnpm install --frozen-lockfile`（CI 用法，`.github/workflows/ci.yml` 三处）实测 `Lockfile is up to date / Already up to date`，CI 不会因此失败。
2. **实测可构造。** 在 three@0.185.1 下 `new GodraysPass(pointLight, camera)` 构造成功，未抛异常。该库依赖的 three API 面很窄（`Pass` 基类经由 `postprocessing`、shadow map、`PointLight`/`DirectionalLight`），0.182→0.185 未变更这些接口。
3. **上限是保守声明**，而非已知不兼容记录（上游未发布 0.185 兼容版本，peer 范围是发版时的快照）。

**回退路径（若日后实测出问题）**：优先降级为 `postprocessing` 自带的 `GodRaysEffect`（同 composer，无第三方 peer 约束，视觉档次略降但功能完整）；其次评估 `@react-three/postprocessing` 生态内的体积光实现或 `n8python/goodGodRays` 上游原版。体积光在架构上是**可选层**（规格 §3.1：中/低档关闭体积光），因此其失效不影响任何素材的功能可用性，只影响电影/高档的视觉上限。

### TypeScript 导入验证

Task A1 Step 2 冒烟测试（项目 `tsconfig.json`，`strict` + `moduleResolution: bundler`）通过，且 Node ESM 运行时导入全部成功。**实际 API 名与计划文件的差异（按计划 §Global Constraints 要求在此记录）**：

| 计划中写的 | 实际导出名 | 说明 |
|---|---|---|
| `import { Emitter } from 'three.quarks'` | 无 `Emitter`；发射器为具体形状类 `ConeEmitter` / `SphereEmitter` / `DonutEmitter` / `CircleEmitter` / `RectangleEmitter` / `GridEmitter` / `HemisphereEmitter` / `PointEmitter` / `MeshSurfaceEmitter` | 形状发射器由 `quarks.core` 经 `three.quarks` re-export；`ParticleSystem` 名称一致 |
| `import { GodRays } from 'three-good-godrays'` | `GodraysPass`（另有 `GodraysUpsampleQuality`） | 该库仅导出这两个符号；后续场景代码统一用 `GodraysPass` |

`postprocessing` 侧计划列出的名称全部存在：`EffectComposer` / `EffectPass` / `RenderPass` / `BloomEffect` / `GodRaysEffect` / `SMAAEffect` / `ChromaticAberrationEffect` / `VignetteEffect`（另确认 `SSAOEffect` 可用）。`cannon-es` 以 `import * as CANNON` 命名空间导入，`CANNON.World` 可用。

## 影响

- **`package.json` dependencies** 新增四项（运行时依赖，非 devDependencies —— 它们进渲染进程 bundle）。
- **打包体积**：四库未压缩合计约 1.18 MB（quarks 184 KB min-ESM / postprocessing 618 KB / cannon-es 338 KB / godrays 38 KB），tree-shaking + minify 后实际入包更小。设计规格 §0 第 6 条已确认**不限制应用体积**，`CLAUDE.md` §6 的"安装包体积 < 15MB"预算相应放宽（该放宽由规格授权，本 ADR 仅记录）。
- **性能预算**：规格 §0 第 7 条确认**不设固定 fps 下限**，以"最流畅"为准；替代指标为帧耗时 P50/P95 + 掉档计数（规格 §3.3）。五档画质与自动降档由 Task A2–A4、A7 落地。
- **降级链不动**：`ThreeEffectHost` 的 WebGL 失败 → 2D canvas 回退链路、声音、宏发送、Tauri 窗口生命周期全部保持原状（规格 §0 第 8 条）。低画质档与未注册 CG 场景的素材继续走现有 `CinematicLayers` legacy 路径。
- **`three/examples/jsm` 后处理**：`three-render-pipeline.ts` 现用的 jsm composer 在 Task A7 迁移至 `postprocessing`；迁移完成前两套并存但不在同一 composer 内混用。

## 拒绝的替代方案

| 方案 | 拒绝理由 |
|---|---|
| 只用 `three` + 自写粒子/后处理/物理 | 直接违反规格 §0 第 5 条"禁止自研引擎"；且现有"基础几何近似"的视觉差距正是自写路线的产物 |
| `three-nebula` 替代 three.quarks | 维护活跃度低于 quarks，无 GPU 合批（CPU 粒子），无法支撑"每场景 5~10 emitter × 42 场景" |
| `rapier`（`@dimforge/rapier3d`）替代 cannon-es | WASM 包体与初始化开销偏重，且需异步 init，与"crack 触发即时起特效"的时序不合；本轮刚体需求（数十个碎片）远未到需要 rapier 求解器性能的规模 |
| `ammo.js` 替代 cannon-es | Emscripten 产物体积大、TS 类型弱、测试中难 mock |
| 继续用 `three/examples/jsm` 后处理 | 无 effect 合并（一 pass 一 draw），无 SMAA/色散/颗粒/LUT 成品，档位化装配需大量手写胶水 |
