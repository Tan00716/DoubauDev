import type { CommanderData } from '../types/index.js';

/**
 * Commander Dataset (1 commander for baseline)
 * Oen - 流浪战诗人 (Card combo / engine flow)
 */

export const COMMANDERS: Record<string, CommanderData> = {
  commander_oen: {
    commander_id: 'commander_oen',
    commander_name: '流浪战诗人·奥恩',
    passive_effects: [
      { type: 'first_tactic_free', params: { value: 1 } },
      { type: 'poetry_line', params: { every_nth: 3, cost_reduction: 1, min_cost: 1 } },
    ],
    starting_gold_bonus: 0,
    starting_military_capacity: 10,
    starting_work_capacity: 8,
    build_identity: ['card_combo', 'engine', 'tactic_heavy'],
  },
  commander_veira: {
    commander_id: 'commander_veira',
    commander_name: '灰烬女爵·薇拉',
    passive_effects: [
      { type: 'building_free_relocate', params: { value: 1 } },
      { type: 'wall_slow_regen', params: { percent_per_second: 0.5 } },
      { type: 'tower_damage_penalty', params: { multiplier: 0.8 } },
    ],
    starting_gold_bonus: 0,
    starting_military_capacity: 6,
    starting_work_capacity: 11, // +3 work capacity
    build_identity: ['fortification', 'turtle', 'building_heavy'],
  },
};

export function getCommander(commanderId: string): CommanderData {
  const c = COMMANDERS[commanderId];
  if (!c) throw new Error(`Unknown commander: ${commanderId}`);
  return c;
}
