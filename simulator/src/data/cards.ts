import type { CardData } from '../types/index.js';

/**
 * 卡牌数据 —— 与 game/src/content/data.ts ARMORY_CARDS / TACTIC_CARDS 一致（commit 37f798f0）。
 *
 * 实现口径备注（对齐 N2 质检结论）：
 * - 齐射令：卡面文案「攻速+50%」，但 game 实现（combat.ts）为
 *   「弓手班伤害 ×1.5 + 射程 ×1.3」，attackSpeedBonus 参数从未被消费。
 *   模拟器按【实现口径】建模：伤害 ×1.5、射程 ×1.3，持续 6s。
 * - 紧急增援（card_tactic_reinforce）：存在于 TACTIC_CARDS 数据中，但 game-state
 *   初始战术牌库仅 4 张（火油/盾墙/齐射/集结），无任何通道将其加入牌库 —— M1 内不可获得。
 *   模拟器同样不纳入策略（与 game 实际可达性一致）。
 * - 火油桶：15 伤害/秒、半径 3、持续 5s（DPS 模型）。
 * - 盾墙令：全军（班组）承伤 -30%、持续 8s（B1 重构时激活，仅作用于敌方对班组的伤害）。
 * - 集结号：仅影响班移速，M1 循环内无战斗效果（作为占位牌占用手牌，符合 game 行为）。
 */

export const ARMORY_CARDS: Record<string, CardData> = {
  card_unit_shieldbearer: { card_id: 'card_unit_shieldbearer', card_name: '盾卫班', layer: 'armory', category: 'unit', cost_day: 40, cost_night: 60, duration: 0 },
  card_unit_archer: { card_id: 'card_unit_archer', card_name: '弓手班', layer: 'armory', category: 'unit', cost_day: 35, cost_night: 53, duration: 0 },
  card_unit_pikeman: { card_id: 'card_unit_pikeman', card_name: '枪卒班', layer: 'armory', category: 'unit', cost_day: 30, cost_night: 45, duration: 0 },
  card_building_wall: { card_id: 'card_building_wall', card_name: '城墙', layer: 'armory', category: 'building', cost_day: 25, cost_night: 38, duration: 0 },
  card_building_arrow_tower: { card_id: 'card_building_arrow_tower', card_name: '箭塔', layer: 'armory', category: 'building', cost_day: 60, cost_night: 90, duration: 0 },
  card_building_barracks: { card_id: 'card_building_barracks', card_name: '兵营', layer: 'armory', category: 'building', cost_day: 80, cost_night: 120, duration: 0 },
};

export const TACTIC_CARDS: Record<string, CardData> = {
  card_tactic_fire_oil: { card_id: 'card_tactic_fire_oil', card_name: '火油桶', layer: 'tactic', category: 'tactic', cost_day: 0, cost_night: 10, duration: 5 },
  card_tactic_shield_wall: { card_id: 'card_tactic_shield_wall', card_name: '盾墙令', layer: 'tactic', category: 'formation', cost_day: 0, cost_night: 12, duration: 8 },
  card_tactic_volley: { card_id: 'card_tactic_volley', card_name: '齐射令', layer: 'tactic', category: 'tactic', cost_day: 0, cost_night: 8, duration: 6 },
  card_tactic_reinforce: { card_id: 'card_tactic_reinforce', card_name: '紧急增援', layer: 'tactic', category: 'tactic', cost_day: 0, cost_night: 15, duration: 0 },
  card_tactic_rally: { card_id: 'card_tactic_rally', card_name: '集结号', layer: 'tactic', category: 'tactic', cost_day: 0, cost_night: 6, duration: 5 },
};

/** game 初始战术牌库（game-state.ts resetGame）：仅 4 张，无紧急增援。 */
export const INITIAL_TACTIC_DECK = [
  'card_tactic_fire_oil',
  'card_tactic_shield_wall',
  'card_tactic_volley',
  'card_tactic_rally',
];

export function getCard(cardId: string): CardData {
  const c = ARMORY_CARDS[cardId] ?? TACTIC_CARDS[cardId];
  if (!c) throw new Error(`Unknown card: ${cardId}`);
  return c;
}
