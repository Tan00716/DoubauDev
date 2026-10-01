/**
 * EMBERHOLD Simulator - Core Type Definitions
 * Aligned with Web Tech Spec JSON Schema (Section 2)
 */

// ============ Content Data Types ============

export interface UnitData {
  unit_id: string;
  unit_name: string;
  role: 'shield' | 'pike' | 'archer' | 'cavalry' | 'engineer' | 'healer' | 'mage' | 'behemoth';
  squad_size: number;
  military_cost: number;
  max_health: number;
  attack_damage: number;
  attack_range: number;
  attack_speed: number;
  defense_type: 'heavy' | 'medium' | 'light' | 'none';
  move_speed: number;
  armor: number;
  war_spirit_on_contact: number;
  synergy_tags: string[];
}

export interface BuildingData {
  building_id: string;
  building_name: string;
  category: 'defense' | 'offense' | 'support' | 'utility';
  work_cost: number;
  gold_cost: number;
  max_durability: number;
  armor: number;
  attack_damage?: number;
  attack_range?: number;
  attack_speed?: number;
  synergy_tags: string[];
}

export interface EnemyData {
  enemy_id: string;
  enemy_name: string;
  type: 'tank' | 'swarm' | 'assassin' | 'siege' | 'anti_tower' | 'anti_army' | 'ranged' | 'healer' | 'summoner';
  max_health: number;
  damage: number;
  attack_range: number;
  attack_speed: number;
  move_speed: number;
  armor: number;
  target_priority: 'wall' | 'tower' | 'main_keep' | 'squad';
  countered_by: string[];
}

export interface CommanderData {
  commander_id: string;
  commander_name: string;
  passive_effects: CommanderEffect[];
  starting_gold_bonus: number;
  starting_military_capacity: number;
  starting_work_capacity: number;
  exclusive_unit_bonus?: { unit_id: string; multiplier: number };
  build_identity: string[];
}

export interface CommanderEffect {
  type: string;
  params: Record<string, number | string | boolean>;
}

// ============ Runtime Simulation Types ============

export interface SquadInstance {
  instance_id: string;
  unit_id: string;
  health: number;
  max_health: number;
  position: 'front' | 'mid' | 'back';
  is_engaged: boolean;
  is_retreating: boolean;
  retreat_timer: number;
  kills_this_night: number;
  war_spirit_generated: number;
}

export interface BuildingInstance {
  instance_id: string;
  building_id: string;
  durability: number;
  max_durability: number;
  is_destroyed: boolean;
}

export interface EnemyInstance {
  instance_id: string;
  enemy_id: string;
  health: number;
  max_health: number;
  position: number; // 0-100, distance to main keep
}

export interface WaveConfig {
  enemies: { enemy_id: string; count: number }[];
  spawn_delay_seconds: number;
}

export interface GameState {
  day: number;
  phase: 'day' | 'night' | 'settlement';
  gold: number;
  war_spirit: number;
  max_war_spirit: number;
  military_capacity: number;
  work_capacity: number;
  main_keep_health: number;
  max_main_keep_health: number;
  squads: SquadInstance[];
  buildings: BuildingInstance[];
  damaged_camp: { unit_id: string; health: number }[];
  deck_armory: string[];
  deck_tactic: string[];
  hand: string[];
  discard_pile: string[];
  cards_played_this_night: number;
  total_gold_earned: number;
  total_gold_spent: number;
  total_war_spirit_generated: number;
  total_war_spirit_spent: number;
  casualties: number;
  enemy_kills: number;
  is_game_over: boolean;
  victory: boolean;
  defeat_reason: string | null;
  war_spirit_curve: number[];
  gold_curve: number[];
}

// ============ Simulation Config Types ============

export interface PresetConfig {
  name: string;
  description: string;
  commander_id: string;
  initial_gold: number;
  initial_squads: { unit_id: string }[];
  initial_buildings: { building_id: string }[];
  waves: WaveConfig[][];
  max_days: number;
  difficulty: number;
}

export interface SimulationConfig {
  runs: number;
  preset: string;
  seed?: number;
  max_parallel?: number;
}

// ============ Report Types ============

export interface SingleRunReport {
  run_id: number;
  preset_name: string;
  victory: boolean;
  days_survived: number;
  defeat_reason: string | null;
  final_gold: number;
  final_main_keep_health: number;
  total_casualties: number;
  total_enemy_kills: number;
  war_spirit_curve: number[];
  gold_curve: number[];
  avg_ttc_per_day: number[]; // Time To Clear (seconds)
  avg_ttk_per_day: number[]; // Time To Kill (seconds)
  build_diversity_score: number;
}

export interface BatchReport {
  batch_id: string;
  preset_name: string;
  total_runs: number;
  victory_rate: number;
  avg_days_survived: number;
  median_days_survived: number;
  victory_rate_by_day: Record<number, number>;
  defeat_reason_distribution: Record<string, number>;
  avg_gold_curve: number[];
  avg_war_spirit_curve: number[];
  avg_casualties_per_day: number[];
  avg_ttc_per_day: number[];
  avg_ttk_per_day: number[];
  balance_flags: BalanceFlag[];
  runs: SingleRunReport[];
}

export interface BalanceFlag {
  type: 'warning' | 'error' | 'info';
  message: string;
  metric: string;
  value: number;
  threshold: number;
}

export interface ComparisonReport {
  presets: string[];
  batch_reports: BatchReport[];
  cross_flags: BalanceFlag[];
}
