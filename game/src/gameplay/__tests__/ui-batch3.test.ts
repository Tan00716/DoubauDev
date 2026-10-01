// @vitest-environment happy-dom
/**
 * MVP 批次三·UI 层测试：
 * 1. 主菜单「继续游戏」（MVP-AC-17）：无档隐藏 / 有档可见并恢复到存档昼夜边界
 * 2. 「存档退出」按钮（MVP-AC-17）：白天可见，点击落盘回主菜单，继续游戏可恢复
 * 3. B 键军械册收起/展开（MVP-AC-05）：仅白天生效
 * 4. 夜末结算收支明细分列（MVP-AC-12）
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GameUI } from '../../ui/ui';
import { gameState } from '../game-state';
import { setSaveStorageForTests, persistSave, clearSave, type SaveStorage } from '../save-load';

const store = new Map<string, string>();
const testStorage: SaveStorage = {
  getItem: k => store.get(k) ?? null,
  setItem: (k, v) => { store.set(k, v); },
  removeItem: k => { store.delete(k); },
};

describe('批次三·UI：继续游戏 / 存档退出 / B 键 / 收支明细', () => {
  let ui: GameUI;

  beforeEach(() => {
    document.body.innerHTML = '<div id="ui-layer"></div>';
    store.clear();
    setSaveStorageForTests(testStorage);
    // startGame 后 runCount=2：避开新手第 1 夜引导（战术牌层锁定等与本批无关的路径）
    gameState.setRunCountProvider({ get: () => 1, set: () => {} });
    gameState.stragglerMode = 'default';
    ui = new GameUI({} as never);
  });

  afterEach(() => {
    ui.destroy();
    clearSave();
  });

  it('无档：主菜单「继续游戏」隐藏，开始新游戏照常', () => {
    const btnContinue = document.getElementById('btn-continue')!;
    expect(btnContinue).not.toBeNull();
    expect((btnContinue as HTMLElement).style.display).toBe('none');

    (document.getElementById('btn-start') as HTMLElement).click();
    expect(gameState.phase).toBe('day');
    expect(document.getElementById('btn-night')!.style.display).toBe('block');
  });

  it('有档：主菜单显示「继续游戏」，点击恢复到存档昼夜边界（HUD 资源同步）', () => {
    ui.destroy();
    // 造档：第 5 天白天、金币 777
    gameState.resetGame();
    gameState.runCount = 2;
    gameState.dayCount = 5;
    gameState.phase = 'day';
    gameState.gold = 777;
    expect(persistSave(gameState, 'day')).toBe(true);

    ui = new GameUI({} as never);
    const btnContinue = document.getElementById('btn-continue')!;
    expect((btnContinue as HTMLElement).style.display).toBe('block');

    (btnContinue as HTMLElement).click();
    // 恢复到白天相位 + 存档昼夜；HUD 已挂载且资源/按钮同步
    expect(gameState.phase).toBe('day');
    expect(gameState.dayCount).toBe(5);
    expect(gameState.gold).toBe(777);
    expect(document.getElementById('res-gold')!.textContent).toBe('777');
    expect(document.getElementById('btn-night')!.style.display).toBe('block');
    expect(document.getElementById('btn-save-quit')!.style.display).toBe('block');
  });

  it('存档退出：白天点击落盘并回主菜单，「继续游戏」可恢复同一状态', () => {
    (document.getElementById('btn-start') as HTMLElement).click();
    expect(gameState.phase).toBe('day');
    gameState.dayCount = 3;
    gameState.gold = 555;

    (document.getElementById('btn-save-quit') as HTMLElement).click();
    // 已回主菜单，且档已落盘 → 继续游戏可见
    expect(document.querySelector('.eh-menu')).not.toBeNull();
    const btnContinue = document.getElementById('btn-continue')!;
    expect((btnContinue as HTMLElement).style.display).toBe('block');

    (btnContinue as HTMLElement).click();
    expect(gameState.phase).toBe('day');
    expect(gameState.dayCount).toBe(3);
    expect(gameState.gold).toBe(555);
  });

  it('B 键收起/展开军械册（MVP-AC-05）：白天生效，夜间不响应', () => {
    (document.getElementById('btn-start') as HTMLElement).click();
    const panel = document.getElementById('bottom-panel')!;
    expect(gameState.phase).toBe('day');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }));
    expect(panel.style.display).toBe('none');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }));
    expect(panel.style.display).toBe('flex');

    // 夜间：B 键不影响战术手牌面板
    gameState.startNight();
    gameState.update(3); // night_transition(2s) → beginNight
    expect(gameState.phase).toBe('night');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }));
    expect(panel.style.display).not.toBe('none');
  });

  it('夜末结算收支明细分列（MVP-AC-12）：击杀金币 / 战意转金 / 总收入', () => {
    (document.getElementById('btn-start') as HTMLElement).click();
    gameState.startNight();
    gameState.update(3);
    expect(gameState.phase).toBe('night');

    // 击杀一只波次狼（2 金 + 1 意）
    gameState.spawnEnemy('enemy_wolf', { x: 8, z: 8 }, false);
    gameState.removeEnemy(gameState.enemies[0].id);

    gameState.endNight();
    expect(gameState.phase).toBe('night_settlement');
    const settle = document.querySelector('.eh-settlement') as HTMLElement | null;
    expect(settle).not.toBeNull();
    const text = settle!.textContent ?? '';
    expect(text).toContain('击杀金币: 2');
    expect(text).toContain('战意结余转金');
    expect(text).toContain('本夜总收入');
  });
});
