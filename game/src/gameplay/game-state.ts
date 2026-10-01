import { eventBus } from '../core/event-bus';
import { getUnitData, getBuildingData, getEnemyData, getCardData, type CardData, type UnitData, type BuildingData, type EnemyData } from '../content/data';

export type GamePhase = 'menu' | 'day' | 'night_transition' | 'night' | 'night_settlement' | 'day_transition' | 'game_over';

export interface Position { x: number; z: number; }

export interface SquadEntity {
  id: string;
  unitId: string;
  position: Position;
  health: number;
  maxHealth: number;
  targetPosition?: Position;
  command: 'hold' | 'move' | 'retreat' | 'focus' | 'none';
  focusTarget?: string;
  attackCooldown: number;
  isSelected: boolean;
  upgradeLevel: number;
  isEmergency: boolean;
  visualUnits: Position[];
}

export interface BuildingEntity {
  id: string;
  buildingId: string;
  position: Position;
  health: number;
  maxHealth: number;
  attackCooldown: number;
}

export interface EnemyEntity {
  id: string;
  enemyId: string;
  position: Position;
  health: number;
  maxHealth: number;
  attackCooldown: number;
  isBurning: boolean;
  burnDamage: number;
  burnTimer: number;
  speedModifier: number;
  speedModTimer: number;
}

export interface TacticEffect {
  type: string;
  duration: number;
  params: Record<string, any>;
}

export class GameState {
  phase: GamePhase = 'menu';
  dayCount: number = 0;
  gold: number = 500;
  warSpirit: number = 0;
  warSpiritMax: number = 40;
  militaryCapacity: number = 8;
  militaryUsed: number = 0;
  workCapacity: number = 8;
  workUsed: number = 0;
  mainKeepHealth: number = 1000;
  mainKeepMaxHealth: number = 1000;

  squads: SquadEntity[] = [];
  buildings: BuildingEntity[] = [];
  enemies: EnemyEntity[] = [];

  armoryDeck: CardData[] = [];
  tacticHand: CardData[] = [];
  tacticDeck: CardData[] = [];
  tacticDiscard: CardData[] = [];
  damagedCamp: { cardId: string; count: number }[] = [];

  activeEffects: TacticEffect[] = [];

  waveActive: boolean = false;
  waveNumber: number = 0;
  waveTimer: number = 0;
  waveEnemiesRemaining: number = 0;
  nightTimer: number = 0;
  nightDuration: number = 120;

  commanderUltimateReady: boolean = true;
  commanderUltimateUsedThisNight: boolean = false;
  firstTacticFree: boolean = true;

  selectedSquadId: string | null = null;
  hoveredCardIndex: number = -1;
  placementCardId: string | null = null;

  cameraZoom: number = 1;
  cameraTarget: Position = { x: 0, z: 0 };

  lastTick: number = 0;
  deltaTime: number = 0;

  // Statistics
  enemiesKilledThisNight: number = 0;
  goldEarnedThisNight: number = 0;
  squadsLostThisNight: number = 0;

  constructor() {
    this.resetGame();
  }

  resetGame(): void {
    this.phase = 'menu';
    this.dayCount = 1;
    this.gold = 500;
    this.warSpirit = 0;
    this.mainKeepHealth = 1000;
    this.militaryUsed = 0;
    this.workUsed = 0;
    this.squads = [];
    this.buildings = [];
    this.enemies = [];
    this.armoryDeck = [];
    this.tacticHand = [];
    this.tacticDeck = [];
    this.tacticDiscard = [];
    this.damagedCamp = [];
    this.activeEffects = [];
    this.waveActive = false;
    this.waveNumber = 0;
    this.commanderUltimateReady = true;
    this.commanderUltimateUsedThisNight = false;
    this.firstTacticFree = true;
    this.selectedSquadId = null;
    this.enemiesKilledThisNight = 0;
    this.goldEarnedThisNight = 0;
    this.squadsLostThisNight = 0;

    // Initial armory deck
    const initialCards = ['card_unit_shieldbearer', 'card_unit_archer', 'card_building_wall', 'card_building_arrow_tower'];
    this.armoryDeck = initialCards.map(id => getCardData(id)!).filter(Boolean);

    // Initial tactic deck
    const initialTactics = ['card_tactic_fire_oil', 'card_tactic_shield_wall', 'card_tactic_volley', 'card_tactic_rally'];
    this.tacticDeck = this.shuffleArray(initialTactics.map(id => getCardData(id)!).filter(Boolean));
  }

  startGame(): void {
    this.resetGame();
    this.phase = 'day';
    eventBus.emit('phase-change', { phase: 'day', day: this.dayCount });
  }

  startNight(): void {
    if (this.phase !== 'day') return;
    this.phase = 'night_transition';
    eventBus.emit('phase-change', { phase: 'night_transition', day: this.dayCount });

    // Transition delay
    setTimeout(() => {
      this.phase = 'night';
      this.waveActive = true;
      this.waveNumber = 1;
      this.waveTimer = 0;
      this.nightTimer = 0;
      this.commanderUltimateUsedThisNight = false;
      this.firstTacticFree = true;
      this.enemiesKilledThisNight = 0;
      this.goldEarnedThisNight = 0;
      this.squadsLostThisNight = 0;

      // Draw initial tactic hand
      this.drawTacticCards(3);

      eventBus.emit('phase-change', { phase: 'night', day: this.dayCount });
      eventBus.emit('wave-started', { wave: this.waveNumber });
    }, 2000);
  }

  endNight(): void {
    if (this.phase !== 'night') return;
    this.phase = 'night_settlement';
    this.waveActive = false;

    // Clear remaining enemies
    this.enemies = [];

    // Convert excess war spirit to gold (50%)
    if (this.warSpirit > 0) {
      const bonusGold = Math.floor(this.warSpirit * 0.5);
      this.gold += bonusGold;
      this.goldEarnedThisNight += bonusGold;
    }
    this.warSpirit = 0;

    // Reset war spirit
    eventBus.emit('war-spirit-changed', this.warSpirit);

    // Emergency squads to damaged camp
    for (const sq of this.squads) {
      if (sq.isEmergency) {
        const card = getCardData(`card_unit_${sq.unitId.replace('unit_', '')}`);
        if (card) {
          const existing = this.damagedCamp.find(d => d.cardId === card.card_id);
          if (existing) existing.count++;
          else this.damagedCamp.push({ cardId: card.card_id, count: 1 });
        }
      }
    }
    this.squads = this.squads.filter(sq => !sq.isEmergency);

    eventBus.emit('phase-change', { phase: 'night_settlement', day: this.dayCount });
  }

  startNextDay(): void {
    this.dayCount++;
    this.phase = 'day_transition';

    // Heal buildings slightly
    for (const b of this.buildings) {
      b.health = Math.min(b.maxHealth, b.health + b.maxHealth * 0.3);
    }

    // Heal squads slightly
    for (const sq of this.squads) {
      sq.health = Math.min(sq.maxHealth, sq.health + sq.maxHealth * 0.2);
    }

    setTimeout(() => {
      this.phase = 'day';
      eventBus.emit('phase-change', { phase: 'day', day: this.dayCount });
    }, 1500);
  }

  gameOver(victory: boolean): void {
    this.phase = 'game_over';
    eventBus.emit('game-over', { victory, day: this.dayCount });
  }

  addGold(amount: number): void {
    this.gold = Math.max(0, this.gold + amount);
    eventBus.emit('gold-changed', this.gold);
  }

  addWarSpirit(amount: number): void {
    this.warSpirit = Math.min(this.warSpiritMax, Math.max(0, this.warSpirit + amount));
    eventBus.emit('war-spirit-changed', this.warSpirit);
  }

  canAffordGold(cost: number): boolean {
    return this.gold >= cost;
  }

  canAffordWarSpirit(cost: number): boolean {
    return this.warSpirit >= cost;
  }

  spendGold(cost: number): boolean {
    if (!this.canAffordGold(cost)) return false;
    this.addGold(-cost);
    return true;
  }

  spendWarSpirit(cost: number): boolean {
    if (!this.canAffordWarSpirit(cost)) return false;
    this.addWarSpirit(-cost);
    return true;
  }

  drawTacticCards(count: number): void {
    for (let i = 0; i < count; i++) {
      if (this.tacticHand.length >= 5) break;
      if (this.tacticDeck.length === 0) {
        if (this.tacticDiscard.length === 0) break;
        this.tacticDeck = this.shuffleArray([...this.tacticDiscard]);
        this.tacticDiscard = [];
      }
      const card = this.tacticDeck.pop()!;
      this.tacticHand.push(card);
    }
  }

  playTacticCard(handIndex: number, target?: Position): boolean {
    if (handIndex < 0 || handIndex >= this.tacticHand.length) return false;
    const card = this.tacticHand[handIndex];
    let cost = card.cost_night;

    // Commander passive: first tactic card free per night
    if (this.firstTacticFree && card.layer === 'tactic') {
      cost = 0;
      this.firstTacticFree = false;
    }

    if (!this.spendWarSpirit(cost)) return false;

    this.tacticHand.splice(handIndex, 1);
    this.tacticDiscard.push(card);

    // Apply effect
    this.applyTacticEffect(card, target);

    eventBus.emit('card-played', { card, target });

    // Draw replacement
    setTimeout(() => this.drawTacticCards(1), 500);

    return true;
  }

  applyTacticEffect(card: CardData, target?: Position): void {
    switch (card.card_id) {
      case 'card_tactic_fire_oil':
        if (target) {
          this.activeEffects.push({
            type: 'fire_zone',
            duration: card.duration,
            params: { x: target.x, z: target.z, radius: 3, damage: 15 },
          });
        }
        break;
      case 'card_tactic_shield_wall':
        this.activeEffects.push({
          type: 'shield_wall',
          duration: card.duration,
          params: { damageReduction: 0.3 },
        });
        break;
      case 'card_tactic_volley':
        this.activeEffects.push({
          type: 'volley',
          duration: card.duration,
          params: { attackSpeedBonus: 0.5 },
        });
        break;
      case 'card_tactic_reinforce':
        if (target) {
          this.spawnSquad('unit_shieldbearer', target, true);
        }
        break;
      case 'card_tactic_rally':
        this.activeEffects.push({
          type: 'rally',
          duration: card.duration,
          params: { speedBonus: 0.5 },
        });
        break;
    }
  }

  useCommanderUltimate(): boolean {
    if (this.commanderUltimateUsedThisNight) return false;
    if (this.phase !== 'night') return false;

    this.commanderUltimateUsedThisNight = true;
    this.drawTacticCards(3);
    // Hand size +2 for this night (simplified: just allow overflow)
    eventBus.emit('commander-ultimate', {});
    return true;
  }

  spawnSquad(unitId: string, position: Position, isEmergency: boolean = false): boolean {
    const data = getUnitData(unitId);
    if (!data) return false;

    if (this.militaryUsed + data.military_cost > this.militaryCapacity) {
      return false;
    }

    const squad: SquadEntity = {
      id: `squad_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      unitId,
      position: { ...position },
      health: data.max_health,
      maxHealth: data.max_health,
      command: 'hold',
      attackCooldown: 0,
      isSelected: false,
      upgradeLevel: 0,
      isEmergency,
      visualUnits: this.generateSquadFormation(data.squad_size),
    };

    this.squads.push(squad);
    this.militaryUsed += data.military_cost;
    eventBus.emit('squad-selected', null);
    return true;
  }

  spawnBuilding(buildingId: string, position: Position): boolean {
    const data = getBuildingData(buildingId);
    if (!data) return false;

    if (this.workUsed + data.work_cost > this.workCapacity) {
      return false;
    }

    const building: BuildingEntity = {
      id: `building_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      buildingId,
      position: { ...position },
      health: data.max_durability,
      maxHealth: data.max_durability,
      attackCooldown: 0,
    };

    this.buildings.push(building);
    this.workUsed += data.work_cost;
    eventBus.emit('building-placed', building);
    return true;
  }

  spawnEnemy(enemyId: string, position: Position): void {
    const data = getEnemyData(enemyId);
    if (!data) return;

    const enemy: EnemyEntity = {
      id: `enemy_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      enemyId,
      position: { ...position },
      health: data.max_health,
      maxHealth: data.max_health,
      attackCooldown: 0,
      isBurning: false,
      burnDamage: 0,
      burnTimer: 0,
      speedModifier: 1,
      speedModTimer: 0,
    };

    this.enemies.push(enemy);
    eventBus.emit('enemy-spawned', enemy);
  }

  removeSquad(squadId: string): void {
    const idx = this.squads.findIndex(s => s.id === squadId);
    if (idx >= 0) {
      const sq = this.squads[idx];
      const data = getUnitData(sq.unitId);
      if (data) this.militaryUsed -= data.military_cost;
      this.squads.splice(idx, 1);
      if (this.selectedSquadId === squadId) {
        this.selectedSquadId = null;
      }
    }
  }

  removeBuilding(buildingId: string): void {
    const idx = this.buildings.findIndex(b => b.id === buildingId);
    if (idx >= 0) {
      const b = this.buildings[idx];
      const data = getBuildingData(b.buildingId);
      if (data) this.workUsed -= data.work_cost;
      this.buildings.splice(idx, 1);
    }
  }

  removeEnemy(enemyId: string): void {
    const idx = this.enemies.findIndex(e => e.id === enemyId);
    if (idx >= 0) {
      const en = this.enemies[idx];
      const data = getEnemyData(en.enemyId);
      if (data) {
        this.addGold(data.reward_gold);
        this.addWarSpirit(data.reward_war_spirit);
        this.goldEarnedThisNight += data.reward_gold;
      }
      this.enemies.splice(idx, 1);
      this.enemiesKilledThisNight++;
    }
  }

  selectSquad(squadId: string | null): void {
    for (const sq of this.squads) sq.isSelected = false;
    this.selectedSquadId = squadId;
    if (squadId) {
      const sq = this.squads.find(s => s.id === squadId);
      if (sq) sq.isSelected = true;
    }
    eventBus.emit('squad-selected', squadId);
  }

  issueSquadCommand(command: SquadEntity['command'], targetPos?: Position, targetId?: string): void {
    if (!this.selectedSquadId) return;
    const sq = this.squads.find(s => s.id === this.selectedSquadId);
    if (!sq) return;

    sq.command = command;
    if (targetPos) sq.targetPosition = { ...targetPos };
    if (targetId) sq.focusTarget = targetId;

    eventBus.emit('squad-command', { squadId: sq.id, command, targetPos, targetId });
  }

  private generateSquadFormation(size: number): Position[] {
    const formation: Position[] = [];
    const cols = Math.ceil(Math.sqrt(size));
    for (let i = 0; i < size; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      formation.push({
        x: (col - cols / 2 + 0.5) * 0.4,
        z: (row - Math.ceil(size / cols) / 2 + 0.5) * 0.4,
      });
    }
    return formation;
  }

  private shuffleArray<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

export const gameState = new GameState();
