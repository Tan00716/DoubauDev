# 《烬堡 EMBERHOLD》Web 技术实现规格

> **文档定位**：将原 Unity 技术架构移植为 Web 技术栈（TypeScript + WebGL + Electron）的完整实现规格，供研发团队直接开工。  
> **版本**：v1.0  
> **日期**：2026-10-01  
> **对应上游文档**：
> 
> - 设计主文档 rev.26（游戏核心设计主文档）
> - 原技术架构文档 rev.7（Unity 版）
> - 设计审计报告 rev.5

---

## 摘要

本文档将《烬堡 EMBERHOLD》的技术实现路线从 Unity 移植为 Web 技术栈，核心目标是在**无法安装/运行 Unity 编辑器**的开发约束下，实现一套可全程开发-运行-验证-在线试玩的技术方案，最终通过 Electron 打包为 Steam 可上架的 Windows 构建。

**三大定案**：

1. **渲染层**：WebGL（Three.js）负责 2.5D 场景渲染，HTML/CSS 负责 UI 层；Canvas 2D 仅在特定 2D 特效场景作为补充。
2. **数据架构**：全部内容 JSON 数据驱动，Schema 与校验方案对齐设计主文档 23 张数据表；无头模拟器可直接读取并跑批量对局。
3. **性能路线**：对象池 + 空间分区 + Three.js InstancedMesh 实现 GPU 合批等价物；流场寻路在 Web Worker 中异步计算。

---

## 1. 技术栈定案与理由

### 1.1 渲染层定案：WebGL（Three.js）+ DOM UI

#### Canvas 2D 与 WebGL 的取舍结论

| 维度 | Canvas 2D | WebGL (Three.js) | 本项目结论 |
|-|-|-|-|
| 同屏实体渲染 | ≤500 精灵时流畅；无原生 Instancing | InstancedMesh 支持千级实例合批 | **WebGL**：230 实体预算需要合批 |
| 2.5D 低多边形 | 只能伪 3D（2D 精灵堆叠），表现力弱 | 原生 3D 正交投影，低多边形直接可用 | **WebGL**：设计主文档定案 2.5D 风格 |
| 粒子特效 | 粒子数 >200 时 CPU 瓶颈 | GPU 粒子系统，无数量级瓶颈 | **WebGL**：特效预算 200 粒子 + 8 大型效果位 |
| 后处理（昼夜 LUT） | 不支持 LUT / Color Grading | 后处理管线支持 LUT 插值 | **WebGL**：昼夜 5 秒渐变是核心体验 |
| 学习曲线 | 极低 | 中等（但低于 Unity） | WebGL 学习成本 < Unity，团队可承受 |
| 与 UI 集成 | 需自研 UI 系统 | HTML/CSS DOM 可直接覆盖 | DOM UI 是 Web 栈独有优势 |
| 资产兼容性 | 2D 精灵 / 精灵图 | glTF / OBJ / 低多边形模型 | 需 3D 资产工作流，但 AI 3D 工具已成熟 |

**取舍结论**：主场景渲染全部采用 **WebGL（Three.js）**，利用其 InstancedMesh、后处理管线、正交相机实现 2.5D 低多边形渲染。Canvas 2D 仅在「小地图」「局部 2D 特效」场景作为补充，不做主渲染路径。

#### UI 层定案：HTML/CSS（DOM）而非 Canvas UI

Unity 的 UI 系统（UGUI）在 Web 栈中的等价物有两个选择：

1. **Canvas 2D 内嵌 UI**：所有 UI 在 WebGL 画布上绘制，需自研事件系统、布局引擎、字体渲染。
2. **HTML/CSS DOM UI**：HUD、手牌、建造轮盘、菜单全部用 DOM 实现，WebGL 画布仅渲染游戏场景。

**定案：HTML/CSS DOM UI**，理由：

- DOM 的响应式布局、动画、字体渲染、无障碍支持远胜自研 Canvas UI
- 手牌系统（5 张卡 + 抽牌动画）用 CSS transition 实现成本低、效果佳
- 建造轮盘的弧形布局用 CSS `conic-gradient` + `transform` 即可实现
- DOM 与 WebGL 通过 `position: absolute` 叠加，透明区域点击穿透用 `pointer-events` 控制
- 本地化（中/英/日三语）用 DOM 的 `lang` 属性 + CSS `:lang()` 选择器，无需自研文本系统

#### Three.js 具体选型

| 组件 | 选型 | 理由 |
|-|-|-|
| 核心渲染 | Three.js r160+ | 社区最大、文档最完善、正交相机成熟 |
| 后处理 | @react-three/postprocessing（或原生 EffectComposer） | LUT 插值、Bloom、Vignette 实现昼夜切换 |
| 粒子系统 | Three.js Points + 自定义 Shader | 200 粒子预算用 Points 即可，无需重引擎 |
| 模型格式 | glTF 2.0 | Web 标准格式，AI 3D 工具（Meshy、Rodin）直接输出 |
| 资源加载 | 自定义 AssetLoader（基于 fetch + THREE.GLTFLoader） | 轻量，无需 Addressables 等价物 |
| 输入系统 | 原生 Pointer Events + Gamepad API | 同时支持键鼠与手柄，无需额外库 |

### 1.2 构建工具链

| 环节 | 工具 | 配置要点 |
|-|-|-|
| 语言 | TypeScript 5.5+ | `strict: true`，目标 `ES2022` |
| 构建工具 | Vite 5+ | 开发服务器 HMR <100ms；生产 Rollup 打包；`@vitejs/plugin-react` 可选（UI 层） |
| 包管理 | npm / pnpm | 锁定版本，避免漂移 |
| 代码质量 | ESLint + Prettier + TypeScript 严格模式 | 统一编码风格，AI 生成代码可直接通过 Lint |
| 模块规范 | ES Modules | tree-shaking 友好 |
| 调试 | Chrome DevTools + Three.js Inspector 插件 | 场景图、材质、纹理、Draw Call 实时查看 |

**为什么选 Vite 而非 Webpack**：Vite 的冷启动和热更新速度是 Webpack 的 10 倍以上，对于「开发-验证-在线试玩」的快速循环至关重要。AI 生成代码后需要立即在浏览器中看到效果，Vite 的 HMR 能满足这一需求。

### 1.3 测试框架

| 测试类型 | 工具 | 用途 |
|-|-|-|
| 单元测试 | Vitest | 数据校验、效果计算、经济公式、工具函数 |
| 集成测试 | Vitest + jsdom | 模块交互、事件总线、存档/读档一致性 |
| E2E 测试 | Playwright | UI 交互、完整对局流程 |
| 性能测试 | Chrome Lighthouse + 自定义 Profiler | 帧率、内存、Draw Call |
| 无头模拟器 | Node.js + 自研 Simulator | 批量跑 1000 局，输出数值报表（见第 6 章） |

### 1.4 模块划分与代码组织

```
emberhold/
├── src/
│   ├── core/                    # 核心系统（无游戏业务逻辑）
│   │   ├── event-bus.ts         # 事件总线（替代 Unity Event Bus）
│   │   ├── save-load.ts         # 存档/读档系统
│   │   ├── input-manager.ts     # 输入管理（键鼠+手柄）
│   │   ├── settings.ts          # 设置管理
│   │   ├── localization.ts      # 本地化
│   │   └── pool.ts              # 通用对象池
│   ├── gameplay/                # 玩法层
│   │   ├── day-night-cycle.ts   # 昼夜循环控制器
│   │   ├── squad-manager.ts     # 班级管理（12 班）
│   │   ├── building-manager.ts  # 建筑管理
│   │   ├── card-system.ts       # 双层牌库
│   │   ├── combat-manager.ts    # 战斗管理（波次/接敌/战意）
│   │   ├── commander-system.ts  # 指挥官系统
│   │   ├── economy-manager.ts   # 经济系统
│   │   └── enemy-manager.ts     # 敌人管理
│   ├── content/                 # 内容层（纯数据接口）
│   │   ├── schemas/             # JSON Schema 定义
│   │   ├── registry.ts          # 数据注册表
│   │   └── validators/          # 数据校验器
│   ├── renderer/                # 渲染层
│   │   ├── scene.ts             # Three.js 场景管理
│   │   ├── camera.ts            # 正交相机 + 3 档缩放
│   │   ├── instanced-units.ts   # InstancedMesh 单位渲染
│   │   ├── effects.ts           # 粒子池 + Shader 效果
│   │   └── post-process.ts      # 后处理（昼夜 LUT）
│   ├── infrastructure/          # 基础设施
│   │   ├── pathfinding/         # 寻路（A* + 流场 + RVO）
│   │   │   ├── astar.ts
│   │   │   ├── flow-field.ts
│   │   │   └── rvo.ts
│   │   ├── behavior-tree/       # 班级 AI 行为树
│   │   └── spatial-grid.ts      # 空间分区
│   ├── ui/                      # UI 层（HTML/CSS/TS）
│   │   ├── hud/                 # HUD 组件
│   │   ├── card-ui/             # 手牌 UI
│   │   ├── build-wheel/         # 建造轮盘
│   │   └── menus/               # 菜单系统
│   ├── simulator/               # 无头战斗模拟器
│   │   ├── simulator.ts
│   │   └── reporters/
│   └── main.ts                  # 入口
├── assets/                      # 游戏资源
│   ├── models/                  # glTF 模型（低多边形）
│   ├── textures/                # 手绘纹理
│   ├── data/                    # JSON 数据文件（卡牌/单位/建筑/敌人/Boss/法则/战旗/事件）
│   ├── shaders/                 # 自定义 Shader
│   └── luts/                    # 昼夜 LUT 纹理
├── tests/                       # 测试文件
├── electron/                    # Electron 主进程
│   ├── main.ts                  # Electron 入口
│   └── preload.ts               # 预加载脚本
├── vite.config.ts
├── tsconfig.json
└── package.json
```

#### 模块依赖规则（与原 Unity 架构文档一致）

- `renderer/` → 只能依赖 `gameplay/` 和 `core/`
- `gameplay/` → 只能依赖 `content/` 和 `core/`，模块间通过 `core/event-bus.ts` 解耦
- `content/` → 无依赖，纯 TypeScript 接口 + JSON 数据
- `core/` → 无依赖，可被任何上层调用
- `infrastructure/` → 无依赖，服务化设计
- `ui/` → 依赖 `gameplay/` 和 `core/`，通过事件总线接收状态更新

---

## 2. 数据驱动架构移植

### 2.1 数据分层与 Schema 规范

原 Unity 架构使用 ScriptableObject (.asset) + JSON 双轨。Web 栈中 ScriptableObject 无直接等价物，**全部采用 JSON 数据驱动**，代码层通过 TypeScript 接口读取并执行。

| 层级 | 原 Unity 方案 | Web 移植方案 | 编辑者 |
|-|-|-|-|
| 静态数据 | ScriptableObject (.asset) + JSON | **纯 JSON + TypeScript 接口** | 策划 + AI 生成 |
| 运行时数据 | C# Class 实例 | TypeScript Class 实例 | 运行时 |
| 存档数据 | JSON 文件 | JSON 文件（格式兼容，可直接移植 Unity 版存档结构） | 系统自动 |
| 配置数据 | JSON | JSON | 策划 |

#### 统一数据 ID 规范（继承自原架构）

所有内容条目使用 `snake_case` ID，全局唯一：

- 单位：`unit_shieldbearer`、`unit_archer_a`（A 分支）、`unit_archer_b`（B 分支）
- 卡牌：`card_unit_cavalry`、`card_tactic_fire_oil`、`card_formation_turtle`
- 建筑：`building_wall`、`building_arrow_tower`
- 敌人：`enemy_shield_crusher`、`enemy_burrower`
- Boss：`boss_city_breaker`、`boss_tide_mother`
- 法则：`law_longer_night`、`law_fog_night`
- 战旗：`banner_night_recycle`、`banner_ember_economy`

### 2.2 Card JSON Schema

```typescript
// src/content/schemas/card.ts

export type CardLayer = 'armory' | 'tactic';
export type CardCategory = 'unit' | 'building' | 'tactic' | 'formation' | 'edict';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type TargetType = 'self' | 'squad' | 'building' | 'terrain' | 'enemy' | 'global';

export interface EffectData {
  type: string;           // 效果类型标识，如 "damage", "heal", "buff", "spawn", "modify_terrain"
  params: Record<string, number | string | boolean>;  // 效果参数
}

export interface CardData {
  card_id: string;           // 唯一 ID，如 "card_unit_cavalry"
  card_name: string;         // 显示名称（键，用于本地化）
  name_key: string;          // 本地化键
  layer: CardLayer;          // Armory（落阵层）/ Tactic（循环层）
  category: CardCategory;    // 单位/建筑/战术/阵型/遗令
  cost_day: number;          // 白天金币费用（Armory 卡）
  cost_night: number;        // 夜间战意费用（战术卡）或应急增援倍率基数（Armory 卡夜间打出 = cost_day * 1.5）
  effect_description: string; // 效果描述（键）
  effects: EffectData[];     // 效果列表（数据驱动执行）
  target_type: TargetType;
  duration: number;          // 持续时长（秒），0 = 即时
  rarity: Rarity;
  upgrade_branch_a_id: string | null;  // A 分支升级目标 ID
  upgrade_branch_b_id: string | null;  // B 分支升级目标 ID
  synergy_tags: string[];    // 协同标签：fire / ice / archer / fortification...
  counterplay_tags: string[]; // 反制标签
  illustration_path: string; // 卡面插图路径（相对 assets/）
}
```

**对齐设计主文档**：

- 双层牌库：通过 `layer` 字段区分军械册（`armory`）与战术手牌（`tactic`）
- 应急增援规则：`cost_night` 对 Armory 卡 = `cost_day * 1.5`（战意），夜末进入「受损归营堆」
- 每张卡设计字段：Cost / Effect / Target / Duration / Rarity / Upgrade / Synergy / Counterplay，全部覆盖
- 初始卡池 60 张（普通 24 / 稀有 20 / 史诗 12 / 传说 4），全量池 200 张

### 2.3 Unit JSON Schema

```typescript
// src/content/schemas/unit.ts

export type UnitRole = 'shield' | 'pike' | 'archer' | 'cavalry' | 'engineer' | 'healer' | 'mage' | 'behemoth';
export type DefenseType = 'heavy' | 'medium' | 'light' | 'none';

export interface UnitData {
  unit_id: string;           // 如 "unit_shieldbearer"
  unit_name: string;
  name_key: string;
  role: UnitRole;
  squad_size: number;        // 3–8，视觉单位数
  military_cost: number;     // 军令消耗 1–3
  max_health: number;
  attack_damage: number;
  attack_range: number;
  attack_speed: number;      // 攻击间隔（秒）
  defense_type: DefenseType;
  move_speed: number;        // 单位/秒
  passive_skill_id: string | null;
  active_skill_id: string | null;
  branch_a_id: string | null;
  branch_b_id: string | null;
  synergy_tags: string[];
  model_path: string;        // glTF 模型路径
}
```

**新增（审计报告阻断-002 修复）**：`unit_undead_squad` 亡灵班数据：

```json
{
  "unit_id": "unit_undead_squad",
  "unit_name": "亡灵班",
  "name_key": "unit_undead_squad_name",
  "role": "mage",
  "squad_size": 4,
  "military_cost": 1,
  "max_health": 40,
  "attack_damage": 8,
  "attack_range": 1.5,
  "attack_speed": 1.2,
  "defense_type": "none",
  "move_speed": 3.0,
  "passive_skill_id": "skill_undead_dissipate",
  "active_skill_id": null,
  "branch_a_id": null,
  "branch_b_id": null,
  "synergy_tags": ["undead", "summon", "morgan"],
  "model_path": "models/unit_undead_squad.gltf"
}
```

### 2.4 Building JSON Schema

```typescript
// src/content/schemas/building.ts

export type BuildingCategory = 'defense' | 'offense' | 'support' | 'utility';

export interface BuildingData {
  building_id: string;       // 如 "building_wall"
  building_name: string;
  name_key: string;
  category: BuildingCategory;
  work_cost: number;         // 工令消耗
  gold_cost: number;
  max_durability: number;
  build_time: number;        // 白天建造时间（秒）
  can_repair_at_night: boolean; // 是否允许夜间修复
  branch_a_id: string | null;
  branch_b_id: string | null;
  synergy_tags: string[];
  passive_effects: EffectData[];
  model_path: string;
}
```

**新增（审计报告阻断-002 修复）**：`building_sentinel_altar` 哨兵傀儡祭坛：

```json
{
  "building_id": "building_sentinel_altar",
  "building_name": "哨兵傀儡祭坛",
  "name_key": "building_sentinel_altar_name",
  "category": "support",
  "work_cost": 2,
  "gold_cost": 80,
  "max_durability": 120,
  "build_time": 3.0,
  "can_repair_at_night": false,
  "branch_a_id": null,
  "branch_b_id": null,
  "synergy_tags": ["summon", "sentinel", "swarm"],
  "passive_effects": [
    { "type": "periodic_spawn", "params": { "unit_id": "unit_sentinel_puppet", "interval": 15, "max_active": 6 } }
  ],
  "model_path": "models/building_sentinel_altar.gltf"
}
```

### 2.5 Enemy JSON Schema

```typescript
// src/content/schemas/enemy.ts

export type EnemyType = 'tank' | 'swarm' | 'assassin' | 'siege' | 'anti_tower' | 'anti_army' | 'ranged' | 'healer' | 'summoner';
export type TargetPriority = 'wall' | 'tower' | 'main_keep' | 'squad';

export interface EnemyData {
  enemy_id: string;          // 如 "enemy_shield_crusher"
  enemy_name: string;
  name_key: string;
  type: EnemyType;
  max_health: number;
  damage: number;
  attack_range: number;
  move_speed: number;
  target_priority: TargetPriority;
  special_ability_id: string | null;  // 掘地/飞行/治疗/召唤等
  countered_by: string[];    // 被哪些 unit_id / card_id / building_id 克制
  model_path: string;
}
```

### 2.6 Commander JSON Schema

```typescript
// src/content/schemas/commander.ts

export interface CommanderData {
  commander_id: string;      // 如 "commander_oen"
  commander_name: string;
  name_key: string;
  passive_rule: string;      // 规则改写描述（键）
  passive_effects: EffectData[];
  ultimate_skill_id: string;
  ultimate_cooldown: number; // 冷却：每夜一次 = 夜间阶段重置
  starting_bonus: EffectData[];
  starting_cost: EffectData[];
  build_identity: string[];  // 适配的 Build 标签
  unlock_condition: string;  // 解锁条件描述（键）
  exclusive_cards: string[]; // 专属卡牌 ID 列表
  model_path: string;
}
```

### 2.7 Talent / WarBanner / Law / Event JSON Schema

```typescript
// src/content/schemas/warbanner.ts
export interface WarBannerData {
  banner_id: string;
  banner_name: string;
  name_key: string;
  effect_description: string;
  effects: EffectData[];
  rarity: Rarity;
}

// src/content/schemas/law.ts
export interface LawData {
  law_id: string;
  law_name: string;
  name_key: string;
  effect_description: string;
  effects: EffectData[];
  difficulty_tier: number;   // 0 = Normal, 2 = Hard, 4 = Expert, 6 = Wasteland
}

// src/content/schemas/event.ts
export interface EventData {
  event_id: string;
  event_name: string;
  name_key: string;
  description: string;
  choices: {
    choice_id: string;
    text_key: string;
    effects: EffectData[];
    risk_weight: number;
  }[];
}
```

### 2.8 Boss JSON Schema

```typescript
// src/content/schemas/boss.ts

export interface PhaseData {
  phase_index: number;
  health_threshold: number;  // 进入该阶段的血量阈值（百分比）
  rule_modifiers: EffectData[];
  special_abilities: string[];
}

export interface BossData {
  boss_id: string;
  boss_name: string;
  name_key: string;
  theme_description: string;
  phases: PhaseData[];
  rule_modifiers: EffectData[];  // 全局规则改写
  anti_build_tags: string[];     // 惩罚的 Build 标签
  reward_card_id: string | null;
  model_path: string;
}
```

### 2.9 数据校验方案

AI 批量生成 JSON 后，必须通过自动化验证。Web 栈中使用 **Zod** 作为 Schema 校验库（TypeScript 原生支持，比 JSON Schema 更类型安全）。

```typescript
// src/content/validators/card-validator.ts
import { z } from 'zod';

export const CardDataSchema = z.object({
  card_id: z.string().regex(/^[a-z0-9_]+$/),
  card_name: z.string().min(1),
  name_key: z.string().min(1),
  layer: z.enum(['armory', 'tactic']),
  category: z.enum(['unit', 'building', 'tactic', 'formation', 'edict']),
  cost_day: z.number().int().min(0).max(999),
  cost_night: z.number().int().min(0).max(999),
  effect_description: z.string(),
  effects: z.array(z.object({
    type: z.string(),
    params: z.record(z.union([z.number(), z.string(), z.boolean()]))
  })),
  target_type: z.enum(['self', 'squad', 'building', 'terrain', 'enemy', 'global']),
  duration: z.number().min(0),
  rarity: z.enum(['common', 'rare', 'epic', 'legendary']),
  upgrade_branch_a_id: z.string().nullable(),
  upgrade_branch_b_id: z.string().nullable(),
  synergy_tags: z.array(z.string()),
  counterplay_tags: z.array(z.string()),
  illustration_path: z.string(),
});

// 校验函数
export function validateCard(data: unknown): CardData {
  return CardDataSchema.parse(data);
}
```

#### 校验流水线（CI / 本地运行）

```bash
# package.json scripts
"validate:data": "tsx scripts/validate-all-data.ts"
```

`scripts/validate-all-data.ts` 执行：

1. **ID 唯一性检查**：遍历全部 JSON 文件，确保 `*_id` 全局唯一
2. **引用完整性检查**：`upgrade_branch_a_id`、`countered_by`、`reward_card_id` 等引用必须指向存在的条目
3. **数值范围检查**：费用、伤害、血量在预设范围（防止 AI 生成离谱数值）
4. **Tag 一致性检查**：`synergy_tags` 和 `counterplay_tags` 必须在预定义词典中
5. **资源存在检查**：`model_path`、`illustration_path` 指向的文件必须存在于 `assets/` 目录
6. **设计锚点检查**：检测是否存在 `+5%` 类数值（违反 Meta 零数值铁律时报错）
7. **Schema 校验**：全部 JSON 通过 Zod Schema 解析

### 2.10 无头模拟器直接读取

战斗数值模拟器（见第 6 章）作为一等交付物，必须能直接读取 JSON 数据：

```typescript
// src/simulator/simulator.ts
import { CardData, UnitData, BuildingData, EnemyData } from '../content/schemas';
import { loadAllData } from '../content/registry';

export class BattleSimulator {
  private cards: Map<string, CardData>;
  private units: Map<string, UnitData>;
  private buildings: Map<string, BuildingData>;
  private enemies: Map<string, EnemyData>;

  constructor(dataPath: string) {
    const allData = loadAllData(dataPath);  // 直接读取 assets/data/*.json
    this.cards = new Map(allData.cards.map(c => [c.card_id, c]));
    this.units = new Map(allData.units.map(u => [u.unit_id, u]));
    this.buildings = new Map(allData.buildings.map(b => [b.building_id, b]));
    this.enemies = new Map(allData.enemies.map(e => [e.enemy_id, e]));
  }

  // 无头跑昼夜循环，输出数值报表
  async runScenario(config: ScenarioConfig): Promise<SimulationReport> {
    // ... 实现见第 6 章
  }
}
```

---

## 3. 核心系统模块规格

### 3.1 昼夜双循环主循环

#### 状态机设计

```typescript
// src/gameplay/day-night-cycle.ts

export type Phase = 'day' | 'night' | 'transition' | 'settlement';

export class DayNightCycle {
  private currentPhase: Phase = 'day';
  private dayNumber: number = 1;
  private phaseTimer: number = 0;
  private readonly dayDuration: number = 90;      // 白天 90 秒（可跳过）
  private readonly nightDuration: number = 240;   // 夜间 240 秒（4 分钟，波次驱动）
  private readonly transitionDuration: number = 10; // 入夜过渡 10 秒

  // 设计主文档硬约束：存档粒度 = 昼夜边界
  // 技术实现：phase 切换时自动触发存档
  async transitionToNight(): Promise<void> {
    this.currentPhase = 'transition';
    await this.saveRunState();  // 昼夜边界存档
    await this.playNightTransition(); // 5 秒 LUT 渐变 + 10 秒威胁预演
    this.currentPhase = 'night';
    this.emit('night:start', { day: this.dayNumber });
  }

  async transitionToDay(): Promise<void> {
    this.currentPhase = 'settlement';
    await this.nightSettlement(); // 修复、召回、结算战勋、收取军饷
    await this.saveRunState();    // 昼夜边界存档
    this.dayNumber++;
    this.currentPhase = 'day';
    this.emit('day:start', { day: this.dayNumber });
  }
}
```

#### 昼夜色调切换实现（WebGL 后处理）

原 Unity 方案：URP Volume 的 Color Grading LUT 插值。  
Web 等价方案：Three.js 后处理管线中自定义 `LUTPass`。

```typescript
// src/renderer/post-process.ts
import { EffectComposer, RenderPass, ShaderPass } from 'three/examples/jsm/postprocessing';

export class PostProcessManager {
  private composer: EffectComposer;
  private lutPass: ShaderPass;
  private dayLut: THREE.DataTexture;
  private nightLut: THREE.DataTexture;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.lutPass = new ShaderPass(LUTShader);
    this.composer.addPass(this.lutPass);

    // 预加载 LUT 纹理（32x32x32 3D 纹理）
    this.dayLut = this.loadLut('assets/luts/day.cube');
    this.nightLut = this.loadLut('assets/luts/night.cube');
  }

  // 5 秒渐变切换
  async transitionToNight(duration: number = 5000): Promise<void> {
    await this.animateLut(this.dayLut, this.nightLut, duration);
  }

  render(): void {
    this.composer.render();
  }
}
```

### 3.2 双层牌库

#### 数据结构与规则映射

```typescript
// src/gameplay/card-system.ts

export interface ArmoryEntry {
  card_id: string;
  entity_id: string;         // 场上实体唯一 ID
  position: { x: number; y: number };
  health_ratio: number;      // 当前血量比例
  upgrade_branch: 'a' | 'b' | null;
  is_damaged: boolean;       // 是否来自受损归营堆
}

export interface TacticHand {
  cards: string[];           // 手牌中的 card_id 列表（上限 5）
  draw_pile: string[];       // 抽牌堆
  discard_pile: string[];    // 弃牌堆
  max_hand_size: number = 5;
}

export interface DamagedCamp {
  entries: ArmoryEntry[];    // 受损归营堆（应急增援夜末进入）
}

export class CardSystem {
  private armory: Map<string, ArmoryEntry> = new Map(); // 军械册（落阵层）
  private tactic: TacticHand;                           // 战术手牌（循环层）
  private damagedCamp: DamagedCamp = { entries: [] };   // 受损归营堆

  // 设计主文档硬约束：同名牌再次打出 = 对该实体执行升级
  playArmoryCard(cardId: string, position: { x: number; y: number }): boolean {
    const existing = this.findArmoryByCardId(cardId);
    if (existing) {
      // 升级逻辑：A/B 分支或规模 +50%
      return this.upgradeEntity(existing);
    } else {
      // 新建实体
      return this.spawnEntity(cardId, position);
    }
  }

  // 夜间应急增援：1.5 倍战意费用，夜末进入受损归营堆
  playEmergencyReinforcement(cardId: string, position: { x: number; y: number }): boolean {
    const cost = this.getNightCost(cardId); // cost_day * 1.5
    if (!this.consumeWarSpirit(cost)) return false;

    const entity = this.spawnEntity(cardId, position);
    entity.is_damaged = true; // 标记为应急增援，夜末进入受损归营堆
    return true;
  }

  // 夜末清算：应急增援实体进入受损归营堆
  nightSettlement(): void {
    for (const entry of this.armory.values()) {
      if (entry.is_damaged) {
        this.damagedCamp.entries.push({ ...entry, health_ratio: 0.5 });
        this.armory.delete(entry.entity_id);
      }
    }
  }

  // 白天修复：受损归营堆中的实体可花 50% 金币修复（半血入场）
  repairFromDamagedCamp(entityId: string): boolean {
    const idx = this.damagedCamp.entries.findIndex(e => e.entity_id === entityId);
    if (idx === -1) return false;
    const entry = this.damagedCamp.entries[idx];
    const repairCost = this.getDayCost(entry.card_id) * 0.5;
    if (!this.consumeGold(repairCost)) return false;

    entry.health_ratio = 0.5;
    entry.is_damaged = false;
    this.armory.set(entry.entity_id, entry);
    this.damagedCamp.entries.splice(idx, 1);
    return true;
  }

  // 战术手牌：夜间每 8 秒抽 1 张，波次间隙弃 2 抽 2
  tickNightDraw(deltaTime: number): void {
    this.drawTimer += deltaTime;
    if (this.drawTimer >= 8) {
      this.drawTimer = 0;
      this.drawTacticCard();
    }
  }
}
```

**审计报告阻断-001 修复映射**：应急增援实体夜末进入「受损归营堆」，次日白天可花 50% 金币修复。封闭了战意→金币的隐性兑换漏洞。

### 3.3 半自动战斗

#### 班级指令系统

```typescript
// src/gameplay/squad-manager.ts

export type SquadCommand = 'move' | 'retreat' | 'hold' | 'focus_fire';

export interface Squad {
  squad_id: string;
  unit_id: string;
  position: { x: number; y: number };
  formation: 'square' | 'line' | 'wedge';
  stance: 'front' | 'middle' | 'back';
  health_ratio: number;
  command: SquadCommand | null;
  command_target: { x: number; y: number } | string | null;
  is_retreating: boolean;    // 撤退中：5 秒内不产战意
}

export class SquadManager {
  private squads: Map<string, Squad> = new Map();
  private maxSquads: number = 12; // 设计硬约束：12 班上限

  // 玩家指令：以班为单位
  issueCommand(squadId: string, command: SquadCommand, target?: { x: number; y: number } | string): void {
    const squad = this.squads.get(squadId);
    if (!squad) return;

    squad.command = command;
    squad.command_target = target || null;

    if (command === 'retreat') {
      squad.is_retreating = true;
      setTimeout(() => { squad.is_retreating = false; }, 5000); // 5 秒撤退冷却
    }

    this.emit('squad:command', { squadId, command, target });
  }

  // 接敌产战意：已接敌且未撤退的班每秒 0.5 战意
  calculateWarSpiritGeneration(deltaTime: number): number {
    let total = 0;
    for (const squad of this.squads.values()) {
      if (squad.is_engaged && !squad.is_retreating) {
        total += 0.5 * deltaTime;
      }
    }
    return total;
  }
}
```

#### 战斗流程（波次驱动）

```typescript
// src/gameplay/combat-manager.ts

export interface Wave {
  wave_index: number;
  spawn_groups: SpawnGroup[];
  pre_spawn_delay: number;   // 波次开始前延迟（秒）
}

export interface SpawnGroup {
  enemy_id: string;
  count: number;
  spawn_point: { x: number; y: number };
  path_target: { x: number; y: number };
}

export class CombatManager {
  private waves: Wave[] = [];
  private currentWave: number = 0;
  private waveTimer: number = 0;
  private betweenWaveDelay: number = 15; // 波次间隙 15 秒

  // 入夜预演：提前 20 秒显示威胁预演条
  showThreatPreview(): void {
    const preview = this.generateThreatPreview();
    this.emit('combat:threat_preview', preview);
  }

  // 波次间隙：唯一可修墙 / 移位的夜间窗口
  isBetweenWaves(): boolean {
    return this.waveTimer > this.getCurrentWaveDuration() &&
           this.waveTimer < this.getCurrentWaveDuration() + this.betweenWaveDelay;
  }
}
```

### 3.4 流场寻路与性能方案

#### 对象池

```typescript
// src/core/pool.ts

export class ObjectPool<T> {
  private available: T[] = [];
  private inUse: Set<T> = new Set();
  private factory: () => T;
  private reset: (item: T) => void;

  constructor(factory: () => T, reset: (item: T) => void, initialSize: number = 50) {
    this.factory = factory;
    this.reset = reset;
    for (let i = 0; i < initialSize; i++) {
      this.available.push(factory());
    }
  }

  acquire(): T {
    let item = this.available.pop();
    if (!item) item = this.factory();
    this.reset(item);
    this.inUse.add(item);
    return item;
  }

  release(item: T): void {
    if (this.inUse.has(item)) {
      this.inUse.delete(item);
      this.available.push(item);
    }
  }
}

// 使用示例
const enemyPool = new ObjectPool<EnemyInstance>(
  () => new EnemyInstance(),
  (e) => { e.reset(); },
  200  // 初始池大小覆盖敌方峰值
);
```

#### 空间分区（统一网格）

```typescript
// src/infrastructure/spatial-grid.ts

export class SpatialGrid {
  private cellSize: number = 5;
  private grid: Map<string, Set<string>> = new Map(); // cellKey -> entityIds

  private getCellKey(x: number, y: number): string {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    return `${cx},${cy}`;
  }

  insert(entityId: string, x: number, y: number): void {
    const key = this.getCellKey(x, y);
    if (!this.grid.has(key)) this.grid.set(key, new Set());
    this.grid.get(key)!.add(entityId);
  }

  queryRange(centerX: number, centerY: number, radius: number): string[] {
    const results: string[] = [];
    const cellRadius = Math.ceil(radius / this.cellSize);
    const centerCX = Math.floor(centerX / this.cellSize);
    const centerCY = Math.floor(centerY / this.cellSize);

    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dy = -cellRadius; dy <= cellRadius; dy++) {
        const key = `${centerCX + dx},${centerCY + dy}`;
        const cell = this.grid.get(key);
        if (cell) results.push(...cell);
      }
    }
    return results;
  }
}
```

#### 流场寻路（Web Worker 异步计算）

```typescript
// src/infrastructure/pathfinding/flow-field.ts

export interface FlowField {
  width: number;
  height: number;
  cellSize: number;
  directions: Float32Array;  // 每个网格点的方向向量（x, y）
  costs: Float32Array;       // 每个网格点的移动代价
}

export class FlowFieldCalculator {
  // 从目标点反向传播，计算全图方向场
  calculate(grid: ObstacleGrid, target: { x: number; y: number }): FlowField {
    const width = Math.ceil(grid.worldWidth / grid.cellSize);
    const height = Math.ceil(grid.worldHeight / grid.cellSize);
    const costs = new Float32Array(width * height).fill(Infinity);
    const directions = new Float32Array(width * height * 2);

    // Dijkstra 从目标点反向传播
    const targetIdx = this.worldToIndex(target.x, target.y, grid);
    costs[targetIdx] = 0;
    const queue: number[] = [targetIdx];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = this.getNeighbors(current, width, height);
      for (const neighbor of neighbors) {
        if (grid.isObstacle(neighbor)) continue;
        const newCost = costs[current] + this.moveCost(current, neighbor);
        if (newCost < costs[neighbor]) {
          costs[neighbor] = newCost;
          queue.push(neighbor);
        }
      }
    }

    // 计算方向场（梯度方向）
    for (let i = 0; i < width * height; i++) {
      if (costs[i] === Infinity) continue;
      const grad = this.computeGradient(i, costs, width, height);
      directions[i * 2] = grad.x;
      directions[i * 2 + 1] = grad.y;
    }

    return { width, height, cellSize: grid.cellSize, directions, costs };
  }
}
```

**Web Worker 集成**：流场计算在 150 敌人 + 动态障碍物（城墙/建筑）场景下，单帧计算可能超过 16ms。将流场计算移入 Web Worker，主线程每 0.5 秒请求一次更新后的流场，敌人单位在帧间使用缓存的流场方向移动。

```typescript
// src/infrastructure/pathfinding/flow-field-worker.ts
// 在 Web Worker 中运行

self.onmessage = (e) => {
  const { grid, target, requestId } = e.data;
  const calculator = new FlowFieldCalculator();
  const flowField = calculator.calculate(grid, target);
  self.postMessage({ flowField, requestId });
};
```

#### GPU 合批等价物：InstancedMesh

原 Unity 方案：GPU Instancing + Static Batching + LOD。  
Web 等价方案：Three.js `InstancedMesh`。

```typescript
// src/renderer/instanced-units.ts

export class InstancedUnitRenderer {
  private instancedMesh: THREE.InstancedMesh;
  private dummy: THREE.Object3D = new THREE.Object3D();
  private maxInstances: number = 250; // 覆盖 80 友方 + 150 敌方 + 余量

  constructor(geometry: THREE.BufferGeometry, material: THREE.Material) {
    this.instancedMesh = new THREE.InstancedMesh(geometry, material, this.maxInstances);
    this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }

  updateInstances(units: { position: { x: number; y: number; z: number }; rotation: number; scale: number }[]): void {
    for (let i = 0; i < units.length && i < this.maxInstances; i++) {
      const u = units[i];
      this.dummy.position.set(u.position.x, u.position.y, u.position.z);
      this.dummy.rotation.y = u.rotation;
      this.dummy.scale.setScalar(u.scale);
      this.dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.instancedMesh.count = Math.min(units.length, this.maxInstances);
    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }
}
```

**性能预算对照表**：

| 指标 | Unity 方案 | Web 等价方案 | 验证方式 |
|-|-|-|-|
| 友方渲染单位 ≤80 | GPU Instancing | InstancedMesh (1 draw call / 单位类型) | 运行时统计 |
| 敌方渲染单位 ≤150 | GPU Instancing + LOD | InstancedMesh + Billboard 降级 (>15 单位距离) | 运行时统计 |
| 建筑 ≤18 | Static Batching | InstancedMesh (静态矩阵，不每帧更新) | 运行时统计 |
| 地形 | 单一大网格 | 单一大网格 + Shader 地形状态 | 1 draw call |
| Draw Calls ≤30 | Instancing + Batching | InstancedMesh + UI 在 DOM 层 | Chrome Profiler |
| 帧率 ≥60fps@1080p | URP 轻量管线 | Three.js + 合理 LOD + 后处理优化 | 核显实测 |
| 同屏特效 ≤200 粒子 | 粒子池 | Three.js Points (GPU 粒子) | 运行时统计 |

### 3.5 存档系统

```typescript
// src/core/save-load.ts

export interface RunSave {
  version: string;
  save_time: string;
  run_state: {
    day_night_cycle: number;
    phase: 'day' | 'night' | 'transition' | 'settlement';
    commander_id: string;
    territory_seed: number;
    map_progress: MapNodeState[];
    resources: {
      gold: number;
      war_spirit: number;
      military_capacity: number;
      work_capacity: number;
    };
    squads: SquadSave[];
    buildings: BuildingSave[];
    deck: {
      armory: ArmoryEntry[];
      tactic: TacticHand;
      damaged_camp: DamagedCamp;
    };
    war_banners: string[];
    curses: string[];
    boss_encountered: string[];
  };
}

export class SaveLoadSystem {
  private saveDir: string;

  constructor() {
    // Electron 环境使用 app.getPath('userData')
    this.saveDir = window.electronAPI ? window.electronAPI.getUserDataPath() + '/Saves' : './saves';
  }

  async saveRun(state: RunSave): Promise<void> {
    const filename = `run_${Date.now()}.json`;
    await this.writeFile(`${this.saveDir}/${filename}`, JSON.stringify(state, null, 2));
  }

  async loadRun(filename: string): Promise<RunSave> {
    const data = await this.readFile(`${this.saveDir}/${filename}`);
    return JSON.parse(data);
  }

  // 夜中不存档：夜间阶段暂停菜单的「保存并退出」不可用
  canSaveInCurrentPhase(phase: string): boolean {
    return phase === 'day' || phase === 'settlement';
  }

  // 夜间内存临时回退点（波次起点）
  private memoryCheckpoints: Map<number, RunSave> = new Map();

  createWaveCheckpoint(waveIndex: number, state: RunSave): void {
    this.memoryCheckpoints.set(waveIndex, JSON.parse(JSON.stringify(state)));
  }

  restoreFromLastCheckpoint(): RunSave | null {
    const lastWave = Math.max(...this.memoryCheckpoints.keys());
    return this.memoryCheckpoints.get(lastWave) || null;
  }
}
```

---

## 4. Steam 上架打包路线

### 4.1 Electron 打包为 Windows 构建

| 环节 | 方案 | 说明 |
|-|-|-|
| 框架 | Electron 28+ | 稳定版，支持 Windows 10+ |
| 打包工具 | electron-builder | 自动签名、自动更新、多平台构建 |
| 输出格式 | .exe 安装包 + .zip 便携版 | Steam 上架需要安装包 |
| 窗口模式 | 无边框全屏 / 窗口化可切换 | 设计主文档要求 3 档缩放 |
| 离线运行 | 所有资源本地打包 | 不依赖 CDN，Steam 离线模式可用 |

`electron/main.ts`：

```typescript
import { app, BrowserWindow } from 'electron';
import path from 'path';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.ts'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 生产环境加载本地打包文件，开发环境加载 Vite 服务器
  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(createWindow);
```

`package.json` 构建脚本：

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "electron:dev": "npm run build && electron .",
    "electron:build": "npm run build && electron-builder --win",
    "electron:build:all": "npm run build && electron-builder --win --mac --linux"
  },
  "build": {
    "appId": "com.emberhold.game",
    "productName": "Emberhold",
    "directories": {
      "output": "release"
    },
    "files": [
      "dist/**/*",
      "electron/**/*"
    ],
    "win": {
      "target": ["nsis", "zip"]
    }
  }
}
```

### 4.2 Steamworks SDK 集成点

| 功能 | 集成方案 | 说明 |
|-|-|-|
| 成就 | `greenworks`（Electron 的 Steamworks 绑定）或 `steamworks.js` | 成就数据本地存储 + Steam 同步 |
| 云存档 | Steam Cloud API | 存档自动上传 Steam 云；Electron 中通过 `steamworks.js` 调用 |
| 排行榜 | Steam Leaderboards API | 无尽围城模式分数榜；每周挑战种子榜 |
| Steam Input | 自动支持 | Electron 窗口自动兼容 Steam Input 覆盖层 |
| 统计 | Steam User Stats API | 游玩时长、通关次数、Build 完成度 |

**Steamworks 集成架构**：

```typescript
// electron/steam-integration.ts
import * as steamworks from 'steamworks.js';

export class SteamIntegration {
  private client: steamworks.Client | null = null;

  init(): boolean {
    try {
      this.client = steamworks.init(480); // App ID（替换为实际 Steam App ID）
      return true;
    } catch {
      return false; // 非 Steam 启动（如开发环境）
    }
  }

  unlockAchievement(achievementId: string): void {
    if (!this.client) return;
    this.client.achievement.activate(achievementId);
  }

  uploadCloudSave(localPath: string): void {
    if (!this.client) return;
    // Steam Cloud 自动同步用户数据目录下的文件
  }
}
```

### 4.3 自动构建流程（CI/CD）

```yaml
# .github/workflows/build.yml
name: Build and Release

on:
  push:
    tags: ['v*']

jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run electron:build
      - uses: actions/upload-artifact@v4
        with:
          name: emberhold-windows
          path: release/*.exe

  build-macos:
    runs-on: macos-latest
    steps:
      # ... 类似配置
```

---

## 5. 里程碑计划 M1–M5

### M1：可玩垂直切片（白天建堡 + 夜里守城 + 双层牌库 + 半自动操控）

**时间**：6–8 周  
**目标**：验证核心 Hook「城堡即卡组」是否成立。不是技术演示，是完整可玩的「一个领地 + 一位指挥官 + 三个昼夜循环」。

#### M1 技术范围

| 系统 | M1 范围 | 排他说明 |
|-|-|-|
| 昼夜循环 | 完整的白天建造 + 夜间守城 + 结算流程 | 包含 LUT 昼夜渐变 |
| 双层牌库 | 军械册（6 张单位/建筑卡）+ 战术手牌（5 张战术卡） | 含应急增援 + 受损归营堆规则 |
| 建造系统 | 3 种建筑：城墙、箭塔、兵营 | 无 A/B 分支 |
| 军团系统 | 3 种单位：盾卫、弓手、枪卒 | 无 A/B 分支；班级指令完整 |
| 敌人系统 | 2 种敌人：狼群、盾卫 | 基础行为完整 |
| 指挥官 | 1 名：奥恩（基础规则） | 终极技实现 |
| 经济系统 | 金币 + 战意 + 军令/工令容量 | 完整双资源循环 |
| 地图 | 1 张固定地图，3 个昼夜循环 | 无节点选择 |
| UI/HUD | 昼夜双态 HUD、手牌显示、建造轮盘 | 键鼠支持 |
| 存档 | 昼夜边界存档 | 夜中内存回退点 |
| 寻路 | A\* + 流场 + RVO | 150 敌人预算验证 |
| 渲染 | Three.js 正交相机 + InstancedMesh + LUT 后处理 | 3 档缩放 |

#### M1 技术验收标准（具体可测）

| 编号 | 验收项 | 测试方法 | 通过标准 |
|-|-|-|-|
| M1-T01 | 昼夜循环完整性 | 手动运行 3 个完整昼夜 | 每昼夜包含：天亮结算→白天建造（可跳过）→入夜过渡→夜间波次→夜末清算 |
| M1-T02 | 双层牌库规则正确性 | 单元测试 + 手动测试 | 军械册卡打出后常驻场上；同名牌打出触发升级；战术卡正常抽弃；手牌上限 5 张；应急增援 1.5 倍战意 |
| M1-T03 | 应急增援生命周期 | 单元测试 | 应急增援实体夜末进入受损归营堆；次日白天花 50% 金币修复后半血入场 |
| M1-T04 | 半自动操控 | 手动测试 | 12 个班可独立下达移动/撤退/驻守/集火指令；撤退 5 秒内不产战意 |
| M1-T05 | 帧率稳定性 | Chrome Profiler | 同屏 80 友方 + 150 敌方时，帧率 ≥60fps@1080p（核显笔记本） |
| M1-T06 | 渲染合批等价物 | 运行时统计 | Draw Calls ≤30；InstancedMesh 合批生效 |
| M1-T07 | 流场寻路 150 敌人 | 手动测试 + 性能面板 | 150 敌人同屏时寻路不卡顿；Web Worker 流场计算不阻塞主线程 |
| M1-T08 | 存档粒度 | 单元测试 + 手动测试 | 昼夜边界自动存档；夜中强制退出回退到本夜开始；崩溃后可恢复至最近波次起点 |
| M1-T09 | 对象池 | 单元测试 | 敌人/粒子对象复用率 ≥90%；无运行时内存泄漏（Chrome Heap Snapshot） |
| M1-T10 | 空间分区 | 单元测试 | 碰撞查询复杂度从 O(n²) 降至 O(n) 级 |
| M1-T11 | 单局时长 | 手动计时 | 3 昼夜循环可在 15 分钟内完成 |
| M1-T12 | 核心 Hook 可感知 | 观察测试（非本团队人员） | 5 分钟内能理解「白天建造、夜间防守」；第一局打出完整 loop |

#### M1 冒烟测试清单（每次构建后必跑）

```markdown
- [ ] 游戏启动 → 主菜单正常显示
- [ ] 开始新游戏 → 进入白天建造阶段
- [ ] 建造 3 个建筑 + 2 个班 → 无报错
- [ ] 点击「入夜」→ 5 秒 LUT 渐变正常 + 威胁预演显示
- [ ] 夜间接敌 → 战意正常增长 + 手牌可打出
- [ ] 给班下达撤退指令 → 班脱离接战 + 5 秒内不产战意
- [ ] 夜间打完 3 波 → 夜末清算正常 + 进入白天
- [ ] 白天修复建筑 → 金币正确扣除
- [ ] 连续 3 昼夜 → 无崩溃
- [ ] Alt+F4 强制退出 → 重新进入可恢复至最近昼夜边界
- [ ] 同屏 150 敌人场景 → 帧率 ≥60fps（开发机）
- [ ] 性能监控面板 → Draw Calls ≤30，粒子数 ≤200
```

### M2：内容扩展（Build 深度验证）

**时间**：4–6 周（在 M1 基础上）  
**目标**：验证 Build 差异化是否成立。

| 系统 | M2 新增 |
|-|-|
| 单位 | 8 种单位全部（含工匠、医师、咒术师、游骑、巨兽、亡灵班） |
| 建筑/塔 | 9 种建筑 + 8 种塔全部 |
| A/B 分支 | 单位/建筑/塔的 A/B 升级分支 |
| 敌人 | 9 种敌人全部 |
| 卡牌 | 初始 60 张卡池 |
| 地图 | 领地节点选择 + 2 张领地地图 |
| 事件 | 10 个事件 |
| 战旗 | 12 条战旗 |
| 诅咒 | 5 条荒土法则 |
| 音频 | 临时音乐 + SFX |

**验收标准**：10 种 Build 原型中至少 6 种可在 M2 内容范围内完整体验；每种 Build 的玩法差异可被非团队测试者识别。

### M3：Boss 与终局（规则级挑战验证）

**时间**：4–6 周  
**目标**：验证 Boss 规则改写机制是否成立。

| 系统 | M3 新增 |
|-|-|
| Boss | 9 个 Boss 全部（含烬王 3 阶段） |
| 领主夜 | 昼夜 6/7 的精英领主夜 |
| Meta 解锁 | 王国厅框架（指挥官/卡/建筑/图鉴） |
| 难度 | Normal / Hard / Expert |
| 无尽模式 | 无尽围城框架 |
| 存档迁移 | 版本号 + 自动迁移脚本 |

**验收标准**：每个 Boss 被至少一种 Build 明确克制；烬王 3 阶段规则可被玩家临场理解。

### M4：Steam 集成与 Polish

**时间**：3–4 周  
**目标**：达到 Steam 可上架质量。

| 系统 | M4 新增 |
|-|-|
| Steamworks | 成就、云存档、排行榜 |
| 输入 | 手柄支持完整 |
| 本地化 | 中/英/日三语 |
| UI | 完整菜单、设置、统计、Build 图鉴 |
| 音频 | 完整音乐（昼夜双轨×3 烈度）、SFX、UI 音 |
| 性能 | 核显笔记本 60fps 实测通过 |
| 兼容性 | Windows / macOS / Steam Deck |

### M5：上线准备与发布后首批更新

**时间**：2–3 周  
**目标**：上线 + 发布后 P0 更新准备。

| 系统 | M5 内容 |
|-|-|
| 发布 | Steam 商店页、试玩 Demo、定价 ¥68 / \$14.99 |
| 更新准备 | 新领地 ×2、新指挥官 ×1 的数据框架 |
| 社区 | 每周挑战种子系统、本地排行榜 |
| 监控 | 错误上报（Sentry）、性能遥测 |

---

## 6. 测试策略

### 6.1 测试金字塔

| 层级 | 占比 | 内容 | 工具 |
|-|-|-|-|
| 单元测试 | 50% | 数据验证、效果计算、经济公式、战斗模拟核心 | Vitest |
| 集成测试 | 30% | 模块交互、事件总线、存档/读档一致性 | Vitest + jsdom |
| Gameplay 测试 | 15% | 战斗模拟器（离线跑 1000 局） | 自定义无头模拟器（Node.js） |
| 手动 QA | 5% | 手感、UI、视觉、音频 | 人工测试 |

### 6.2 战斗数值模拟器（一等交付物）

**定位**：独立于游戏运行的 headless 战斗模拟器，输入 JSON 数据配置，输出数值报表。

**与设计文档「数值待模拟器校准」对接**：设计主文档中所有标注「初始设计值，QA 阶段需用战斗模拟器校准」的数值，均通过本模拟器批量验证。

```typescript
// src/simulator/simulator.ts

export interface ScenarioConfig {
  commander_id: string;
  initial_deck: string[];
  initial_buildings: string[];
  initial_squads: { unit_id: string; position: { x: number; y: number } }[];
  enemy_waves: { enemy_id: string; count: number; spawn_delay: number }[][];
  territory_type: string;
  difficulty: number;
  ai_strategy: 'aggressive' | 'defensive' | 'balanced';
}

export interface SimulationReport {
  scenario_id: string;
  victory: boolean;
  duration_seconds: number;
  gold_curve: number[];           // 每夜金币存量
  war_spirit_curve: number[];     // 每夜战意产消
  squad_casualties: number[];     // 每夜阵亡班数
  building_losses: number[];      // 每夜被毁建筑数
  cards_played: Record<string, number>; // 每张卡打出次数
  boss_encountered: string | null;
  final_phase: string;
}

export class BattleSimulator {
  async runScenario(config: ScenarioConfig): Promise<SimulationReport> {
    // 1. 加载全部 JSON 数据
    // 2. 初始化对局状态
    // 3. 无头运行昼夜循环（无渲染，纯逻辑）
    // 4. 记录全部数值变化
    // 5. 输出报表
  }

  // 批量跑 1000 局
  async runBatch(configs: ScenarioConfig[], count: number): Promise<BatchReport> {
    const reports: SimulationReport[] = [];
    for (let i = 0; i < count; i++) {
      const config = configs[Math.floor(Math.random() * configs.length)];
      const report = await this.runScenario(config);
      reports.push(report);
    }
    return this.aggregateReports(reports);
  }
}
```

**模拟器报表输出格式**：

```json
{
  "batch_id": "batch_20261001_001",
  "total_runs": 1000,
  "victory_rate": 0.42,
  "avg_duration": 1180,
  "balance_flags": [
    { "type": "warning", "message": "巨兽近卫 Build 胜率 0.78，显著高于平均值", "build": "behemoth_guardian" },
    { "type": "error", "message": "龟城 Build 在领主夜 6 胜率 0.05，可能过弱", "build": "iron_turtle" }
  ],
  "gold_curve_avg": [500, 320, 280, 410, 380, 290, 450],
  "casualties_avg": [0, 1.2, 2.1, 1.8, 3.2, 2.5, 4.1]
}
```

**CI 集成**：每次数据更新后自动跑模拟器，若出现 `error` 级 balance flag 则阻断合并。

### 6.3 冒烟测试清单

#### M1 冒烟测试（每次构建必跑）

见 5.1 M1 冒烟测试清单。

#### 性能专项测试

| 测试项 | 方法 | 通过标准 |
|-|-|-|
| GPU 合批等价物 | Chrome Profiler → Draw Calls 计数 | ≤30 draw calls（同屏 230 实体） |
| 150 敌人流场 | Web Worker 性能面板 + 主线程帧时间 | 流场计算 <16ms / 0.5s 更新周期；主线程不卡顿 |
| 内存泄漏 | Chrome Heap Snapshot 对比 | 连续 3 昼夜后内存增长 <20MB |
| 存档写入时间 | `performance.now()` 计时 | ≤500ms |
| 启动时间 | `performance.now()` 计时 | 从双击到主菜单 ≤5 秒 |

---

## 附录 A：Unity → Web 移植中放弃的能力与补偿方案

| Unity 能力 | 放弃原因 | Web 补偿方案 | 影响评估 |
|-|-|-|-|
| **Unity Editor + Inspector** | 开发环境无法安装 Unity | Vite HMR + 浏览器 DevTools + 自定义数据编辑器网页 | 开发效率相当，数据编辑通过 JSON + 热重载实现 |
| **ScriptableObject (.asset)** | Web 无 SO 机制 | 纯 JSON + TypeScript 接口 + Zod 校验 | 功能等价；AI 批量生成 JSON 比生成 SO 更简单 |
| **NavMesh 动态烘焙** | Three.js 无内置 NavMesh | A\* on Grid + 自定义流场 + RVO | 150 敌人预算下，流场方案性能更优 |
| **Unity Behavior Tree（内置）** | Web 无内置行为树 | 自研轻量行为树（或引入 `behaviortree` npm 包） | 12 班行为树逻辑简单，自研成本 <1 周 |
| **Addressables 资源系统** | Web 无需 Addressables | 自定义 AssetLoader（fetch + GLTFLoader）+ 资源预加载 | 2.5D 低多边形资源小，无需分载 |
| **Unity Input System** | Web 有原生替代 | Pointer Events + Gamepad API | 功能等价，手柄支持无需额外库 |
| **Unity Test Framework** | Web 有原生替代 | Vitest | 功能更轻量，与 Vite 集成更好 |
| **URP 后处理 Volume** | Web 有等价物 | Three.js EffectComposer + 自定义 LUT Shader | 昼夜 LUT 切换完全可实现 |
| **GPU Instancing（自动）** | Three.js 需手动 InstancedMesh | InstancedMesh API | 多写少量初始化代码，运行时效果等价 |
| **Unity Profiler** | Web 有原生替代 | Chrome DevTools Performance + Three.js Inspector | 功能更强大，且无需额外安装 |
| **C# 编译时类型检查** | 改用 TypeScript | TypeScript `strict` 模式 | 类型安全等价 |
| **.NET 生态（大量库）** | 改用 npm 生态 | npm 包管理 | 游戏开发专用库略少，但 Three.js 生态足够 |

**总体评估**：Web 技术栈在全部核心能力上都有成熟补偿方案，无不可逾越的技术缺口。唯一需要额外工作量的是行为树（需自研或引入轻量库）和流场寻路（需自研，但算法成熟）。

---

## 附录 B：与原 Unity 架构文档的冲突点及结论

| 冲突点 | Unity 架构文档 | Web 移植方案 | 结论 |
|-|-|-|-|
| **引擎选型** | Unity 2022.3 LTS（唯一推荐） | Three.js + TypeScript + Electron | **按统筹者定案执行**：Web 栈。原 Unity 方案作为技术参考，数据结构与模块划分继承。 |
| **渲染管线** | URP | Three.js 原生 WebGL | URP 的轻量特性在 Three.js 中通过场景优化（低多边形、简单材质、烘焙光照）等价实现。 |
| **数据格式** | ScriptableObject (.asset) + JSON | 纯 JSON | SO 的 Inspector 可视化编辑放弃，改用 JSON Schema + 校验脚本 + 浏览器中运行的简易数据编辑器。 |
| **AI Coding 语言** | C#（AI 训练数据最充足） | TypeScript（AI 训练数据充足） | TypeScript 的 AI 生成质量与 C# 同级，Vite 的热更新速度甚至优于 Unity 的编译循环。 |
| **寻路方案** | NavMesh + 流场降级 | A\* Grid + 流场 + RVO | NavMesh 在 Web 中无成熟库，改用 Grid-based 流场。对 150 敌人预算，性能等价。 |
| **存档位置** | `%AppData%/Emberhold/Saves/` | Electron `app.getPath('userData')` | 路径等价，Electron 自动处理跨平台。 |
| **输入系统** | Unity Input System | Pointer Events + Gamepad API | 功能等价。 |
| **后处理 LUT** | URP Volume Color Grading | Three.js EffectComposer + LUT Shader | 效果等价。 |
| **模块事件总线** | ScriptableObject-based Event Bus | TypeScript EventEmitter / 自定义 Event Bus | 实现等价。 |
| **对象池** | Unity Object Pool | 自研泛型 ObjectPool | 逻辑简单，自研无风险。 |

**无不可调和冲突**。原 Unity 架构文档的模块划分、数据规范、性能预算、测试策略全部可在 Web 栈中继承或等价实现。

---

## 附录 C：设计主文档硬约束映射表

| 硬约束（来自设计主文档） | Web 实现方案 | 验收检查点 |
|-|-|-|
| 同屏实体 ≤80 友方 / ≤150 敌方 | Three.js InstancedMesh + 对象池 + LOD Billboard 降级 | M1 冒烟测试：Draw Calls ≤30，帧率 ≥60fps |
| 2.5D 正交渲染 | Three.js OrthographicCamera + 低多边形 glTF 模型 | M1 验收：3 档缩放正常，昼夜 LUT 渐变 5 秒 |
| 昼夜双循环节奏 | DayNightCycle 状态机 + LUT 后处理切换 | M1 验收：3 昼夜循环完整，存档粒度 = 昼夜边界 |
| 双层牌库（军械册/战术手牌） | CardSystem 模块：Map<entityId, ArmoryEntry> + TacticHand | M1 验收：同名牌升级、应急增援 1.5 倍、受损归营堆 |
| 半自动控制（班级指令+打牌+指挥官技） | SquadManager 指令系统 + CardSystem 手牌 + CommanderSystem 终极技 | M1 验收：12 班独立指令、手牌上限 5、大招每夜一次 |
| Meta 零数值 | 王国厅数据表中无数值加成节点；校验脚本检测 +5% 类数值即报错 | 数据校验流水线自动检查 |
| 数据驱动架构 | 全部内容 JSON + TypeScript 接口 + Zod Schema 校验 | 校验脚本 CI 自动执行 |
| 内容量级（200 卡/8 单位/9 建筑/9 敌人/9 Boss） | 数据注册表统一管理；JSON 文件按类型分目录 | 校验脚本检查 ID 唯一性、引用完整性 |
| 存档粒度 = 昼夜边界 | SaveLoadSystem：phase 切换时自动存档；夜间内存临时回退点 | M1 验收：夜中强制退出回退到本夜开始 |
| 十秒可读 | VFX 预算 200 粒子 + 8 大型效果位；班级视觉聚合 | M1 冒烟测试：性能面板粒子数 ≤200 |
| 审计报告阻断-001（应急增援生命周期） | CardSystem.nightSettlement：is_damaged 实体进入受损归营堆；repairFromDamagedCamp 花 50% 金币修复 | M1 单元测试：验证生命周期闭环 |
| 审计报告阻断-002（亡灵班/哨兵祭坛缺失） | 补充 unit_undead_squad.json + building_sentinel_altar.json | 数据校验通过 |
| 审计报告重要-003（军械塔/税塔成本缺失） | 补充军械塔 100 金、税塔 80 金 | 数据校验通过 |
| 审计报告重要-007（战术卡最低费用） | 校验脚本限制战术卡 cost_night ≥ 2 | Zod Schema min(2) |
| 审计报告性能验证项（GPU 合批 + 150 敌人流场） | InstancedMesh + Web Worker 流场 | M1 冒烟测试：同屏 150 敌人帧率 ≥60fps |

---

## 附录 D：数据文件目录结构

```
assets/data/
├── cards/
│   ├── units/              # 单位卡（军械册层）
│   ├── buildings/          # 建筑卡（军械册层）
│   ├── tactics/            # 战术卡（循环层）
│   ├── formations/         # 阵型卡（循环层）
│   └── edicts/             # 遗令卡（循环层）
├── units/
│   ├── unit_shieldbearer.json
│   ├── unit_archer.json
│   ├── unit_pikeman.json
│   ├── unit_cavalry.json
│   ├── unit_engineer.json
│   ├── unit_healer.json
│   ├── unit_mage.json
│   ├── unit_behemoth.json
│   └── unit_undead_squad.json      # 审计修复新增
├── buildings/
│   ├── building_wall.json
│   ├── building_gate.json
│   ├── building_spike_trap.json
│   ├── building_barracks.json
│   ├── building_market.json
│   ├── building_workshop.json
│   ├── building_arrow_tower.json
│   ├── building_cannon.json
│   ├── building_dragon_beacon.json
│   └── building_sentinel_altar.json # 审计修复新增
├── towers/
│   ├── tower_arrow.json
│   ├── tower_cannon.json
│   ├── tower_frost.json
│   ├── tower_cable.json
│   ├── tower_beacon.json
│   ├── tower_arsenal.json
│   ├── tower_tax.json
│   └── tower_decoy.json
├── enemies/
│   ├── enemy_shield_crusher.json
│   ├── enemy_wolf_pack.json
│   ├── enemy_burrower.json
│   ├── enemy_siege_beast.json
│   ├── enemy_tower_breaker.json
│   ├── enemy_halberdier.json
│   ├── enemy_plague_doctor.json
│   ├── enemy_necromancer.json
│   └── enemy_overlord.json
├── bosses/
│   ├── boss_city_breaker.json
│   ├── boss_tide_mother.json
│   ├── boss_memory_thief.json
│   ├── boss_twins.json
│   ├── boss_army_slayer.json
│   ├── boss_plague_lord.json
│   ├── boss_time_keeper.json
│   ├── boss_throne_usurper.json
│   └── boss_ember_king.json
├── commanders/
│   ├── commander_oen.json
│   ├── commander_veira.json
│   ├── commander_karn.json
│   └── commander_morgan.json
├── warbanners/
│   └── banner_*.json
├── laws/
│   └── law_*.json
├── events/
│   └── event_*.json
└── _index.json              # 数据索引文件（列出全部数据文件路径）
```

---

*本文档基于《烬堡 EMBERHOLD》游戏核心设计主文档 rev.26、原技术架构文档 rev.7、设计审计报告 rev.5 编写。全部数值为初始设计基准，进入开发后需以战斗模拟器与 QA 局校准。*