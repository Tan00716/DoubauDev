/**
 * Electron 主进程（MVP 桌面壳，技规 03-web-tech-spec §4.1）
 *
 * 职责：
 * - 创建全屏 BrowserWindow 加载本地打包产物（离线运行，无 CDN 依赖）
 * - contextIsolation: true / nodeIntegration: false（安全基线）
 * - 挂载 Steamworks 集成点（成就 / 云存档，见 steam-integration.ts）
 * - 云存档桥 IPC：把渲染进程 localStorage 存档镜像到 userData 目录
 *   （该目录是 Steam Cloud 自动同步的预留落点，见 electron/README.md）
 *
 * 编译产物位于 electron/dist/main.js（tsconfig.outDir），
 * 因此游戏产物相对路径为 ../../dist/index.html（技规模板按 electron/ 平铺
 * 输出写的 ../dist，本工程采用 dist 子目录输出，路径已相应修正）。
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import { SteamIntegration } from './steam-integration';

const steam = new SteamIntegration();
const steamReady = steam.init();

/** 云存档镜像文件：userData/saves/run.json（Steam Cloud 同步预留点） */
function saveMirrorPath(): string {
  return path.join(app.getPath('userData'), 'saves', 'run.json');
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 生产环境加载本地打包文件，开发环境加载 Vite 服务器
  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'));
  }
}

app.whenReady().then(createWindow);

// 全窗口关闭退出（macOS 惯例除外——MVP 仅发 Windows，保留惯例写法）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

/* ---------- IPC：渲染进程桥（channel 前缀 emberhold:） ---------- */

ipcMain.handle('emberhold:steam-info', () => ({
  initialized: steamReady,
  steamId64: steam.getSteamId64(),
}));

ipcMain.handle('emberhold:unlock-achievement', (_event, achievementId: string) =>
  steam.unlockAchievement(achievementId),
);

ipcMain.handle('emberhold:save-export', (_event, payload: string) => {
  try {
    const target = saveMirrorPath();
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, payload, 'utf-8');
    return { ok: true, path: target };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('emberhold:save-import', () => {
  try {
    return { ok: true, payload: fs.readFileSync(saveMirrorPath(), 'utf-8') };
  } catch {
    return { ok: false, payload: null }; // 无镜像存档（首启 / 清档）→ 渲染层继续用 localStorage
  }
});
