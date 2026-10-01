/**
 * electron 模块的最小类型声明（沙箱验证专用）
 *
 * 用途：沙箱（2C/4G Linux）不安装 electron 本体（约 100MB+ 且无法运行），
 * 用本声明对 electron/ 下三个 TS 文件做 tsc --noEmit 静态验证。
 * 本声明只覆盖本项目用到的 API 面，与 Electron 28 官方类型兼容。
 *
 * 注意：本地安装 electron 后（devDependencies 已声明，npm ci 会安装），
 * 其自带完整类型；若与本文件冲突，删除 electron/types/ 目录即可。
 */
declare module 'electron' {
  export interface BrowserWindowConstructorOptions {
    width?: number;
    height?: number;
    fullscreen?: boolean;
    webPreferences?: {
      preload?: string;
      contextIsolation?: boolean;
      nodeIntegration?: boolean;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }

  export class BrowserWindow {
    constructor(options?: BrowserWindowConstructorOptions);
    static getAllWindows(): BrowserWindow[];
    loadURL(url: string): Promise<void>;
    loadFile(filePath: string): Promise<void>;
    webContents: unknown;
  }

  export const app: {
    whenReady(): Promise<void>;
    getPath(name: string): string;
    quit(): void;
    on(event: string, listener: (...args: never[]) => void): void;
  };

  export const ipcMain: {
    handle(channel: string, listener: (event: unknown, ...args: never[]) => unknown): void;
  };

  export const contextBridge: {
    exposeInMainWorld(apiKey: string, api: unknown): void;
  };

  export const ipcRenderer: {
    invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  };
}
