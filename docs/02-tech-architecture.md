# 《烬堡 EMBERHOLD》技术架构与开发规划文档

> 本文档覆盖原始需求第 31–34 节，与核心设计主文档（第 1–30、35、37、38 节）衔接，供程序、策划、AI Agent 直接进入开发执行。

---

## 第 31 节：技术选型与架构

### 31.1 引擎选型对比与推荐

#### 约束前提（来自核心设计文档附录）

| 约束项 | 具体指标 | 对引擎选型的影响 |
|-|-|-|
| 同屏实体预算 | 友方 ≤80 渲染单位 + 敌方 ≤150 | 需要高效渲染管线与合批能力，但远未触及任何现代引擎上限 |
| 渲染风格 | 2.5D 正交投影 + 低多边形 + 手绘纹理 | 无实时光追、无大规模布料、无复杂光照；粒子需求低于市场中位 |
| 目标平台 | PC（Steam）/ Windows 为主，macOS + Steam Deck 验证 | 无需跨手游/主机/网页；键鼠 + 手柄双输入 |
| AI Coding 协作 | 大量使用 GPT/Claude/Codex 生成与辅助代码 | 引擎的脚本语言生态、IDE 支持、文档质量、社区代码样本量直接影响 AI 输出质量 |
| 数据驱动架构 | 卡牌/单位/建筑/敌人/Boss/法则全部表格化（JSON/ScriptableObject） | 需要引擎原生支持或易于接入的数据驱动工作流 |
| 独立开发规模 | 小团队（1–3 人核心），无专职引擎程序员 | 引擎学习曲线、工具链成熟度、资产商店生态直接影响产能 |

#### Unity（推荐）

| 维度 | 评估 | 对本项目的具体影响 |
|-|-|-|
| **AI Coding 友好度** | ★★★★★ | C# 是 AI 训练数据最充足的游戏开发语言；GPT-4/Codex/Claude 的 C# 代码质量显著高于 GDScript 或 C++/蓝图；Unity 官方 API 文档结构化程度高，AI 上下文检索效果最佳 |
| **2.5D / 正交渲染** | ★★★★★ | 正交相机原生支持；URP（Universal Render Pipeline）轻量且可定制；低多边形场景在 URP 下性能极佳；Sprite-3D 混合渲染成熟 |
| **数据驱动** | ★★★★★ | ScriptableObject 是行业标杆级数据驱动方案；可直接在 Inspector 中可视化编辑卡牌/单位数据；Addressables 实现热更与内容分载；JSON 序列化原生支持 |
| **寻路与 AI** | ★★★★☆ | NavMesh 系统成熟，支持动态烘焙与障碍物；对于 150 敌人同屏，NavMesh Agent 足够；群体寻路可用 A\* + 流场（Flow Field）降级方案 |
| **输入与手柄** | ★★★★★ | Input System 包同时支持键鼠与手柄；Steam Input API 可直接接入 |
| **生态与资产** | ★★★★★ | Asset Store 中 2.5D/low-poly 素材、塔防框架、卡牌系统模板丰富；可大幅降低 AI Art 之外的资产生产压力 |
| **学习曲线** | ★★★★☆ | 对无引擎经验者，上手周期 2–4 周；对 AI Coding 工作流，C# 的编译-运行循环比 C++ 快一个数量级 |
| **授权成本** | ★★★★☆ | 个人/小团队收入 < $200K 免费；超过后按收入分成；对独立游戏定价 ¥68/$14.99 档，首年大概率在免费区间内 |

**Unity 对本项目的关键优势**：AI Coding 工作流是本项目开发的核心假设，C# 的 AI 代码生成质量直接决定开发效率。Unity 的 ScriptableObject 让「策划直接改表格 → 游戏实时生效」的数据驱动闭环零代码实现，这是 AI 批量生成内容后快速验证的前提。

#### Godot

| 维度 | 评估 | 对本项目的具体影响 |
|-|-|-|
| **AI Coding 友好度** | ★★★☆☆ | GDScript 训练数据远少于 C#；AI 生成的 GDScript 代码错误率显著更高；C# 在 Godot 4 中支持但生态和文档弱于 GDScript |
| **2.5D / 正交渲染** | ★★★★☆ | Godot 4 的正交相机和 2D/3D 混合渲染已大幅改善；低多边形场景渲染无问题 |
| **数据驱动** | ★★★★☆ | Resource 系统功能接近 ScriptableObject；但工具链（批量编辑、版本对比、可视化 inspector）不如 Unity 成熟 |
| **寻路与 AI** | ★★★☆☆ | NavigationServer 较新，文档和社区方案少；150 敌人同屏的群体寻路需要较多自研 |
| **输入与手柄** | ★★★★☆ | 原生支持键鼠+手柄；Steam Input 集成需额外工作 |
| **生态与资产** | ★★★☆☆ | Asset Library 规模远小于 Unity；2.5D 塔防/卡牌相关模板稀缺 |
| **学习曲线** | ★★★★★ | 对独立开发者最友好的引擎；轻量、启动快、文档直观 |
| **授权成本** | ★★★★★ | 完全免费 + 开源，无收入门槛 |

**Godot 的适用场景**：如果团队已有 Godot 熟练成员、且对 AI Coding 依赖度不高，Godot 是优秀选择。但在「大量 AI 协作开发」这一核心前提下，GDScript 的 AI 生成质量构成显著瓶颈。

#### Unreal Engine

| 维度 | 评估 | 对本项目的具体影响 |
|-|-|-|
| **AI Coding 友好度** | ★★☆☆☆ | C++ 的 AI 生成质量尚可，但编译慢、头文件复杂；蓝图对 AI Coding 几乎不可行（视觉脚本无法被文本模型直接生成）；AI 辅助 UE 开发的主流方式是「C++ 生成 + 蓝图桥接」， workflow 复杂 |
| **2.5D / 正交渲染** | ★★★★★ | 渲染能力最强；但本项目的视觉需求远未触及其优势区，属于「杀鸡用牛刀」 |
| **数据驱动** | ★★★★☆ | Data Table + Curve Table 可用；但不如 ScriptableObject 灵活；蓝图与数据表结合时 workflow 较重 |
| **寻路与 AI** | ★★★★★ | MassAI + State Tree 是行业顶级；但对于 230 实体预算，属于过度设计 |
| **生态与资产** | ★★★★★ | Marketplace 庞大；但 low-poly/2.5D 独立游戏资产比例低于 Unity |
| **学习曲线** | ★★☆☆☆ | 上手周期 1–3 个月；C++ 编译迭代慢严重拖累 AI Coding 的快速验证循环 |
| **授权成本** | ★★★☆☆ | 收入 > \$1M 前 5% 分成；门槛虽高，但对独立游戏通常不构成实际成本 |

**Unreal 的排除理由**：本项目无 3A 级渲染需求、无开放世界、无联机同步，Unreal 的核心优势全部用不上；而「AI Coding + 快速迭代」这一最关键路径上，UE 的 C++/蓝图双轨 workflow 是最慢的选择。

#### 引擎推荐结论：Unity（唯一推荐）

| 对比维度 | Unity | Godot | Unreal | 本项目权重 |
|-|-|-|-|-|
| AI Coding 效率 | ★★★★★ | ★★★☆☆ | ★★☆☆☆ | **最高权重** |
| 数据驱动成熟度 | ★★★★★ | ★★★★☆ | ★★★★☆ | 高 |
| 2.5D 正交渲染 | ★★★★★ | ★★★★☆ | ★★★★★ | 中 |
| 独立团队产能 | ★★★★☆ | ★★★★★ | ★★☆☆☆ | 高 |
| 生态与模板 | ★★★★★ | ★★★☆☆ | ★★★★★ | 中 |
| 学习/迭代速度 | ★★★★☆ | ★★★★★ | ★★☆☆☆ | 高 |

**唯一推荐：Unity（URP 管线）**。核心决策理由：在「独立开发 + 大量 AI Coding 协作」这一组合约束下，AI 生成代码的质量与迭代速度是开发效率的瓶颈，而 C# + Unity 是这一维度上无争议的最优解。其他引擎在单项上可能更优，但无法在这个组合约束下击败 Unity。

> **ADR-031-1：引擎选型——Unity URP**
> 
> - **状态**：Accepted
> - **决策**：采用 Unity 2022.3 LTS + URP 作为开发引擎
> - **备选**：Godot 4（因 AI Coding 友好度差距而排除）、Unreal 5（因 workflow 重量与迭代速度而排除）
> - **风险**：Unity 授权政策未来可能变化；缓解：在收入触及分成线前已完成核心开发，且 Godot 作为 Plan B 可在 2 周内迁移数据层

---

### 31.2 渲染方案

#### 渲染管线：URP（Universal Render Pipeline）

| 决策项 | 方案 | 理由 |
|-|-|-|
| 管线选择 | URP，非 HDRP / Built-in | URP 在 2.5D 低多边形场景下性能最优；Built-in 已 deprecated；HDRP 对本项目视觉需求完全过剩 |
| 投影模式 | 正交相机（Orthographic） | 核心设计文档定案；3 档缩放（战略全景 / 标准 / 细节） |
| 单位渲染 | 3D 低多边形模型 + 手绘纹理 | 班级为单位聚合渲染；单班内视觉单位用 GPU Instancing 或简单 LOD |
| 特效系统 | URP 粒子系统 + 自定义 Shader | 同屏特效预算 200 粒子 + 8 大型效果位；火场/冰面等地形状态用区域 Shader 替代粒子堆 |
| 光照方案 | 烘焙光照 + 少量实时光（炉火/火把） | 昼夜双色调通过全局后处理（Color Grading LUT）实现，非实时光照切换 |
| UI 渲染 | Screen Space – Overlay | HUD、手牌、建造轮盘全部在屏幕空间渲染，与场景分离 |

#### 昼夜色调切换实现

白昼暖橙金 ↔ 入夜冷蓝紫的 5 秒渐变，通过后处理 Volume 的 Color Grading LUT 插值实现：

- 预烘焙两张 LUT 纹理（day LUT / night LUT）
- 入夜信号触发 Volume 权重 0→1 的 5 秒动画
- 无需改变场景实际光照，性能开销极小

#### 合批与性能策略

| 层级 | 策略 | 目标 |
|-|-|-|
| 友方单位 | GPU Instancing（同模型同材质）+ 动态批处理 | 80 渲染单位 ≤ 3 个 draw call（按单位类型） |
| 敌方单位 | GPU Instancing + 群体 LOD（距离 > 15 单位时切换为 billboard） | 150 渲染单位 ≤ 5 个 draw call |
| 建筑 | 静态合批（Static Batching） | 18 座建筑 ≤ 2 个 draw call |
| 地形 | 单一大网格 + 着色器绘制（地形状态：火/冰/水） | 1 个 draw call |
| 特效 | 粒子池 + 按威胁优先级衰减 | 200 粒子池复用，超预算时 fade 旧特效 |

> **硬约束落实**：同屏友方 ≤80 / 敌方 ≤150 的渲染预算，在 URP + GPU Instancing + LOD 组合下，即使目标平台为核显笔记本，也能稳定 60fps@1080p。

---

### 31.3 AI 与寻路方案

#### 寻路架构：分层设计

| 层级 | 负责对象 | 算法 | 更新频率 |
|-|-|-|-|
| 全局路径规划 | Boss、精英、特殊目标单位 | A\* on Grid / NavMesh | 每 2 秒或目标改变时 |
| 群体流动 | 普通敌人波次（≤150 同屏） | 流场（Flow Field）+ 群体挤压解算 | 每帧（优化后每 0.1 秒批次更新） |
| 局部避障 | 所有移动单位 | RVO（Reciprocal Velocity Obstacles） | 每帧 |
| 班级行为 | 友方 12 个班 | 行为树（Behavior Tree） | 每帧 |

#### 流场（Flow Field）降级方案

敌方大量单位（>50 同屏）时，从个体 NavMesh Agent 降级为流场系统：

1. 从敌人巢穴到主堡/城墙目标点，预计算方向场（Direction Field）
2. 每个单位读取最近网格点的方向向量移动
3. 局部 RVO 处理单位间不重叠
4. 优势：150 敌人的路径计算从 O(n×pathfind) 降为 O(grid_size) + O(n)

#### 友方班级 AI

友方 12 个班采用行为树控制，状态机简化版：

- **Idle**：驻守原位，自动攻击射程内敌人
- **Move**：响应玩家指令移动至目标位置
- **Combat**：按阵型规则（方阵/横列/楔形）接敌
- **Retreat**：响应玩家撤退指令，脱离接战
- **Focus Fire**：响应集火指令，优先攻击目标

行为树用开源库 **NPBehave** 或 Unity 内置 Behavior Tree（2023+），不建议自研。

#### 敌人 AI 设计

敌人无需复杂 AI——9 种敌人类型的行为差异通过数据表驱动：

- 移动速度、优先目标类型（城墙/塔/主堡/军团）、攻击范围、特殊行为标签（掘地/飞行/治疗/召唤）
- 行为逻辑统一为：「读取目标优先级 → 寻路至目标 → 攻击 → 死亡」
- 特殊行为（掘地者挖地道、招魂师复活尸体）通过数据表中的 `special_ability` 字段触发对应脚本

> **硬约束落实**：敌方同屏 ≤150 的群体寻路通过流场降级方案解决；友方 12 个班的行为树 CPU 开销极低；寻路不构成性能瓶颈。

---

### 31.4 存档系统

#### 存档粒度

| 存档类型 | 触发时机 | 内容 | 格式 |
|-|-|-|-|
| 对局存档（Run Save） | 昼夜边界（夜末清算 / 天亮结算） | 完整对局状态：卡组、实体位置、资源、战旗、诅咒、地图进度 | JSON 文件 |
| Meta 存档（Meta Save） | 每次王国厅操作后自动保存 | 解锁进度、记忆碎片、图鉴、外观、设置 | JSON 文件 |
| 设置存档（Settings） | 设置变更后 | 音量、分辨率、键位、手柄映射 | JSON 文件 |

#### 存档位置

- **Windows**：`%AppData%/Emberhold/Saves/`
- **macOS**：`~/Library/Application Support/Emberhold/Saves/`
- **Steam Deck**：Proton 兼容层自动映射到 Linux 路径

#### 存档结构（对局存档示例）

```json
{
  "version": "1.0.0",
  "save_time": "2026-10-01T14:30:00Z",
  "run_state": {
    "day_night_cycle": 4,
    "phase": "day", // day / night / transition
    "commander_id": "commander_oen",
    "territory_seed": 12345678,
    "map_progress": { /* 节点状态 */ },
    "resources": {
      "gold": 420,
      "military_capacity": 12,
      "work_capacity": 14
    },
    "squads": [ /* 12 个班的位置、血量、升级分支 */ ],
    "buildings": [ /* 建筑位置、血量、升级分支 */ ],
    "deck": { /* 军械册 + 战术手牌完整状态 */ },
    "war_banners": [ /* 已选战旗 */ ],
    "curses": [ /* 当前诅咒 */ ],
    "boss_encountered": [ /* 已遭遇 Boss */ ]
  }
}
```

#### 夜中不存档

核心设计文档要求「存档粒度 = 昼夜边界」。技术实现：

- 夜中阶段（night phase）暂停菜单的「保存并退出」选项不可用，仅提供「暂停」
- 若玩家强制退出（Alt+F4），回退到本夜开始时的自动存档点
- 夜间每波次开始自动生成临时回退点（内存中，不写入磁盘），崩溃后可恢复至最近波次起点

> **硬约束落实**：存档粒度严格限制在昼夜边界，夜间通过内存临时回退点处理崩溃恢复，不破坏设计意图。

---

### 31.5 数据架构

#### 核心原则：全部内容数据驱动

卡牌、单位、建筑、敌人、Boss、法则、战旗、事件——所有内容通过数据表（ScriptableObject + JSON）驱动，代码层只负责读取与执行。这是「AI 大量参与开发」可行性的技术基石：AI 可以批量生成和修改 JSON/ScriptableObject，无需重新编译即可在游戏中验证。

#### 数据分层

| 层级 | 职责 | 格式 | 编辑者 |
|-|-|-|-|
| 静态数据（Static Data） | 单位模板、卡牌定义、建筑蓝图、敌人属性、Boss 规则 | ScriptableObject (.asset) + JSON | 策划 + AI 生成 |
| 运行时数据（Runtime Data） | 对局中的实例状态（血量、位置、升级分支、Buff） | 内存对象（C# Class） | 运行时 |
| 存档数据（Save Data） | 对局存档、Meta 进度 | JSON | 系统自动 |
| 配置数据（Config） | 平衡参数、难度系数、UI 配置 | JSON | 策划 |

#### 统一数据 ID 规范

所有内容条目使用 `snake_case` ID，全局唯一：

- 单位：`unit_shieldbearer`、`unit_archer_a`（A 分支）、`unit_archer_b`（B 分支）
- 卡牌：`card_unit_cavalry`、`card_tactic_fire_oil`、`card_formation_turtle`
- 建筑：`building_wall`、`building_arrow_tower`
- 敌人：`enemy_shield_crusher`、`enemy_burrower`
- Boss：`boss_city_breaker`、`boss_tide_mother`

#### Card 数据结构

```csharp
[CreateAssetMenu(fileName = "NewCard", menuName = "Emberhold/Card")]
public class CardData : ScriptableObject
{
    public string cardId;           // 唯一 ID
    public string cardName;         // 显示名称
    public CardLayer layer;         // Armory / Tactic
    public CardCategory category;   // Unit / Building / Tactic / Formation / Edict
    public int costDay;             // 白天金币费用
    public int costNight;           // 夜间战意费用（Armory 卡为应急增援倍率基数）
    public string effectDescription;
    public List<EffectData> effects; // 效果列表（数据驱动）
    public TargetType targetType;
    public float duration;
    public Rarity rarity;
    public string upgradeBranchAId; // A 分支升级目标 ID
    public string upgradeBranchBId; // B 分支升级目标 ID
    public List<string> synergyTags; // 协同标签：fire / ice / archer / fortification...
    public List<string> counterplayTags; // 反制标签
    public Sprite cardIllustration;
}
```

#### Unit 数据结构

```csharp
[CreateAssetMenu(fileName = "NewUnit", menuName = "Emberhold/Unit")]
public class UnitData : ScriptableObject
{
    public string unitId;
    public string unitName;
    public UnitRole role;           // Shield / Pike / Archer / Cavalry / Engineer / Healer / Mage / Behemoth
    public int squadSize;           // 3–8
    public int militaryCost;        // 军令消耗 1–3
    public float maxHealth;
    public float attackDamage;
    public float attackRange;
    public float attackSpeed;
    public DefenseType defenseType; // Heavy / Medium / Light / None
    public float moveSpeed;
    public string passiveSkillId;
    public string activeSkillId;
    public string branchAId;
    public string branchBId;
    public List<string> synergyTags;
    public GameObject unitPrefab;   // 视觉预制体
}
```

#### Building 数据结构

```csharp
[CreateAssetMenu(fileName = "NewBuilding", menuName = "Emberhold/Building")]
public class BuildingData : ScriptableObject
{
    public string buildingId;
    public string buildingName;
    public BuildingCategory category; // Defense / Offense / Support / Utility
    public int workCost;              // 工令消耗
    public int goldCost;
    public float maxDurability;
    public float buildTime;           // 白天建造时间（秒）
    public bool canRepairAtNight;     // 是否允许夜间修复
    public string branchAId;
    public string branchBId;
    public List<string> synergyTags;
    public List<EffectData> passiveEffects; // 常驻效果（如龙息信标光环）
    public GameObject buildingPrefab;
}
```

#### Enemy 数据结构

```csharp
[CreateAssetMenu(fileName = "NewEnemy", menuName = "Emberhold/Enemy")]
public class EnemyData : ScriptableObject
{
    public string enemyId;
    public string enemyName;
    public EnemyType type;           // Tank / Swarm / Assassin / Siege / AntiTower / AntiArmy / Ranged / Healer / Summoner
    public float maxHealth;
    public float damage;
    public float attackRange;
    public float moveSpeed;
    public TargetPriority targetPriority; // Wall / Tower / MainKeep / Squad
    public string specialAbilityId;  // 特殊能力（掘地/飞行/治疗/召唤等）
    public List<string> counteredBy; // 被哪些单位/建筑/卡牌克制
    public GameObject enemyPrefab;
}
```

#### Boss 数据结构

Boss 是「规则改写者」，数据结构需支持运行时规则注入：

```csharp
public class BossData : ScriptableObject
{
    public string bossId;
    public string bossName;
    public string themeDescription;
    public List<PhaseData> phases;   // 多阶段数据（如烬王 3 阶段）
    public List<RuleModifier> ruleModifiers; // 本局规则改写（如碎城者免疫塔伤）
    public string antiBuildTag;      // 惩罚的 Build 标签
    public string rewardCardId;      // 击败奖励
}
```

#### 数据验证流水线

AI 批量生成 JSON/ScriptableObject 后，必须通过自动化验证：

1. **ID 唯一性检查**：所有 `*_id` 字段全局唯一
2. **引用完整性检查**：`upgradeBranchAId`、`counteredBy` 等引用必须指向存在的条目
3. **数值范围检查**：费用、伤害、血量在预设范围内（防止 AI 生成离谱数值）
4. **Tag 一致性检查**：`synergyTags` 和 `counterplayTags` 必须在预定义词典中
5. **Prefab 存在检查**：所有 `*_prefab` 引用必须在 Addressables 中注册

验证脚本作为 Editor 工具运行，在 CI 中自动执行。

> **硬约束落实**：数据驱动架构通过 ScriptableObject + JSON 双轨实现；AI 可批量生成内容；验证流水线保证数据质量。

---

### 31.6 模块划分

#### 模块架构图（逻辑分层）

```
┌─────────────────────────────────────────────────────────────┐
│  Presentation Layer（表现层）                                │
│  - HUD Manager / Card UI / Build UI / Menu System           │
│  - Camera Controller（3 档缩放）                             │
│  - VFX Manager（粒子池 + Shader 效果）                      │
│  - Audio Manager（动态混音）                                 │
├─────────────────────────────────────────────────────────────┤
│  Gameplay Layer（玩法层）                                    │
│  - DayNightCycle（昼夜循环控制器）                           │
│  - Squad Manager（班级管理：12 班状态 + 指令）              │
│  - Building Manager（建筑管理：建造/升级/修复）              │
│  - Card System（双层牌库：军械册 + 战术手牌）               │
│  - Combat Manager（战斗管理：波次/接敌/战意）                │
│  - Commander System（指挥官：规则改写 + 终极技）             │
│  - Economy Manager（经济：金币/战意/容量）                   │
├─────────────────────────────────────────────────────────────┤
│  Content Layer（内容层）                                     │
│  - Data Registry（静态数据注册表：所有 SO 统一管理）         │
│  - Card Registry / Unit Registry / Building Registry        │
│  - Enemy Registry / Boss Registry / Law Registry           │
│  - Event Registry / WarBanner Registry                     │
├─────────────────────────────────────────────────────────────┤
│  Core Systems（核心系统）                                    │
│  - SaveLoad System（存档/读档）                              │
│  - Input Manager（键鼠 + 手柄）                              │
│  - Localization（本地化）                                    │
│  - Achievement System（成就/图鉴）                           │
│  - Settings Manager（设置）                                  │
├─────────────────────────────────────────────────────────────┤
│  Infrastructure（基础设施）                                  │
│  - Pathfinding（A* + Flow Field + RVO）                     │
│  - Behavior Tree（班级 AI）                                  │
│  - Object Pool（对象池：单位/特效/投射物）                   │
│  - Addressables（资源加载/热更）                             │
└─────────────────────────────────────────────────────────────┘
```

#### 模块依赖规则

- **表现层** → 只能依赖玩法层和核心系统
- **玩法层** → 只能依赖内容层和核心系统，模块间尽量减少直接调用（通过 Event Bus 解耦）
- **内容层** → 无依赖，纯数据
- **核心系统** → 无依赖，可被任何上层调用
- **基础设施** → 无依赖，服务化设计

#### Event Bus 设计

模块间通信使用事件总线（ScriptableObject-based Event Bus），避免直接引用：

- `OnDayStart`、`OnNightStart`、`OnWaveStart`、`OnSquadDied`
- `OnCardPlayed`、`OnBuildingDestroyed`、`OnBossPhaseChanged`
- `OnGoldChanged`、`OnMilitaryCapacityChanged`

事件系统让 AI 生成的代码模块可以「即插即用」，降低耦合度。

---

### 31.7 测试策略

#### 测试金字塔

| 层级 | 占比 | 内容 | 工具 |
|-|-|-|-|
| 单元测试 | 50% | 数据验证、效果计算、经济公式、战斗模拟 | Unity Test Framework + NUnit |
| 集成测试 | 30% | 模块交互、事件总线、存档/读档一致性 | Unity Test Framework |
| gameplay 测试 | 15% | 战斗模拟器（离线跑 1000 局） | 自定义战斗模拟器 |
| 手动 QA | 5% | 手感、UI、视觉、音频 | 人工测试 |

#### 战斗模拟器（核心测试工具）

独立于游戏运行的 headless 战斗模拟器：

- 输入：单位配置、建筑配置、敌人波次、AI 策略脚本
- 输出：胜率、平均时长、资源曲线、伤亡分布
- 用途：在开发阶段快速验证平衡性，无需人工打 100 局
- AI 应用场景：AI 生成新卡牌/单位后，自动跑模拟器验证是否破坏平衡

#### 数据验证自动化

每次内容更新（AI 批量生成或人工修改）后，CI 自动执行：

1. 数据 schema 校验（JSON 结构正确性）
2. ID 引用完整性检查
3. 数值范围检查
4. 数据冗余检查（重复的 effect 描述）
5. 平衡性基线检查（通过战斗模拟器跑标准场景）

---

### 31.8 性能预算落实方案

#### 性能预算总表

| 指标 | 预算 | 落实手段 | 验证方式 |
|-|-|-|-|
| 友方渲染单位 | ≤80 | GPU Instancing + 按班聚合 | 运行时统计面板 |
| 敌方渲染单位 | ≤150 | GPU Instancing + 流场降级 + LOD | 运行时统计面板 |
| 同屏特效粒子 | ≤200 | 粒子池 + 优先级衰减 | VFX Manager 计数 |
| 大型特效位 | ≤8 | 队列管理，新特效挤掉最旧 | VFX Manager 队列 |
| Draw Calls | ≤30 | Instancing + Static Batching | Unity Profiler |
| 帧率 | ≥60fps@1080p | URP 轻量管线 + LOD | 核显笔记本实测 |
| 内存峰值 | ≤1.5GB | Addressables 分载 + 对象池 | Unity Profiler |
| 存档写入 | ≤500ms | JSON 序列化 + 异步 IO | 手动计时 |

#### 运行时监控面板

开发阶段内置性能监控面板（Debug 模式专用）：

- 实时显示：渲染单位数、Draw Calls、粒子数、帧率、内存
- 超预算时红色警告，记录到日志
- 发布版自动关闭

#### 目标平台最低配置

| 配置项 | 最低配置 | 推荐配置 |
|-|-|-|
| CPU | i3-8100 / Ryzen 3 2200G | i5-10400 / Ryzen 5 3600 |
| GPU | Intel UHD 630 / Vega 8 | GTX 1060 / RX 580 |
| RAM | 4GB | 8GB |
| 存储 | 2GB SSD | 2GB SSD |
| OS | Windows 10 64bit | Windows 10/11 64bit |

> **硬约束落实**：性能预算通过技术方案（Instancing、流场、粒子池、LOD）和工具（运行时监控、Profiler）双重保证；最低配置目标为核显笔记本 60fps。

---

### 31.9 硬约束对应检查表

| 硬约束（来自核心设计文档） | 技术落实方案 | 状态 |
|-|-|-|
| 同屏实体 ≤80 友方 / ≤150 敌方 | GPU Instancing + 流场降级 + LOD + 运行时监控 | ✅ 已落实 |
| 2.5D 正交渲染 | URP 正交相机 + 后处理 LUT 昼夜切换 | ✅ 已落实 |
| PC/Steam 平台 | Unity 2022.3 LTS + Windows/macOS/Steam Deck | ✅ 已落实 |
| 存档粒度 = 昼夜边界 | 昼夜边界 JSON 存档 + 夜间内存临时回退点 | ✅ 已落实 |
| 数据驱动架构 | ScriptableObject + JSON + 数据验证流水线 | ✅ 已落实 |
| 内容量级清单 | 数据注册表统一管理 + Addressables 分载 | ✅ 已落实 |

#### 约束合理性评估

| 约束 | 评估 | 说明 |
|-|-|-|
| 同屏 ≤80 友方 / ≤150 敌方 | **合理，建议维持** | 在 URP + Instancing 下核显 60fps 有充分余量；规模再扩大会冲击可读性支柱 |
| 2.5D 正交渲染 | **合理，建议维持** | 美术方向已定案；正交投影对塔防/策略类的信息密度最优 |
| 存档粒度 = 昼夜边界 | **合理，建议维持** | 设计意图明确（夜中不存档增加紧张感）；技术实现无难度 |
| 数据驱动架构 | **合理，核心前提** | 若改为硬编码，AI 批量生成内容的优势丧失 80% |
| 内容量级 | **合理，留有余量** | 200 张卡、8 单位、9 建筑等量级在 Unity Addressables 管理下无压力 |

**无约束需要修改。**

---

## 第 32 节：AI 开发工作流

### 32.1 AI 能力分层

基于本游戏「独立开发 + 大量 AI 协作」的核心前提，将开发工作按 AI 适合度分层：

#### 🟢 AI 最适合（高置信度 delegation）

| 工作类型 | 具体任务 | AI 工具 | 人类职责 |
|-|-|-|-|
| **数据层批量生成** | 卡牌效果描述、单位属性表、敌人参数、事件文本 | GPT-4 / Claude | 审核、平衡校准、注入创意方向 |
| **代码骨架生成** | Manager 类框架、数据类定义、事件系统、工具函数 | GPT-4 / Codex | 代码审查、架构一致性检查 |
| **单元测试生成** | 为已有函数生成测试用例 | GPT-4 / Codex | 验证测试覆盖度 |
| **Shader/特效原型** | 简单 Shader（昼夜 LUT、地形状态着色） | GPT-4 + ShaderToy 参考 | 性能优化、集成到 URP |
| **UI 布局原型** | 基于设计描述的 UI 布局代码 | GPT-4 / v0.dev | 视觉精调、交互手感 |
| **本地化文本** | 多语言翻译（中→英→日等） | GPT-4 / DeepL | 文化语境审核 |
| **文档与注释** | 代码注释、API 文档、设计文档润色 | GPT-4 / Claude | 技术准确性审核 |

#### 🟡 AI 可以辅助（中置信度，需人类复核）

| 工作类型 | 具体任务 | AI 工具 | 人类职责 |
|-|-|-|-|
| \*\* gameplay 代码\*\* | 战斗逻辑、卡牌效果执行、经济计算 | GPT-4 / Claude | 逻辑正确性验证、边界 case 测试、与现有系统集成 |
| **寻路/AI 行为** | 行为树节点、流场算法实现 | GPT-4 / Claude | 性能测试、与实体系统对接 |
| **存档系统** | JSON 序列化、存档版本迁移 | GPT-4 | 数据完整性测试、边缘 case 处理 |
| **音效原型** | 基于描述的音效参数生成 | AI Audio 工具 | 实际听感筛选、混音集成 |
| **2D 美术原型** | UI 元素、图标、卡面草图 | Midjourney / Stable Diffusion | 风格统一、细节精修、矢量重绘 |
| **音乐原型** | 氛围音乐片段、动机生成 | Suno / Udio | 编曲选择、动态混音系统实现 |
| **关卡/地图生成** | 基于种子和规则的地图布局 | GPT-4 + 程序化生成 | 可玩性验证、手动调整 |

#### 🔴 人类必须负责（低置信度，AI 只能提供参考）

| 工作类型 | 具体任务 | 为什么 AI 不适合 | AI 可提供的帮助 |
|-|-|-|-|
| **核心架构设计** | 模块划分、数据流设计、性能预算 | 需要对整个系统的 trade-off 有全局理解；AI 倾向于局部最优 | 生成参考方案、对比分析 |
| **手感调校** | 战斗节奏、操作响应、卡牌打出反馈 | 需要玩家直觉和反复试玩；AI 无法「感受」 | 提供参数范围建议 |
| **视觉风格定调** | 美术方向、色彩语言、角色设计 | 需要一致的审美判断和品牌意识 | 生成参考图、风格板 |
| **叙事与世界观** | 指挥官背景、领地设定、Boss 主题 | 需要整体叙事一致性 | 生成文案草稿、润色 |
| **音效整合** | 混音平衡、动态音乐系统、音频技术选型 | 需要实际听感和技术经验 | 提供实现代码框架 |
| **最终 QA 与发布** | 手感受测、平台兼容性测试、Steam 发布流程 | 需要实际运行验证和平台经验 | 检查清单生成、流程文档 |
| **核心 Hook 保护** | 防止设计偏离「城堡即卡组」的核心体验 | 只有人类能理解「体验意图」 | 反向审查清单 |

---

### 32.2 风险控制

#### AI Coding 风险矩阵

| 风险 | 严重程度 | 发生概率 | 缓解措施 |
|-|-|-|-|
| **生成代码无法编译** | 中 | 高 | 强制要求 AI 生成完整可编译代码块；每次生成后立即编译验证；不通过不合并 |
| **生成代码逻辑错误** | 高 | 中 | 单元测试覆盖所有 AI 生成代码；战斗模拟器验证 gameplay 逻辑；Code Review 强制流程 |
| **AI 不理解项目上下文** | 中 | 高 | 维护项目上下文文档（架构图、数据规范、命名约定）作为 AI prompt 前缀；使用 RAG 检索项目代码 |
| **AI 生成与现有代码风格不一致** | 低 | 高 | 配置 .editorconfig + StyleCop 规则；AI prompt 中嵌入代码风格示例 |
| **AI 引入安全漏洞** | 低 | 低 | 不处理网络/支付/敏感数据；存档 JSON 做 schema 校验防注入 |
| **AI 生成过时代码** | 中 | 中 | 在 prompt 中指定 Unity 版本和 API 版本；定期更新 AI 的上下文知识 |

#### 代码一致性保障

1. **架构契约文档**：维护一份 `ARCHITECTURE_CONTRACT.md`，明确模块边界、命名规范、数据流规则。所有 AI 生成代码前必须引用此文档。
2. **接口冻结期**：每个模块的公共接口在设计阶段冻结，AI 在接口约束内生成实现代码。
3. **自动化 Lint**：EditorConfig + StyleCop + Unity 的 Code Analysis，提交前自动检查。
4. **代码所有权标记**：每个文件顶部注释标记 `// Generated by AI` 或 `// Human written`，便于追踪和复核。

#### Game Design Drift 防护

AI 生成的内容（卡牌、单位、事件）容易偏离核心设计方向：

- **设计锚点文档**：维护 `DESIGN_ANCHORS.md`，列出不可违背的设计原则（如「Meta 零数值」「双层牌库」「工令/军令双池」）。
- **生成模板约束**：AI 生成卡牌/单位时，必须使用固定模板（字段列表、数值范围、Tag 词典），不能自由发挥。
- **自动漂移检测**：数据验证流水线检查新生成内容是否违反设计锚点（如检测到 +5% 数值类 Meta 解锁即报错）。
- **每周设计审查**：人工审查 AI 生成内容，判断是否偏离核心 Hook。

#### 资产一致性保障

AI Art / AI Audio 生成的资产风格容易不统一：

- **风格板锁定（Style Lock）**：在 AI 图像生成工具中固定 seed + style reference，所有资产基于同一风格板生成。
- **后处理统一管线**：所有 AI 生成的 2D 资产通过同一后处理流程（色调统一、边缘处理、分辨率标准化）。
- **音频风格指南**：为 AI Audio 工具编写固定的 prompt 模板（乐器组合、节奏范围、情绪关键词），确保音乐风格一致。
- **人工终审**：所有 AI 生成资产在入项目前经过人类审美审核。

#### 测试与调试策略

| 测试类型 | AI 角色 | 人类角色 |
|-|-|-|
| 单元测试 | 生成测试用例代码 | 验证覆盖率、补充边界 case |
| 集成测试 | 生成测试场景脚本 | 验证模块间交互 |
| 平衡测试 | 通过战斗模拟器跑批量对局 | 分析异常结果、调整设计 |
| 性能测试 | 生成性能监控代码 | 分析 Profiler 数据、定位瓶颈 |
| 手感受测 | 不可代劳 | 实际游玩、记录问题 |
| Bug 调试 | 辅助分析日志、生成修复建议 | 判断根因、验证修复 |

#### 集成风险与缓解

| 风险场景 | 影响 | 缓解 |
|-|-|-|
| AI 生成模块 A 与模块 B 接口不匹配 | 编译/运行错误 | 接口冻结期 + 编译即验证 |
| AI 生成内容数据格式升级后旧存档不兼容 | 存档损坏 | 存档版本号 + 自动迁移脚本（由 AI 生成，人类审核） |
| AI 生成的 Shader 在某些 GPU 上编译失败 | 渲染错误/崩溃 | Shader 在目标 GPU（含核显）上实测 |
| AI 生成的美术资源文件过大 | 包体膨胀 / 加载慢 | 自动检查文件大小 + 压缩流程 |
| 多个 AI 会话同时修改同一文件 | 合并冲突 | 按模块划分 AI 会话范围，避免交叉 |

---

## 第 33 节：开发范围

### 33.1 MVP：真正可玩的最小版本

MVP 目标：**验证核心 Hook（白天建堡、夜里守城、双层牌库）是否成立**。不是技术演示，是完整可玩的「一个领地 + 一位指挥官 + 三个昼夜循环」。

#### MVP 包含（Must Have）

| 系统 | MVP 范围 | 为什么必须 |
|-|-|-|
| **昼夜循环** | 完整的白天建造 + 夜间守城 + 结算流程 | 核心 Hook 的骨架 |
| **双层牌库** | 军械册（6 张单位/建筑卡）+ 战术手牌（5 张战术卡） | 核心 Hook 的灵魂 |
| **建造系统** | 3 种建筑：城墙、箭塔、兵营 | 验证「落阵」机制 |
| **军团系统** | 3 种单位：盾卫、弓手、枪卒 | 验证班级指挥 + 半自动战斗 |
| **敌人系统** | 2 种敌人：狼群、盾卫 | 验证夜间防守张力 |
| **指挥官** | 1 名：奥恩（基础规则） | 验证指挥官对 Build 的塑形能力 |
| **经济系统** | 金币 + 战意 + 军令/工令容量 | 验证昼夜资源张力 |
| **1 张领地地图** | 1 张固定地图，3 个昼夜循环 | 验证完整对局体验 |
| **UI/HUD** | 昼夜双态 HUD、手牌显示、建造轮盘 | 可玩性最低要求 |
| **存档** | 昼夜边界存档 | 支持中断续玩 |

#### MVP 排除（Out of Scope）

| 排除项 | 原因 |
|-|-|
| A/B 升级分支 | MVP 中单位/建筑只有基础形态，升级仅数值提升 |
| 领地扩张 / 地图节点选择 | MVP 为单张固定地图 |
| 精英夜 / Boss 战 | MVP 终局为普通波次加强版 |
| 事件系统 | 复杂度超出 MVP 验证需求 |
| 市集 / 商店 | MVP 中卡牌获取固定为每夜奖励 |
| 诅咒系统 | 非核心体验验证所需 |
| 战旗系统 | MVP 中无领地攻克奖励 |
| Meta 解锁（王国厅） | MVP 为单局体验，无局间循环 |
| 3 名额外指挥官 | 仅奥恩 |
| 5 种进阶单位 | 仅盾卫/弓手/枪卒 |
| 6 种进阶建筑/塔 | 仅城墙/箭塔/兵营 |
| 音效/音乐 | 可用临时音效或静默 |
| 手柄支持 | 键鼠即可 |
| 多语言 | 仅中文 |

#### MVP 验收标准

- [ ] 玩家能在 5 分钟内理解「白天建造、夜间防守」的节奏

- [ ] 玩家能在第一局打出「落阵→守城→手牌调度」的完整 loop

- [ ] 玩家能感受到「我的城堡就是我的卡组」（卡牌打出后变成场上实体）

- [ ] 一局 3 昼夜可在 15 分钟内完成

- [ ] 无阻塞性 Bug，帧率 ≥60fps

---

### 33.2 Full Version 1.0：正式 Steam 产品

Full v1.0 在 MVP 基础上扩展至核心设计文档定义的全部内容。

#### Full v1.0 新增（相对于 MVP）

| 系统 | Full v1.0 范围 |
|-|-|
| **单位** | 8 种单位全部 + A/B 分支（16 种终态） |
| **建筑/塔** | 9 种建筑 + 8 种塔 + A/B 分支（34 种终态） |
| **卡牌** | 初始 60 张（军械册 + 战术卡 + 阵型卡 + 遗令卡） |
| **敌人** | 9 种敌人全部 |
| **Boss** | 9 个 Boss 全部（含终局烬王 3 阶段） |
| **指挥官** | 4 名全部 + 专属卡池 |
| **地图系统** | 领地节点选择 + 8 张领地地图模板 |
| **事件系统** | 30+ 事件 |
| **战旗系统** | 30 条战旗 |
| **诅咒/法则** | 20 条荒土法则 |
| **Meta 解锁** | 王国厅完整树（指挥官/卡/建筑/图鉴/外观） |
| **难度系统** | Normal / Hard / Expert / Wasteland |
| **无尽模式** | 无尽围城（专家基础上无终止夜） |
| **图鉴/成就** | 敌人图鉴、Build 图鉴、成就系统 |
| **音频** | 完整音乐（昼夜双轨×3 烈度）、SFX、UI 音 |
| **UI 完整版** | 完整 HUD、菜单、设置、统计 |
| **输入** | 键鼠 + 手柄双支持 |
| **本地化** | 中/英/日（首发三语） |
| **Steam 集成** | 成就、云存档、排行榜 |

#### Full v1.0 排除（Post-Launch 再做）

| 排除项 | 原因 |
|-|-|
| 新领地地图（第 9 张以后） | 8 张已足够支撑 80–120 小时游戏时间 |
| DLC 内容 | 发布后根据反馈规划 |
| 每周挑战种子排行榜（全球） | 需要后端服务，v1.0 用本地榜替代 |
| 社区模组支持 | 数据驱动架构已预留接口，但正式支持需额外工具 |
| 额外语言（韩/德/法/西） | 根据销量数据决定 |

---

### 33.3 Post-Launch：追加内容方向

按优先级排序：

| 优先级 | 内容方向 | 预估规模 | 商业定位 |
|-|-|-|-|
| P0 | **新领地地图 ×4**（森林深处、熔岩荒原、冰封峡湾、天空废墟） | 每张含新地形 + 新敌人配置 + 新 Boss | 免费更新（维持社区活跃） |
| P0 | **新指挥官 ×2–3** | 每名含规则改写 + 专属卡池 | 免费更新 |
| P1 | **新敌人 ×3–5 + 新 Boss ×2–3** | 数据驱动，主要成本在美术 | 免费更新 |
| P1 | **卡牌扩展包 ×1**（+40 张新卡） | 数据驱动 + 美术 | 免费更新或低价 DLC |
| P2 | **每周挑战种子 + 全球排行榜** | 需要轻量后端（或 Steam Leaderboard API） | 免费更新 |
| P2 | **社区模组工具** | 数据编辑器 + Steam Workshop 集成 | 免费更新 |
| P3 | **剧情模式 / 战役** | 非 Roguelite 的固定关卡叙事线 | 付费 DLC |
| P3 | **新美术主题包** | 季节/节日主题外观 | 付费 DLC（纯外观） |

---

### 33.4 砍掉清单：看起来酷但应该砍的功能

以下功能在讨论中可能出现，但基于「开发成本 vs 玩家体验」分析，**建议直接砍掉**：

| 功能 | 看起来酷的地方 | 砍掉的核心理由 | 替代方案 |
|-|-|-|-|
| **天气系统**（雨/雪/沙暴影响战斗） | 增加战场氛围和随机性 | 与「威胁预演全可见」的设计支柱冲突；增加大量视觉和逻辑复杂度，但对 Build 决策无实质影响 | 通过领地类型（森林/矿区/河谷）静态表达环境差异 |
| **科技树** | 长期投入感、文明演进 | 与 Roguelite「每局重置」的核心循环冲突；与 A/B 分支系统职责重叠 | A/B 分支已覆盖「技术选择」 |
| **英雄装备系统** | RPG 成长感 | 指挥官系统已提供「规则身份」；装备会让系统复杂度翻倍，且与「Meta 零数值」冲突 | 指挥官 A/B 分支 + 战旗已足够 |
| **士气系统** | 军团心理模拟 | 10 个联动系统已足够；士气条增加玩家认知负担（HUD 上多一个数字），且与「十秒可读」支柱冲突 | 通过班级阵亡的视觉反馈（旗帜落地）表达 |
| **外交/贸易事件链** | 叙事深度、选择后果 | 与 40 分钟一局的节奏冲突；事件系统 30+ 条已覆盖「风险契约」 | 现有事件系统足够 |
| **飞行单位 / 空战** | 立体战场 | 2.5D 正交视角下空战可读性差；需要全新寻路层和碰撞系统 | 通过「掘地者」和「飞行敌人（若有）」的简化处理 |
| **多人在线/联机** | 社交传播、竞技 | 核心设计文档已明确「纯单机」；联机需要重写战斗同步和反作弊，工作量 = 再做半个游戏 | 排行榜 + 种子挑战提供社交竞争 |
| **完整配音** | 沉浸感、角色塑造 | 独立游戏预算有限；AI 语音质量不稳定；非语言战吼已足够表达情绪 | 发布版维持非语言战吼，若成功再考虑 DLC 配音 |
| **实时光追/全局光照** | 画面升级 | 与 2.5D 低多边形美术方向冲突；性能开销核显无法承受；对游戏性零贡献 | 烘焙光照 + LUT 后处理已足够 |
| **动态地形破坏**（除坝体外） | 战场可变、战术深度 | 除坝体/城墙外，其他地形静态是设计定案；全面破坏会让寻路和 AI 复杂度指数级上升 | 仅保留坝体/城墙破坏 |

---

## 第 34 节：开发估算

以下九个维度按 **Low / Medium / High / Very High** 四级评估，基于「独立开发 + 大量 AI Coding 协作」的前提。

### 34.1 Programming（编程）：**High**

| 子项 | 评级 | 说明 |
|-|-|-|
| 核心 gameplay 系统 | High | 双层牌库、半自动战斗、昼夜循环、经济系统——逻辑复杂但边界清晰 |
| 寻路与 AI | Medium | 流场 + RVO + 行为树，方案成熟；150 敌人降级策略降低复杂度 |
| 数据驱动架构 | Medium | ScriptableObject + JSON 标准方案；主要工作在数据验证流水线 |
| 存档系统 | Low | JSON 序列化，版本迁移逻辑简单 |
| UI 系统 | Medium | 昼夜双态 HUD、建造轮盘、手牌系统——交互逻辑多但无新技术 |
| 渲染与特效 | Medium | URP 正交 + 粒子池 + Shader——方案明确 |
| 集成与调试 | High | 10 个系统的联动调试 + AI 生成代码的审查修正 |

**整体 High 理由**：系统数量多（10+ 个 gameplay 系统）、联动复杂（六维联动矩阵）、AI 生成代码需要大量审查和修正。虽然单个系统不尖端，但系统集成是主要工作量。

### 34.2 Game Design（游戏设计）：**High**

| 子项 | 评级 | 说明 |
|-|-|-|
| 核心机制设计 | Medium | 已在前序文档中定案；技术架构线不负责重新设计 |
| 平衡调校 | High | 200 张卡 × 10 种 Build × 4 指挥官 × 9 敌人 × 9 Boss = 海量组合需要反复调校 |
| 内容填充 | High | 60 张初始卡、8 单位、9 建筑、8 塔、9 敌人、9 Boss、30 事件、20 法则——数据量大 |
| AI 辅助设计 | Medium | AI 可生成内容草稿，但平衡和一致性需要人类大量介入 |

**整体 High 理由**：内容量级大（核心设计文档列出的全部内容），且平衡性调校需要大量对局测试。AI 可加速内容生成，但无法替代人类对「手感」和「深度」的判断。

### 34.3 Art（美术）：**High**

| 子项 | 评级 | 说明 |
|-|-|-|
| 3D 模型（单位/建筑/Boss） | High | 8 单位 ×2 分支、9 建筑 ×2、8 塔 ×2、9 敌人、9 Boss = 大量低多边形模型 |
| 纹理与材质 | Medium | 手绘质感纹理，风格统一是关键 |
| 场景/地形 | Medium | 8 张领地地图模板，低多边形场景 |
| UI 美术 | Medium | 卡面、HUD、图标、建造轮盘 |
| VFX | Medium | 粒子特效、Shader 效果（火/冰/毒等） |
| AI Art 辅助 | Medium | 可加速 2D 资产（卡面、图标），3D 模型仍需人工建模或重拓扑 |

**整体 High 理由**：3D 资产总量大，AI Art 工具（Midjourney/SD）对 3D 模型的直接产出仍不成熟，大部分 3D 资产需人工制作。低多边形风格降低了单资产复杂度，但数量决定了总工作量。

### 34.4 Animation（动画）：**Medium**

| 子项 | 评级 | 说明 |
|-|-|-|
| 单位动画 | Medium | 8 帧基础 ×4 状态（待机/移动/攻击/死亡）× 约 30 个单位类型 = 量级可控 |
| Boss 动画 | Medium | 9 个 Boss 需要更复杂的动画，但低多边形风格简化了动画复杂度 |
| 建筑动画 | Low | 建造/升级瞬间动画，数量少 |
| UI 动画 | Low | 抽牌、打出、伤害数字等标准动画 |

**整体 Medium 理由**：低多边形风格显著降低了动画复杂度（8 帧基础动画已足够）；无复杂骨骼绑定和面部动画需求。AI 动画工具（如 Meshy、Runway）可辅助生成基础动画循环。

### 34.5 UI（用户界面）：**Medium**

| 子项 | 评级 | 说明 |
|-|-|-|
| HUD 设计 | Medium | 昼夜双态 HUD，信息密度高但结构清晰 |
| 建造轮盘 | Medium | 弧形轮盘 + 联动提示连线，交互设计有挑战 |
| 卡面 UI | Medium | 5 张手牌 + 军械册界面，需要良好的信息层级 |
| 菜单/设置 | Low | 标准菜单系统 |
| 手柄适配 | Medium | 所有 UI 需支持手柄导航 |

**整体 Medium 理由**：UI 复杂度来自信息密度（HUD 同时显示 7+ 个数字）和交互创新（建造轮盘协同提示），但无跨平台适配（仅 PC）和复杂界面（无背包/装备/技能树等 RPG UI）。

### 34.6 Audio（音频）：**Medium**

| 子项 | 评级 | 说明 |
|-|-|-|
| 音乐 | Medium | 昼夜双轨 ×3 烈度层 = 约 12 分钟循环素材；程序化混音降低总量 |
| SFX | Medium | 单位/建筑/卡牌/Boss 音效；合成器采样为主 |
| UI 音效 | Low | 标准 UI 音，可程序生成 |
| 语音 | Low | 非语言战吼，数量少 |
| AI Audio 辅助 | Medium | AI 音乐工具可生成原型和分轨；最终混音需人工 |

**整体 Medium 理由**：动态混音系统（程序化控制鼓点密度）降低了音乐总时长需求；SFX 以合成器为主，不依赖录音棚。AI Audio 工具（Suno/Udio）可大幅加速音乐原型制作。

### 34.7 QA（质量保证）：**High**

| 子项 | 评级 | 说明 |
|-|-|-|
| 功能测试 | Medium | 标准功能测试，自动化可覆盖大部分 |
| 平衡测试 | High | 200 张卡 × 海量组合，需要战斗模拟器 + 大量人工对局 |
| 性能测试 | Medium | 核显 60fps 目标，需多配置实测 |
| 兼容性测试 | Medium | Windows + macOS + Steam Deck |
| AI 生成内容 QA | High | AI 生成的代码和内容需要额外审查层 |

**整体 High 理由**：平衡性 QA 是最大变量——Roguelite 的随机组合让 100% 自动化测试不可能；AI 生成内容的「看起来对但实际上错」问题需要专门的 QA 流程。

### 34.8 AI Development（AI 协作开发难度）：**Medium**

| 子项 | 评级 | 说明 |
|-|-|-|
| AI 代码生成效率 | Medium | C# + Unity 是 AI 最友好的组合；但生成代码仍需审查和修正 |
| AI 内容生成效率 | High | 数据驱动架构让 AI 可批量生成卡牌/单位/事件；验证流水线保证质量 |
| AI 工作流搭建 | Medium | 需要维护 prompt 模板、上下文文档、验证工具 |
| 团队协作（人机） | Medium | AI 会话管理、版本控制、代码所有权追踪 |

**整体 Medium 理由**：虽然 AI 参与度高，但本项目的技术栈（Unity C#）和数据驱动架构是 AI 协作的「甜蜜点」。主要挑战在工作流搭建和生成内容的审查，而非 AI 能力本身。

### 34.9 Performance（性能优化）：**Medium**

| 子项 | 评级 | 说明 |
|-|-|-|
| 渲染性能 | Medium | 230 实体 + 200 粒子在 URP 下核显 60fps 有成熟方案 |
| 寻路性能 | Medium | 流场降级方案将 150 敌人寻路复杂度降至 O(grid) |
| 内存优化 | Low | 2.5D 低多边形资产内存占用低 |
| 加载优化 | Low | Addressables 分载 + 对象池 |

**整体 Medium 理由**：性能预算（80 友方/150 敌方/200 粒子）在现代引擎和硬件下不构成尖端挑战；核显 60fps 目标通过标准优化手段（Instancing、流场、粒子池）即可达成。无开放世界、无大规模物理、无实时光追。

---

### 34.10 综合估算汇总表

| 维度 | 评级 | 核心原因 |
|-|-|-|
| Programming | **High** | 系统多、联动复杂、AI 代码需审查 |
| Game Design | **High** | 内容量级大、平衡调校工作量大 |
| Art | **High** | 3D 资产总量大，AI Art 对 3D 直接产出有限 |
| Animation | **Medium** | 低多边形风格降低复杂度，无复杂骨骼 |
| UI | **Medium** | 信息密度高但结构清晰，无跨平台适配压力 |
| Audio | **Medium** | 程序化混音降低总量，AI Audio 可加速原型 |
| QA | **High** | 平衡性 QA 变量大，AI 生成内容需额外审查 |
| AI Development | **Medium** | 技术栈是 AI 甜蜜点，挑战在工作流而非能力 |
| Performance | **Medium** | 性能预算标准，无尖端技术需求 |

#### 基于评级的开发周期粗略估计

在「1–3 人核心团队 + 大量 AI 协作」的前提下：

| 阶段 | 预估周期 | 关键里程碑 |
|-|-|-|
| **MVP** | 2–3 个月 | 可玩 3 昼夜循环，验证核心 Hook |
| **Full v1.0** | 8–12 个月（含 MVP） | 完整 Steam 产品，全部内容实现 |
| **Post-Launch 首批更新** | 发布后 3–6 个月 | 新领地 ×2、新指挥官 ×1 |

> 注：以上为粗略估计，实际周期受团队产能、AI 工具成熟度、资产外包比例影响。建议以 2 周为 Sprint 周期，MVP 后根据实际 velocity 重新校准 Full v1.0 计划。

---

## 附录：核心设计文档硬约束 → 技术架构映射速查表

| 设计约束 | 技术方案 | 文档位置 |
|-|-|-|
| 同屏 ≤80 友方 / ≤150 敌方 | GPU Instancing + 流场降级 + LOD + 运行时监控 | 31.2、31.3、31.8 |
| 2.5D 正交渲染 | URP 正交相机 + LUT 后处理昼夜切换 | 31.2 |
| PC/Steam 首发 | Unity 2022.3 LTS + Windows/macOS/Steam Deck | 31.1 |
| 存档粒度 = 昼夜边界 | JSON 存档 + 夜间内存临时回退点 | 31.4 |
| 数据驱动架构 | ScriptableObject + JSON + 验证流水线 | 31.5 |
| 内容量级（200 卡/8 单位/9 建筑/9 敌人/9 Boss） | 数据注册表 + Addressables 分载 | 31.5、31.6 |
| 双层牌库（军械册/战术手牌） | Card System 模块 + 数据驱动效果执行 | 31.5、31.6 |
| 半自动控制（班级指令） | Squad Manager + 行为树 + 玩家指令层 | 31.3、31.6 |
| 10 种 Build 互克 + 环境轮换 | 数据表驱动敌人配置 + 战斗模拟器平衡测试 | 31.5、31.7 |
| Meta 零数值 | 王国厅只解锁「新选项」——数据表中无数值节点 | 31.5 |
| 十秒可读 | VFX 预算制度 + 班级视觉聚合 + 轮廓语言 | 31.2、31.8 |

---

> **文档边界说明**：本文档覆盖原始需求第 31–34 节。游戏玩法设计（第 1–30 节）已在核心设计主文档中定案，本文档不重复也不修改玩法设计。若技术实现中发现与核心设计的冲突，已在第 31.9 节「硬约束对应检查表」中列出并给出建议。