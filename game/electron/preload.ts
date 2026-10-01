/**
 * Electron preload（技规 §4.1 安全基线：contextIsolation: true / nodeIntegration: false）
 *
 * 暴露 window.emberholdDesktop 桌面桥：
 * - 网页构建（Vite 在线版 / 测试）下 window.emberholdDesktop === undefined，
 *   游戏核心代码零改动、零感知；
 * - Electron 下提供 Steam 成就与云存档镜像两个预留接口。
 *
 * 游戏侧建议接线点（MVP 仅预留，未改动 src/）：
 * - 成就：夜 N 通关 / 首次升级 / 通关胜利时调用 steam.unlockAchievement(id)
 * - 云存档：persistSave 成功后调用 cloud.exportSave(localStorage.getItem('emberhold_save'))，
 *   启动时若 localStorage 为空可先 cloud.importSave() 回填
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('emberholdDesktop', {
  platform: 'electron' as const,
  steam: {
    info: (): Promise<{ initialized: boolean; steamId64: string | null }> =>
      ipcRenderer.invoke('emberhold:steam-info') as Promise<{
        initialized: boolean;
        steamId64: string | null;
      }>,
    unlockAchievement: (achievementId: string): Promise<boolean> =>
      ipcRenderer.invoke('emberhold:unlock-achievement', achievementId) as Promise<boolean>,
  },
  cloud: {
    /** 把渲染层存档 JSON 镜像到 userData/saves/run.json（Steam Cloud 同步预留点） */
    exportSave: (payload: string): Promise<{ ok: boolean; path?: string; error?: string }> =>
      ipcRenderer.invoke('emberhold:save-export', payload) as Promise<{
        ok: boolean;
        path?: string;
        error?: string;
      }>,
    /** 读回镜像存档；无镜像时返回 ok:false + payload:null */
    importSave: (): Promise<{ ok: boolean; payload: string | null }> =>
      ipcRenderer.invoke('emberhold:save-import') as Promise<{
        ok: boolean;
        payload: string | null;
      }>,
  },
});
