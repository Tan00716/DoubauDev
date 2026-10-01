# Emberhold 桌面构建（Electron + Steamworks）

MVP 批次四交付：把 `game/` 网页构建产物打包为可运行的 Windows 桌面构建。对应技规
`docs/03-web-tech-spec.md` §4（Steam 上架打包路线）。

## 一条命令出包（本地，Windows 10/11 + Node 20）

```bash
cd game
npm ci
npm run electron:build
```

产物输出到 `game/release/`：

- `Emberhold Setup x.y.z.exe` — NSIS 安装包（Steam 上架用）
- `Emberhold x.y.z.zip` — 便携版（自测用）

脚本内部执行：`npm test 前置的 build（tsc + vite build）` → `tsc -p electron`（编译桌面壳）
→ `electron-builder --win`。

开发模式（热加载 Vite 开发服务器）：

```bash
npm run electron:dev
```

## CI 自动构建（GitHub Actions）

`.github/workflows/build.yml`：推送 `v*` tag（或手动 workflow_dispatch）→ windows-latest
跑 `npm ci → npm test → npm run electron:build` → 构建产物上传为 artifact
（emberhold-windows，含 .exe 与 .zip）。后续接入 Steamworks 正式 App ID 与商店密钥后，
同一 workflow 可挂 steam-direct-deploy 步骤。

## Steamworks 集成点（MVP 预留）

| 功能 | 现状 | 启用方式 |
|-|-|-|
| 成就 | 接口已预留：`SteamIntegration.unlockAchievement` + preload 桥 `window.emberholdDesktop.steam` | `npm i steamworks.js`，替换 `electron/steam-integration.ts` 中 `init(480)` 为实际 App ID |
| 云存档 | 落点已预留：渲染层存档经 IPC 镜像到 `userData/saves/run.json`（Steam Cloud 自动同步目录） | 同上；Steam 后台开启 Cloud 后该文件自动上云 |
| 排行榜 / 统计 | v1.0 前接入，当前未暴露接口 | — |

关键设计：`steamworks.js` 为原生模块，MVP 未安装为依赖——`SteamIntegration.init()`
用运行时 `require` 探测，未安装 / 非 Steam 启动时返回 `false`，所有方法安全空操作。
**游戏核心代码（src/）零改动**：网页构建下 `window.emberholdDesktop === undefined`，
Electron 下由 preload 注入。游戏侧接线建议见 `preload.ts` 头注释。

## 结构

```
electron/
  main.ts               # 主进程：窗口 + IPC（成就 / 云存档镜像）
  preload.ts            # contextBridge 桌面桥（contextIsolation: true）
  steam-integration.ts  # Steamworks 集成点（优雅降级）
  tsconfig.json         # 桌面壳独立编译配置（CommonJS，输出 electron/dist/）
  types/electron.d.ts   # 沙箱静态验证用最小类型声明（本地装 electron 后可删）
  package.json          # {"type":"commonjs"}——覆盖根 package 的 "type":"module"，
                        # 保证编译产物 electron/dist/*.js 按 CommonJS 加载
```

## 验证边界（如实声明）

沙箱为 2C/4G Linux 环境，无法执行 Windows 构建与运行，本批次在沙箱内实际完成：

- `tsc -p electron --noEmit` 对全部桌面壳 TS 文件类型检查通过
- `npm test`（67/67）+ `npm run build` 网页构建全绿，桌面壳不破坏现有链路
- package.json / electron-builder 配置 / CI YAML 按技规 §4.1–4.3 模板落地并复核

以下需在 Windows 机器或 CI 首跑确认：

1. `npm run electron:build` 出包 + 安装包可运行、全屏进入主菜单（M1 冒烟清单第 1 条）
2. 若运行时报 ESM/CJS 加载错误：确认打包产物内含 `electron/package.json`
   （`"type":"commonjs"`），该文件是 `"type":"module"` 根包下 CJS 主进程正常加载的关键
3. 60fps 帧率实测（AC-19，质检建议在开发本地机器做）
