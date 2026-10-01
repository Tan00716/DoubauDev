# DoubauDev — 独立游戏研发仓库

本仓库承载独立游戏从设计到上架 Steam 的完整研发资产，当前处于 **M1 垂直切片开发阶段**。

## 项目：《烬堡 EMBERHOLD》

融合 Thronefall 式即时建造守城、城堡成长、军团战略、Roguelite 卡牌构筑的独立游戏。

**核心 Hook**：你的城堡，就是你的卡组——白天把牌建成城堡，夜里城堡变回你的手牌。

## 技术栈

TypeScript + Vite + Three.js（WebGL 2.5D 正交渲染）→ Electron 打包为 Steam 可上架的 Windows 构建。

## 目录结构

```
docs/                          # 设计与规划文档（飞书云文档导出的 Markdown 快照）
├── 01-game-design-master.md   # 游戏核心设计主文档（34 章，rev 26，审计修复后）
├── 02-tech-architecture.md    # 技术架构与开发规划（引擎对比/架构/AI 工作流/范围估算）
├── 03-web-tech-spec.md        # Web 技术实现规格（技术栈/数据 Schema/模块规格/打包路线）
├── 04-milestone-plan.md       # 开发里程碑验收计划（M1→MVP→v1.0→上架检查清单）
├── 05-design-audit.md         # 独立设计审计报告（五维度，23 条发现）
├── 06-steam-store-copy.md     # Steam 商店文案（中英双版）
└── 07-delivery-overview.md    # 成果总览（决策/一致性/风险/阅读顺序）
game/                          # 游戏源码（M1 垂直切片，已入库）
simulator/                     # 无头战斗数值模拟器（已入库，1000 局批量模拟 + 20/20 单测通过）
```

## 里程碑状态

| 里程碑 | 状态 |
|---|---|
| 核心设计 + 技术规格 + 审计 + Steam 文案 | ✅ 定稿（审计 11 项问题已修复） |
| M1 垂直切片（白天建堡+夜间守城+双层牌库+半自动操控） | ✅ 已完成（在线预览 + 源码已入库） |
| 无头战斗数值模拟器 | ✅ 已完成（1000 局批量模拟 + 20/20 单测通过） |
| MVP 可玩最小版本 | 🚧 待 M1 代码质检通过后启动 |
| Full v1.0 / Steam 上架 | ⏳ 规划见 docs/04 |

## 在线试玩（M1 垂直切片）

**https://miaoda.feishu.cn/app/app_17f6k92p44e**

点击「开始新游戏」即可体验完整昼夜循环：白天建堡（打出单位/建筑/塔卡）→ 夜间守城（半自动战斗：班级指令 + 战术牌 + 指挥官技）→ 夜末清算 → 天亮进入次日。

## 快速开始

```bash
# 游戏 M1 原型
cd game
npm install
npm run dev        # 本地开发
npm run build      # 生产构建

# 战斗数值模拟器
cd simulator
npm install
npm test           # 单测（20/20）
npx tsx src/simulate.ts --runs 1000 --preset baseline --out report.json
```

## 文档权威版本说明

`docs/` 下为飞书云文档的导出快照，各文档的最新权威版本始终在飞书侧（源链接见各文档内）。代码里程碑完成时同步更新快照。
