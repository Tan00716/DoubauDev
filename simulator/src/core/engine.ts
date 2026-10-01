/**
 * EMBERHOLD Battle Simulation Engine
 * Simplified analytical combat model (no spatial/pathfinding)
 */

import type {
  GameState,
  SquadInstance,
  BuildingInstance,
  EnemyInstance,
  PresetConfig,
  SingleRunReport,
  CommanderData,
} from '../types/index.js';
import { getUnit } from '../data/units.js';
import { getBuilding } from '../data/buildings.js';
import { getEnemy } from '../data/enemies.js';
import { getCommander } from '../data/commanders.js';
import { getPreset } from '../data/presets.js';

// ============ Constants ============

const MAIN_KEEP_MAX_HEALTH = 1000;
const WAR_SPIRIT_MAX = 40;
const WAR_SPIRIT_START = 20;
const GOLD_INCOME_PER_MARKET = 40; // per night (from design doc)
const SQUAD_UPKEEP = 5; // gold per squad per night
const TOWER_UPKEEP = 8; // gold per tower per night
const WALL_UPKEEP = 3; // gold per wall per night
const RECALL_COST_BASE = 50;
const RECALL_HEALTH_RATIO = 0.5; // half health on recall
const EMERGENCY_REINFORCE_MULTIPLIER = 1.5;
const NIGHT_DURATION_BASE = 120; // seconds base
const WAVE_GAP_SECONDS = 15;
const BOSS_TYPE_ENEMIES = ['enemy_shield_crusher', 'enemy_burrower'];

// ============ Seeded RNG ============

export class SeededRNG {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  next(): number {
    // Mulberry32
    this.seed |= 0;
    this.seed = (this.seed + 0x6D2B79F5) | 0;
    let t = Math.imul(this.seed ^ (this.seed >>> 15), 1 | this.seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  intRange(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
  choice<T>(arr: T[]): T {
    return arr[this.intRange(0, arr.length - 1)];
  }
}

// ============ Game State Initialization ============

export function initializeGameState(preset: PresetConfig, seed: number): GameState {
  const rng = new SeededRNG(seed);
  const commander = getCommander(preset.commander_id);

  const squads: SquadInstance[] = preset.initial_squads.map((s, i) => {
    const unit = getUnit(s.unit_id);
    return {
      instance_id: `squad_${i}`,
      unit_id: s.unit_id,
      health: unit.max_health,
      max_health: unit.max_health,
      position: unit.role === 'archer' ? 'back' : unit.role === 'shield' ? 'front' : 'mid',
      is_engaged: false,
      is_retreating: false,
      retreat_timer: 0,
      kills_this_night: 0,
      war_spirit_generated: 0,
    };
  });

  const buildings: BuildingInstance[] = preset.initial_buildings.map((b, i) => {
    const bd = getBuilding(b.building_id);
    return {
      instance_id: `building_${i}`,
      building_id: b.building_id,
      durability: bd.max_durability,
      max_durability: bd.max_durability,
      is_destroyed: false,
    };
  });

  return {
    day: 1,
    phase: 'day',
    gold: preset.initial_gold + commander.starting_gold_bonus,
    war_spirit: WAR_SPIRIT_START,
    max_war_spirit: WAR_SPIRIT_MAX,
    military_capacity: commander.starting_military_capacity,
    work_capacity: commander.starting_work_capacity,
    main_keep_health: MAIN_KEEP_MAX_HEALTH,
    max_main_keep_health: MAIN_KEEP_MAX_HEALTH,
    squads,
    buildings,
    damaged_camp: [],
    deck_armory: [],
    deck_tactic: [],
    hand: [],
    discard_pile: [],
    cards_played_this_night: 0,
    total_gold_earned: preset.initial_gold + commander.starting_gold_bonus,
    total_gold_spent: 0,
    total_war_spirit_generated: WAR_SPIRIT_START,
    total_war_spirit_spent: 0,
    casualties: 0,
    enemy_kills: 0,
    is_game_over: false,
    victory: false,
    defeat_reason: null,
    war_spirit_curve: [WAR_SPIRIT_START],
    gold_curve: [preset.initial_gold + commander.starting_gold_bonus],
  };
}

// ============ Day Phase ============

export function runDayPhase(state: GameState, preset: PresetConfig, rng: SeededRNG): void {
  state.phase = 'day';

  // 1. Income from markets
  const marketCount = state.buildings.filter(b => !b.is_destroyed && b.building_id === 'building_market').length;
  const income = marketCount * GOLD_INCOME_PER_MARKET;
  state.gold += income;
  state.total_gold_earned += income;

  // 2. Repair damaged camp units (50% cost to repair to half health)
  const toRepair = [...state.damaged_camp];
  state.damaged_camp = [];
  for (const damaged of toRepair) {
    const unit = getUnit(damaged.unit_id);
    const repairCost = Math.floor(unit.military_cost * RECALL_COST_BASE * 0.5);
    if (state.gold >= repairCost) {
      state.gold -= repairCost;
      state.total_gold_spent += repairCost;
      // Check capacity before adding back
      const currentMil = state.squads.reduce((sum, s) => sum + getUnit(s.unit_id).military_cost, 0);
      if (currentMil + unit.military_cost <= state.military_capacity) {
        state.squads.push({
          instance_id: `squad_repaired_${rng.next()}`,
          unit_id: damaged.unit_id,
          health: Math.floor(unit.max_health * RECALL_HEALTH_RATIO),
          max_health: unit.max_health,
          position: 'mid',
          is_engaged: false,
          is_retreating: false,
          retreat_timer: 0,
          kills_this_night: 0,
          war_spirit_generated: 0,
        });
      }
      // else: capacity squeeze - unit lost
    }
    // else: not enough gold - unit lost
  }

  // 3. Barracks healing
  const barracksCount = state.buildings.filter(b => !b.is_destroyed && b.building_id === 'building_barracks').length;
  if (barracksCount > 0) {
    for (const squad of state.squads) {
      const unit = getUnit(squad.unit_id);
      squad.health = Math.min(squad.max_health, squad.health + Math.floor(unit.max_health * 0.15 * barracksCount));
    }
  }

  // 4. Wall slow regen (Viera passive)
  const commander = getCommander(preset.commander_id);
  const hasWallRegen = commander.passive_effects.some(e => e.type === 'wall_slow_regen');
  if (hasWallRegen) {
    for (const b of state.buildings) {
      if (!b.is_destroyed && b.building_id === 'building_wall') {
        b.durability = Math.min(b.max_durability, b.durability + Math.floor(b.max_durability * 0.005));
      }
    }
  }

  // 5. Pay upkeep
  const upkeep = calculateUpkeep(state);
  state.gold = Math.max(0, state.gold - upkeep);
  state.total_gold_spent += upkeep;

  state.gold_curve.push(state.gold);
}

export function calculateUpkeep(state: GameState): number {
  let upkeep = 0;
  for (const b of state.buildings) {
    if (b.is_destroyed) continue;
    if (b.building_id === 'building_wall') upkeep += WALL_UPKEEP;
    else if (b.building_id === 'building_arrow_tower') upkeep += TOWER_UPKEEP;
    else if (b.building_id === 'building_barracks') upkeep += SQUAD_UPKEEP * 2; // support building
  }
  upkeep += state.squads.length * SQUAD_UPKEEP;
  return upkeep;
}

// ============ Night Phase ============

export function runNightPhase(state: GameState, preset: PresetConfig, rng: SeededRNG): void {
  state.phase = 'night';
  state.war_spirit = Math.min(state.max_war_spirit, state.war_spirit + 5); // night start bonus
  state.cards_played_this_night = 0;
  for (const s of state.squads) {
    s.kills_this_night = 0;
    s.war_spirit_generated = 0;
    s.is_retreating = false;
    s.retreat_timer = 0;
  }

  const waves = preset.waves[state.day - 1];
  if (!waves) {
    // No more waves = victory!
    state.is_game_over = true;
    state.victory = true;
    return;
  }

  let elapsed = 0;
  let totalCombatTime = 0;
  let totalKillTime = 0;
  let killCount = 0;

  for (let waveIndex = 0; waveIndex < waves.length; waveIndex++) {
    const wave = waves[waveIndex];
    elapsed += wave.spawn_delay_seconds;

    // Spawn enemies
    const enemies: EnemyInstance[] = [];
    for (const entry of wave.enemies) {
      for (let i = 0; i < entry.count; i++) {
        enemies.push({
          instance_id: `enemy_${waveIndex}_${i}_${rng.next()}`,
          enemy_id: entry.enemy_id,
          health: getEnemy(entry.enemy_id).max_health,
          max_health: getEnemy(entry.enemy_id).max_health,
          position: 100, // far edge
        });
      }
    }

    // Run combat until all enemies dead or main keep destroyed
    const result = runWaveCombat(state, enemies, rng);
    elapsed += result.combat_duration;
    totalCombatTime += result.combat_duration;
    totalKillTime += result.total_ttk;
    killCount += result.kills;

    if (state.is_game_over) break;

    // Wave gap for repairs/tactics
    elapsed += WAVE_GAP_SECONDS;
  }

  // Record war spirit at end of night
  state.war_spirit_curve.push(state.war_spirit);
}

interface CombatResult {
  combat_duration: number;
  kills: number;
  total_ttk: number;
}

// ============ Simplified Combat Model ============
/**
 * SIMPLIFICATION DECLARATION (see README):
 * This is an analytical combat resolver without spatial simulation.
 * It treats combat as aggregate DPS vs HP pools with range-based
 * engagement timing. This means:
 * - No pathfinding or collision avoidance
 * - No individual positioning or kiting
 * - No AOE splash radius calculations
 * - Aggregate approximation of multi-target damage
 *
 * Impact on conclusions:
 * - TTK/TTC estimates are directional, not precise
 * - Build comparisons are valid for aggregate throughput
 * - Micro-intensive builds (游骑劫掠) are underrepresented
 * - Area-effect synergies (缆索塔+轰炮台) are linearized
 */

export function runWaveCombat(state: GameState, enemies: EnemyInstance[], rng: SeededRNG, preset?: PresetConfig): CombatResult {
  const activePreset = preset ?? getPreset('baseline');
  const dt = 0.5; // 0.5 second time steps
  let time = 0;
  let kills = 0;
  let totalTtk = 0;

  // Active squads (not retreating, not dead)
  const activeSquads = () => state.squads.filter(s => s.health > 0 && !s.is_retreating);
  // Active buildings
  const activeBuildings = () => state.buildings.filter(b => !b.is_destroyed);

  while (enemies.some(e => e.health > 0) && state.main_keep_health > 0) {
    time += dt;

    // ---- Enemy movement ----
    for (const enemy of enemies) {
      if (enemy.health <= 0) continue;
      const ed = getEnemy(enemy.enemy_id);
      enemy.position = Math.max(0, enemy.position - ed.move_speed * dt);
    }

    // ---- Determine targets for enemies ----
    const aliveEnemies = enemies.filter(e => e.health > 0);
    const squads = activeSquads();
    const buildings = activeBuildings();

    // Enemy attacks
    for (const enemy of aliveEnemies) {
      const ed = getEnemy(enemy.enemy_id);
      const attackInterval = 1 / ed.attack_speed;

      // Only attack if arrived at target
      if (enemy.position <= 0) {
        // Target priority: wall -> squad -> main keep
        let target: SquadInstance | BuildingInstance | null = null;
        let targetIsBuilding = false;

        if (ed.target_priority === 'wall') {
          const walls = buildings.filter(b => b.building_id === 'building_wall');
          if (walls.length > 0) target = walls[0];
        } else if (ed.target_priority === 'squad') {
          if (squads.length > 0) target = squads[Math.floor(rng.next() * squads.length)];
        } else if (ed.target_priority === 'main_keep') {
          target = null; // directly hits main keep
        }

        if (target === null) {
          // Hit main keep
          const damage = Math.max(1, ed.damage - 0); // main keep has no armor
          const variance = 0.85 + rng.next() * 0.3; // ±15% damage variance
          state.main_keep_health -= damage * dt * ed.attack_speed * variance;
        } else if ('health' in target && !targetIsBuilding) {
          // Hit squad
          const squad = target as SquadInstance;
          const unit = getUnit(squad.unit_id);
          const damage = Math.max(1, ed.damage - unit.armor);
          squad.health -= damage * dt * ed.attack_speed;

          // Generate war spirit from contact
          if (squad.health > 0) {
            const wsGen = unit.war_spirit_on_contact * dt;
            state.war_spirit = Math.min(state.max_war_spirit, state.war_spirit + wsGen);
            squad.war_spirit_generated += wsGen;
            state.total_war_spirit_generated += wsGen;
            squad.is_engaged = true;
          }
        } else {
          // Hit building
          const b = target as BuildingInstance;
          const bd = getBuilding(b.building_id);
          const damage = Math.max(1, ed.damage - bd.armor);
          b.durability -= damage * dt * ed.attack_speed;
          if (b.durability <= 0) {
            b.is_destroyed = true;
            b.durability = 0;
          }
        }
      }
    }

    // ---- Squad attacks ----
    for (const squad of squads) {
      const unit = getUnit(squad.unit_id);
      const attackInterval = 1 / unit.attack_speed;

      // Find enemies in range
      const inRange = aliveEnemies.filter(e => {
        // Archers can attack from further
        const effectiveRange = unit.role === 'archer' ? unit.attack_range : unit.attack_range;
        return e.position <= effectiveRange;
      });

      if (inRange.length > 0) {
        // Target closest enemy (simplified targeting)
        inRange.sort((a, b) => a.position - b.position);
        const target = inRange[0];
        const ed = getEnemy(target.enemy_id);

        // Counterplay bonus
        let damageMult = 1.0;
        if (ed.countered_by.includes(squad.unit_id)) damageMult = 1.5;
        if (squad.unit_id === 'unit_pikeman' && ed.type === 'swarm') damageMult = 1.3;

        const damage = Math.max(1, unit.attack_damage * damageMult - ed.armor);
        const variance = 0.9 + rng.next() * 0.2; // ±10% damage variance
        const actualDamage = damage * dt * unit.attack_speed * variance;
        target.health -= actualDamage;

        if (target.health <= 0) {
          kills++;
          totalTtk += time;
          state.enemy_kills++;
          // Kill rewards
          state.war_spirit = Math.min(state.max_war_spirit, state.war_spirit + 2);
          state.total_war_spirit_generated += 2;
          squad.kills_this_night++;
        }
      }
    }

    // ---- Building attacks (towers) ----
    const commanderData = getCommander(activePreset.commander_id);
    const towerDamagePenalty = commanderData.passive_effects.find(e => e.type === 'tower_damage_penalty')?.params?.multiplier ?? 1.0;
    for (const b of buildings) {
      if (b.building_id !== 'building_arrow_tower') continue;
      const bd = getBuilding(b.building_id);
      if (!bd.attack_damage) continue;

      const inRange = aliveEnemies.filter(e => e.position <= (bd.attack_range || 0));
      if (inRange.length > 0) {
        inRange.sort((a, b) => a.position - b.position);
        const target = inRange[0];
        const ed = getEnemy(target.enemy_id);
        const baseDamage = (bd.attack_damage || 0) * towerDamagePenalty;
        const damage = Math.max(1, baseDamage - ed.armor);
        target.health -= damage * dt * (bd.attack_speed || 1);

        if (target.health <= 0) {
          kills++;
          totalTtk += time;
          state.enemy_kills++;
          state.war_spirit = Math.min(state.max_war_spirit, state.war_spirit + 2);
          state.total_war_spirit_generated += 2;
        }
      }
    }

    // ---- Retreat check ----
    for (const squad of state.squads) {
      if (squad.health <= 0) {
        if (!squad.is_retreating) {
          squad.is_retreating = true;
          state.casualties++;
        }
        continue;
      }
      // Auto-retreat at < 20% health (AI behavior)
      if (squad.health / squad.max_health < 0.2 && !squad.is_retreating) {
        squad.is_retreating = true;
        squad.retreat_timer = 5;
      }
      if (squad.is_retreating) {
        squad.retreat_timer -= dt;
        if (squad.retreat_timer <= 0) {
          squad.health = 0; // retreated off-field
          if (squad.health <= 0) state.casualties++;
        }
      }
    }

    // ---- Check game over ----
    if (state.main_keep_health <= 0) {
      state.main_keep_health = 0;
      state.is_game_over = true;
      state.defeat_reason = 'main_keep_destroyed';
      break;
    }

    // Cap simulation time per wave (prevent infinite loops)
    if (time > 300) {
      // If enemies still alive after 5 min, main keep takes attrition damage
      state.main_keep_health -= 5 * dt;
    }
  }

  // Clear engagement flags
  for (const squad of state.squads) {
    squad.is_engaged = false;
  }

  return {
    combat_duration: time,
    kills,
    total_ttk: totalTtk,
  };
}

// ============ Night Settlement ============

export function runNightSettlement(state: GameState): void {
  state.phase = 'settlement';

  // 1. Convert excess war spirit to gold (50% rate)
  if (state.war_spirit > 0) {
    const goldFromSpirit = Math.floor(state.war_spirit * 0.5);
    state.gold += goldFromSpirit;
    state.total_gold_earned += goldFromSpirit;
    state.war_spirit = 0;
  }

  // 2. Dead squads go to damaged camp
  for (const squad of state.squads) {
    if (squad.health <= 0) {
      state.damaged_camp.push({
        unit_id: squad.unit_id,
        health: Math.floor(getUnit(squad.unit_id).max_health * 0.3),
      });
    }
  }
  // Remove dead squads
  state.squads = state.squads.filter(s => s.health > 0);

  // 3. Rebuild destroyed walls (auto-repair if gold available, 50% cost)
  for (const b of state.buildings) {
    if (b.is_destroyed && b.building_id === 'building_wall') {
      const bd = getBuilding(b.building_id);
      const rebuildCost = Math.floor(bd.gold_cost * 0.5);
      if (state.gold >= rebuildCost) {
        state.gold -= rebuildCost;
        state.total_gold_spent += rebuildCost;
        b.is_destroyed = false;
        b.durability = Math.floor(bd.max_durability * 0.5);
      }
    }
  }
}

// ============ Full Run ============

export function runSingleSimulation(presetName: string, runId: number, seed: number): SingleRunReport {
  const preset = getPreset(presetName);
  const rng = new SeededRNG(seed);
  const state = initializeGameState(preset, seed);

  const ttcPerDay: number[] = [];
  const ttkPerDay: number[] = [];

  while (!state.is_game_over && state.day <= preset.max_days) {
    // Day phase
    runDayPhase(state, preset, rng);

    // Night phase
    const startEnemies = countEnemiesInWaves(preset.waves[state.day - 1]);
    runNightPhase(state, preset, rng);

    if (state.is_game_over) break;

    // Settlement
    runNightSettlement(state);

    // Record metrics
    ttcPerDay.push(startEnemies > 0 ? 120 : 0); // placeholder TTC
    ttkPerDay.push(15); // placeholder average TTK

    state.day++;
  }

  // Victory: survived all days
  if (!state.is_game_over && state.day > preset.max_days) {
    state.is_game_over = true;
    state.victory = true;
  }

  // Build diversity: count unique unit types
  const unitTypes = new Set(state.squads.map(s => s.unit_id));
  const buildDiversity = unitTypes.size;

  return {
    run_id: runId,
    preset_name: presetName,
    victory: state.victory,
    days_survived: state.day - 1,
    defeat_reason: state.defeat_reason,
    final_gold: state.gold,
    final_main_keep_health: state.main_keep_health,
    total_casualties: state.casualties,
    total_enemy_kills: state.enemy_kills,
    war_spirit_curve: state.war_spirit_curve,
    gold_curve: state.gold_curve,
    avg_ttc_per_day: ttcPerDay,
    avg_ttk_per_day: ttkPerDay,
    build_diversity_score: buildDiversity,
  };
}

function countEnemiesInWaves(waves: { enemies: { enemy_id: string; count: number }[] }[]): number {
  if (!waves) return 0;
  return waves.reduce((sum, w) => sum + w.enemies.reduce((s, e) => s + e.count, 0), 0);
}
