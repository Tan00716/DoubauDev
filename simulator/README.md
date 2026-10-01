# EMBERHOLD 战斗数值模拟器 v2.1

《烬堡 EMBERHOLD》无头战斗数值模拟器（Node.js CLI），批量模拟「昼采购 / 夜守城」循环并输出平衡报表。
v2.1 已对齐 game 源码 **commit 37f798f0**（M1 四批修复后）的战斗模型。

## 模型口径（与 game 逐条对齐）

| 口径 | 模拟器实现 | game 源码依据 |
| --- | --- | --- |
| B1 敌方伤害 | 事件式固定伤害，冷却 1.0s 门控，不乘 dt | combat.ts `data.damage * (1-reduction)` |
| B2 枪卒反冲锋 | 对 `move_speed>3.0` 敌人 dmg +50%，并入冷却分支；单枪卒 10s 输出 = ⌈10/1.3⌉×15 = 120 | combat.ts 冷却分支 |
| N2 齐射令 | 伤害 ×1.5 + 射程 ×1.3（按实现建模，卡面「攻速+50%」未消费） | tactics 实现 |
| I6 战意 | 接敌班每秒 0.5 + 撤退 5s 封锁 | game-state.ts WAR_SPIRIT 常量 |
| 盾墙令 | 0.3 减伤（仅班组承伤，不影响建筑/主堡） | combat.ts squadDamageReduction |
| I2 波次 | 每夜 3 波 + 15s 间隙 + 5s 首波预演 + 240s 兜底 | game-state.ts getWaveComposition |
| 军械册语义 | **每种卡唯一一张；同名再部署 = 升级**（HP +50%/级，Lv3 封顶）；阵亡/摧毁入归营堆，修复 = ⌈cost/2⌉，再落阵半血 | game-state.ts deployArmoryCard / applySquadUpgrade |
| 容量 | 军令 6 / 工令 8（满编 3/6、5/8 → M1 内永不阻塞） | DESIGN 常量 |
| 敌人移动 | 接敌 ×0.5 速度向目标、无目标全速向主堡；一维径向：入场半径 13.5 | combat.ts 55-130 行 |

**冷却补偿技巧**：攻击命中后 `cooldown += interval`（保留拍内提前量），使长时攻击节奏精确等于 ⌈t/interval⌉，dt=0.25 与 dt=0.05 结果一致（单测锁定）。

## 一维抽象保真度（重要口径说明）

一维径向模型中敌人接敌即停，串行布阵（半径间隔 1.0）时**只有最外层班组 + 远程班能接战**——单班独扛全部伤害且前排近战 DPS 缺席，严格难于 game 2D 多路径。对照实验（`scripts/targeting-compare.ts`，200 局×3 配置）：

| 配置 | baseline | turtle | aggressive |
| --- | --- | --- | --- |
| serial+nearest（默认，保守下界） | 6.0% | 22.0% | 1.0% |
| colocated+nearest（共址+集火，最坏） | 5.5% | 29.5% | 4.5% |
| colocated+spread（共址+分散承伤，近似 2D 上界） | 4.0% | 24.0% | 4.5% |

**结论：一维偏差仅 ±几个百分点，不改变「M1 修复后数值过难」的定性判断。** 默认口径 serial+nearest 作为保守下界。

## 新基线（seed 20261001，各 1000 局）

| preset | 胜率 | 平均存活 | 败因 | 败亡峰值 |
| --- | --- | --- | --- | --- |
| baseline | **3.8%** | 5.3 昼 | 主堡沦陷 ×962 | 第 4 夜（349） |
| turtle | **22.3%** | 7.0 昼 | 主堡沦陷 ×777 | 第 8 夜（235） |
| aggressive | **2.3%** | 3.1 昼 | 主堡沦陷 ×977 | 第 1 夜（509） |

旧基线 99.6% 已作废——B1 修复（敌方伤害从 dt 乘算恢复为事件式固定值）使难度方向反转：**当前数值过难**。

## 校准建议（供产品决策）

**推荐参数：敌方伤害 ×0.6**（game 侧取整落地：狼 6→4、粉碎者 10→6、掘地者 8→5），对应变体 `ease_dmg_0_6`。1000 局验证：

| preset | current | ease_dmg_0_6 |
| --- | --- | --- |
| baseline | 3.8% | **46.2%** |
| turtle | 22.3% | **53.8%** |
| aggressive | 2.3% | **39.8%** |

- 三 preset 全部落入 roguelite 主流 40–70% 难度带，Build 间差 14pp（current 差 18.5pp）
- 败亡集中第 7–8 夜（难度曲线后置：前期安全、终局施压）
- 备选：×0.5（更友好，53.5–68.5%）、×0.7（偏硬，32–47%）

**其它关键发现**：
- 夜时长 240s 兜底几乎不触发（各夜实测 50–75s），夜内空窗占比 65–88%——**前期夜节奏偏空**，建议后续考虑压缩夜时长或前移波次（操作密度数据支撑见报表）
- 军令 6 / 工令 8 容量在 M1 完全不构成压力（阻塞率 0%）：军械册每种卡唯一 + 同名升级语义 → 满编仅 3 军令 / 5 工令
- 撤退机制惩罚极重：撤退班当夜离场、主堡直接暴露（aggressive 50% 败在首夜即因此）

## Quick Start

```bash
npm install

# 新基线：三 preset × 1000 局
npm run simulate -- --preset all --runs 1000 --seed 20261001

# 推荐变体验证
npx tsx src/cli/simulate.ts --preset all --runs 1000 --variant ease_dmg_0_6

# 难度变体扫描（收紧 + 放宽）
npx tsx src/cli/simulate.ts --preset all --runs 200 --variants current,ease_dmg_0_5,ease_dmg_0_6,ease_dmg_0_7,dense_1_5x

# 一维 vs 2D 保真度对照实验
npx tsx scripts/targeting-compare.ts

# 单测（22 个，含口径锁定）
npm test
```

## 变体清单（DifficultyVariant）

收紧：`dense_1_5x` / `dense_2x` / `rebalanced`（波次重排）/ `dense_2_5x`
放宽：`ease_dmg_0_5` / `ease_dmg_0_6` / `ease_dmg_0_7`（敌方伤害乘数）/ `ease_count_0_75` / `ease_count_0_6`（敌群数量乘数）/ `ease_d07_c075`（组合）

## 目录结构

```
src/core/engine.ts     # 核心引擎（runNight / 采购 / 升级 / 归营堆 / 容量）
src/core/reporter.ts   # 批量报表与平衡标记
src/data/              # units/enemies/buildings/cards/waves/presets（与 game data 逐字段一致）
src/cli/simulate.ts    # CLI 入口
scripts/targeting-compare.ts  # 一维 vs 2D 保真度对照实验
tests/engine.test.ts   # 22 个单测（口径锁定 + 回归）
reports/               # 输出报表 JSON
```
