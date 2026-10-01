// @vitest-environment happy-dom
/**
 * MVP 批次二·P0 回归冒烟（质检批次一复核结论）：
 * 修复前：btn-start 处理器先 startGame() 后 showHUD()，startGame 内 emit('phase-change', day)
 * 时 #btn-night 尚未挂载，onPhaseChange 的 `btnNight!.style.display='block'` 抛 TypeError
 * 被事件总线吞掉，按钮保持 display:none 且白天无自动入夜兜底 → 第一局卡死白天。
 * 修复后：showHUD() 先于 startGame() 挂载，phase-change 到达时按钮已可寻址。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GameUI } from '../../ui/ui';
import { gameState } from '../game-state';

describe('P0：开始新游戏后 btn-night 可见（第一局不卡死白天）', () => {
  let ui: GameUI;
  beforeEach(() => {
    document.body.innerHTML = '<div id="ui-layer"></div>';
    gameState.setRunCountProvider({ get: () => 0, set: () => {} });
    ui = new GameUI({} as never);
  });
  afterEach(() => {
    ui.destroy(); // 防监听泄漏跨用例干扰（批次二给 GameUI 补的 destroy 能力）
  });

  it('点击开始新游戏 → HUD 已挂载且 #btn-night display 非 none', () => {
    expect(gameState.phase).toBe('menu');

    const btnStart = document.getElementById('btn-start')!;
    expect(btnStart).not.toBeNull();
    (btnStart as HTMLElement).click();

    // 相位进入白天，HUD 挂载
    expect(gameState.phase).toBe('day');
    expect(document.getElementById('ui-layer')!.querySelector('.eh-hud')).not.toBeNull();

    // 核心断言：入夜按钮可见（display !== 'none'）
    const btnNight = document.getElementById('btn-night')!;
    expect(btnNight).not.toBeNull();
    expect((btnNight as HTMLElement).style.display).not.toBe('none');
    expect((btnNight as HTMLElement).style.display).toBe('block');
  });

  it('再来一局（游戏结束重开）路径同样不卡死：btn-night 可见', () => {
    (document.getElementById('btn-start') as HTMLElement).click();
    gameState.gameOver(false); // 触发 game-over → showGameOver

    const btnRestart = document.getElementById('btn-restart');
    expect(btnRestart).not.toBeNull();
    (btnRestart as HTMLElement).click();

    expect(gameState.phase).toBe('day');
    const btnNight = document.getElementById('btn-night')!;
    expect(btnNight).not.toBeNull();
    expect((btnNight as HTMLElement).style.display).toBe('block');
  });

  it('防御回归：HUD 未挂载时 emit phase-change 不再抛错（可选链兜底）', () => {
    // 构造 HUD 未挂载场景：菜单界面直接 emit night 相位（异常路径），不应有未捕获异常
    expect(() => {
      // 模拟竞态：菜单期收到 phase-change（HUD 不存在）
      (ui as unknown as { onPhaseChange: (p: string) => void }).onPhaseChange('night');
      (ui as unknown as { onPhaseChange: (p: string) => void }).onPhaseChange('day');
    }).not.toThrow();
  });
});
