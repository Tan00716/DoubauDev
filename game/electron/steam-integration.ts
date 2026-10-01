/**
 * Steamworks 集成点（MVP 接口预留，技规 03-web-tech-spec §4.2）
 *
 * 设计约束：
 * - steamworks.js 是原生模块（按 Electron ABI 出预编译 .node），MVP 阶段未安装为依赖；
 *   因此这里用运行时 require 而非静态 import——未安装 / 非 Steam 环境启动时全部
 *   方法安全空操作（优雅降级），网页构建与测试完全不受影响。
 * - 启用步骤（electron/README.md 有完整说明）：npm i steamworks.js →
 *   electron-builder 配置 asarUnpack 原生模块 → 把 init(480) 换成实际 Steam App ID。
 *
 * 集成面（对齐技规 §4.2 表）：
 * - 成就：unlockAchievement → Steam 成就系统（本地存储 + Steam 同步）
 * - 云存档：存档镜像落 userData/saves/（main.ts IPC），Steam Cloud 对该目录自动同步
 * - 排行榜 / 统计：Steam Leaderboards / User Stats API，v1.0 前接（当前未暴露接口）
 */

/** steamworks.js 客户端的最小类型面（仅本项目用到的部分） */
interface SteamworksClientLike {
  achievement: { activate(id: string): boolean };
  localplayer: { getSteamId(): string };
}

export class SteamIntegration {
  private client: SteamworksClientLike | null = null;

  init(): boolean {
    try {
      // 运行时 require：模块未安装时抛错进入 catch 降级，不破坏构建
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('steamworks.js') as { init(appId: number): SteamworksClientLike };
      this.client = mod.init(480); // 480 = Spacewar 测试 App ID（替换为实际 Steam App ID）
      return true;
    } catch {
      return false; // 非 Steam 启动（开发环境 / 未安装 SDK）：优雅降级
    }
  }

  /** 解锁 Steam 成就；未初始化时安全空操作 */
  unlockAchievement(achievementId: string): boolean {
    if (!this.client) return false;
    try {
      return this.client.achievement.activate(achievementId);
    } catch {
      return false;
    }
  }

  /** 取 SteamID64（用于排查云存档归属）；未初始化返回 null */
  getSteamId64(): string | null {
    if (!this.client) return null;
    try {
      return this.client.localplayer.getSteamId();
    } catch {
      return null;
    }
  }

  /**
   * 云存档上传（预留）：Steam Cloud 对 userData 目录下的文件自动同步，
   * 具体落盘由 main.ts 的 save-export IPC 完成，此处仅保留集成点签名。
   */
  uploadCloudSave(_localPath: string): void {
    if (!this.client) return;
    // Steam Cloud 自动同步用户数据目录下的文件（技规 §4.2）
  }
}
