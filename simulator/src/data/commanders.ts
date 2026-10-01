/**
 * 指挥官 —— M1 仅一名（game/src/content/data.ts COMMANDER）。
 * 旧版模拟器的薇拉（Veira）在 game M1 数据中不存在，已移除以保证口径一致。
 */

export interface CommanderData {
  commander_id: string;
  commander_name: string;
  passive_rule: string;
  /** 每夜第一张战术牌免费（playTacticCard 中 firstTacticFree） */
  first_tactic_free_per_night: boolean;
}

export const COMMANDERS: Record<string, CommanderData> = {
  commander_oen: {
    commander_id: 'commander_oen',
    commander_name: '流浪战诗人·奥恩',
    passive_rule: '每夜第一张战术牌免费',
    first_tactic_free_per_night: true,
  },
};

export function getCommander(commanderId: string): CommanderData {
  const c = COMMANDERS[commanderId];
  if (!c) throw new Error(`Unknown commander: ${commanderId}`);
  return c;
}
