import { eventBus } from '../core/event-bus';
import type { GameState, GamePhase, RunSavePayload } from './game-state';
import { SAVE_VERSION } from './game-state';

/**
 * MVP 批次三·存档系统（MVP-AC-17；技术规格 3.5「存档粒度 = 昼夜边界」的 Web 简化口径）。
 *
 * 粒度与触发：
 * - day 档：天亮结算完成进入白天时自动存（game-state 经 eventBus phase-change day 触发，dayCount≥2）；
 * - night_pending 档：玩家点击「入夜」的瞬间快照（phase-change night_transition）——夜中不存档，
 *   夜中退出/崩溃后「继续游戏」回退到本夜开始前的昼夜边界（M1-T08 验收口径）；
 * - 局终（胜利/失守）自动清档，不给下一局留幽灵档。
 *
 * 版本策略（技术规格 3.5）：版本号不符 → 拒绝加载返回 null（自动迁移脚本留待 MVP 后，当前唯一版本）。
 *
 * 跨局 Meta 零数值原则（负责人批次三要求 2）：本档只存「本局进行中状态」，不存任何跨局数值加成；
 * 局数记忆（run_count，只影响新手引导出现与否——属「只解锁体验选项」类）走 game-state 侧独立存储，不入本档。
 *
 * 依赖方向：save-load → game-state 单向（重建逻辑在 GameState.loadFromSave 实例方法内，
 * 可复用私有 generateSquadFormation；game-state 不 import 本模块，无环）。
 */

export const SAVE_STORAGE_KEY = 'emberhold_save';

/** 存储适配器：默认 localStorage；无 DOM 环境（测试/SSR）回退内存。测试可注入隔离实现。 */
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const memoryStorage = new Map<string, string>();

const defaultSaveStorage: SaveStorage = {
  getItem(key) {
    try {
      if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
    } catch { /* 隐私模式等 localStorage 不可用 → 内存回退 */ }
    return memoryStorage.get(key) ?? null;
  },
  setItem(key, value) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
        return;
      }
    } catch { /* 同上 */ }
    memoryStorage.set(key, value);
  },
  removeItem(key) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
        return;
      }
    } catch { /* 同上 */ }
    memoryStorage.delete(key);
  },
};

let saveStorage: SaveStorage = defaultSaveStorage;

/** 测试注入：隔离存储（避免污染真实 localStorage / 内存回退）。 */
export function setSaveStorageForTests(adapter: SaveStorage): void {
  saveStorage = adapter;
}

/** 技规 3.5：只有昼夜边界相位可存档——夜中（night/night_transition）绝不落盘。 */
export function canSaveInCurrentPhase(phase: GamePhase): boolean {
  return phase === 'day' || phase === 'night_settlement';
}

/** 序列化当前局为昼夜边界快照。只在 day / night_settlement 相位调用（夜中状态不可完整重建）。 */
export function serializeRun(gs: GameState, marker: RunSavePayload['marker']): RunSavePayload {
  return {
    version: SAVE_VERSION,
    marker,
    save_time: new Date().toISOString(),
    dayCount: gs.dayCount,
    runCount: gs.runCount,
    tutorialDismissed: gs.tutorialDismissed,
    gold: gs.gold,
    warSpirit: gs.warSpirit,
    mainKeepHealth: gs.mainKeepHealth,
    squads: gs.squads
      .filter(sq => !sq.isEmergency) // 应急增援夜末消散，不入档
      .map(sq => ({
        unitId: sq.unitId, x: sq.position.x, z: sq.position.z,
        health: sq.health, maxHealth: sq.maxHealth,
        upgradeLevel: sq.upgradeLevel, command: sq.command,
      })),
    buildings: gs.buildings.map(b => ({
      buildingId: b.buildingId, x: b.position.x, z: b.position.z,
      health: b.health, maxHealth: b.maxHealth, upgradeLevel: b.upgradeLevel,
    })),
    armory: gs.armoryDeck.map(c => ({ cardId: c.card_id, upgrade_level: c.upgrade_level })),
    tacticHand: gs.tacticHand.map(c => c.card_id),
    tacticDeck: gs.tacticDeck.map(c => c.card_id),
    tacticDiscard: gs.tacticDiscard.map(c => c.card_id),
    damagedCamp: gs.damagedCamp.map(d => ({ cardId: d.cardId, count: d.count })),
    recalledPending: Array.from(gs.recalledPending.entries()),
  };
}

/** 落盘（含相位守卫）：夜中调用返回 false 且不写。 */
export function persistSave(gs: GameState, marker: RunSavePayload['marker']): boolean {
  if (!canSaveInCurrentPhase(gs.phase)) {
    // night_pending 快照例外：在 startNight 发出的 night_transition 事件里，状态仍是入夜前的白天态
    if (!(marker === 'night_pending' && gs.phase === 'night_transition')) return false;
  }
  try {
    saveStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(serializeRun(gs, marker)));
    return true;
  } catch {
    return false; // 存储配额/隐私模式：静默失败不阻断游戏（MVP 口径：存档尽力而为）
  }
}

/** 读档：解析 + 版本校验。无档 / 损坏 / 版本不符一律返回 null（拒载，不猜测迁移）。 */
export function readSave(): RunSavePayload | null {
  let raw: string | null;
  try {
    raw = saveStorage.getItem(SAVE_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as RunSavePayload;
    if (!payload || typeof payload !== 'object') return null;
    if (payload.version !== SAVE_VERSION) return null; // 技规 3.5：版本不符拒绝加载
    if (typeof payload.dayCount !== 'number' || payload.dayCount < 1) return null;
    return payload;
  } catch {
    return null; // JSON 损坏 → 视为无档
  }
}

export function hasSave(): boolean {
  return readSave() !== null;
}

/** 局终清档（game-over 事件触发）：胜利/失守都不留档，防止「继续游戏」复活已结束的局。 */
export function clearSave(): void {
  try {
    saveStorage.removeItem(SAVE_STORAGE_KEY);
  } catch { /* 尽力而为 */ }
}

/** 继续游戏：读档并重建到昼夜边界（白天相位）。无档/拒载返回 false。 */
export function continueFromSave(gs: GameState): boolean {
  const payload = readSave();
  if (!payload) return false;
  return gs.loadFromSave(payload);
}

/**
 * 自动存档挂接（main.ts 启动时调用一次）：
 * - night_transition（玩家点入夜）→ night_pending 快照；
 * - day（dayCount≥2，即每次天亮结算后）→ day 档；dayCount=1 的新局开局不落盘，
 *   防止「开新局」瞬间覆盖上一局的 valuable 存档；
 * - game-over → 清档。
 * 返回注销函数（测试隔离用）。
 */
export function initSaveAutoHooks(gs: GameState): () => void {
  const offPhase = eventBus.on('phase-change', ({ phase }: { phase: GamePhase }) => {
    if (phase === 'night_transition') {
      persistSave(gs, 'night_pending');
    } else if (phase === 'day' && gs.dayCount >= 2) {
      persistSave(gs, 'day');
    }
  });
  const offGameOver = eventBus.on('game-over', () => clearSave());
  return () => {
    offPhase();
    offGameOver();
  };
}
