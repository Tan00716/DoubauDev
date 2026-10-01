import { eventBus } from '../core/event-bus';
import { getUnitData, getBuildingData, getEnemyData, getCardData, type CardData } from '../content/data';

export type GamePhase = 'menu' | 'day' | 'night_transition' | 'night' | 'night_settlement' | 'day_transition' | 'game_over';

export interface Position { x: number; z: number; }

// ===== 设计基准常量（来源：游戏核心设计主文档 rev 26）=====
// 经济系统资源表：军令/工令初始 6/8，领地攻克 +2 任选，中期扩容至军令 12–18。
// M1 无领地征服，取设计初始值 6/8。
export const DESIGN_MILITARY_CAPACITY = 6;
export const DESIGN_WORK_CAPACITY = 8;
// 夜间守城节奏：每夜 3–6 分钟，M1 取 240 秒（含波次间隙，不含入夜/天亮过渡动画）。
export const NIGHT_DURATION = 240;
export const NIGHT_TRANSITION_SECONDS = 2.0;
export const DAY_TRANSITION_SECONDS = 1.5;
// 波次结构：每夜 1–4 波，M1 固定 3 波；波次间隙 15 秒；入夜首波前 5 秒威胁预演。
export const TOTAL_WAVES = 3;
export const WAVE_GAP_SECONDS = 15;
export const WAVE_PREVIEW_LEAD_SECONDS = 5;
// 战意：接敌班每秒 0.5；撤退后 5 秒战意封锁（经济系统·战意行）。
export const WAR_SPIRIT_PER_ENGAGED_SQUAD_PER_SEC = 0.5;
export const RETREAT_WAR_SPIRIT_BLOCK_SECONDS = 5;
// 通关判定：一局 8 昼夜（一局结构章节「一局 8 昼夜版的标准基准」）。
export const VICTORY_DAYS = 8;

export interface WaveEntry { enemyId: string; count: number; }
export interface WavePreview { wave: number; eta: number; entries: WaveEntry[]; }

/** 显式波次表（I2）：按昼夜数与波次号给出确定的敌人构成，无随机刷怪。 */
export function getWaveComposition(day: number, wave: number): WaveEntry[] {
  const d = Math.max(1, day);
  if (wave <= 1) {
    return [{ enemyId: 'enemy_wolf', count: 2 + d }];
  }
  if (wave === 2) {
    return [
      { enemyId: 'enemy_wolf', count: 1 + Math.floor(d / 2) },
      { enemyId: 'enemy_shield_crusher', count: 1 + Math.floor(d / 3) },
    ];
  }
  if (wave === 3) {
    return [
      { enemyId: 'enemy_shield_crusher', count: 1 + Math.floor(d / 2) },
      { enemyId: 'enemy_burrower', count: 1 + Math.floor(d / 2) },
      { enemyId: 'enemy_wolf', count: d },
    ];
  }
  return [];
}

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
  upgradeLevel: number;      // 0=Lv1, 1=Lv2, 2=Lv3（同名牌升级）
  isEmergency: boolean;
  warSpiritAccum: number;    // 接敌战意累计（I6）
  warSpiritBlockTimer: number; // 撤退战意封锁剩余秒数（I6）
  visualUnits: Position[];
}

export interface BuildingEntity {
  id: string;
  buildingId: string;
  position: Position;
  health: number;
  maxHealth: number;
  attackCooldown: number;
  upgradeLevel: number;      // 0=Lv1, 1=Lv2, 2=Lv3
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
  militaryCapacity: number = DESIGN_MILITARY_CAPACITY;
  militaryUsed: number = 0;
  workCapacity: number = DESIGN_WORK_CAPACITY;
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
  /** N4：已付费修复（一次性 50%，含再入场）、等待免费半血落阵的卡及张数（Map 保留计数，同名多张不丢失）。 */
  recalledPending: Map<string, number> = new Map();

  activeEffects: TacticEffect[] = [];

  // 波次状态机（I2）：waveNumber 0 = 首波尚未抵达（威胁预演期）
  waveActive: boolean = false;
  waveNumber: number = 0;
  waveTimer: number = 0;
  gapTimer: number = 0;
  waveEnemiesRemaining: number = 0; // 兼容保留，实际剩余以 enemies.length 为准
  nightTimer: number = 0;
  nightDuration: number = NIGHT_DURATION;
  wavePreview: WavePreview | null = null;
  lastTacticDrawAt: number = 0;

  // 阶段过渡计时（I4）：由 update(dt) 驱动，不再使用 setTimeout
  phaseTimer: number = 0;

  // 胜利路径（I5）：守住第 8 夜后进入通关
  victoryPending: boolean = false;

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
  spiritConvertedLastNight: number = 0;

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
    this.tacticHand = [];
    this.tacticDeck = [];
    this.tacticDiscard = [];
    this.damagedCamp = [];
    this.recalledPending = new Map();
    this.activeEffects = [];
    this.waveActive = false;
    this.waveNumber = 0;
    this.waveTimer = 0;
    this.gapTimer = 0;
    this.nightTimer = 0;
    this.nightDuration = NIGHT_DURATION;
    this.wavePreview = null;
    this.lastTacticDrawAt = 0;
    this.phaseTimer = 0;
    this.victoryPending = false;
    this.commanderUltimateReady = true;
    this.commanderUltimateUsedThisNight = false;
    this.firstTacticFree = true;
    this.selectedSquadId = null;
    this.hoveredCardIndex = -1;
    this.placementCardId = null;
    this.enemiesKilledThisNight = 0;
    this.goldEarnedThisNight = 0;
    this.squadsLostThisNight = 0;
    this.spiritConvertedLastNight = 0;

    // 初始军械册（B3）：6 张全量——3 单位卡 + 3 建筑卡，克隆以携带 upgrade_level 状态
    const initialCards = [
      'card_unit_shieldbearer',
      'card_unit_archer',
      'card_unit_pikeman',
      'card_building_wall',
      'card_building_arrow_tower',
      'card_building_barracks',
    ];
    this.armoryDeck = initialCards
      .map(id => getCardData(id))
      .filter((c): c is CardData => !!c)
      .map(c => ({ ...c }));

    // 初始战术牌库（N3：紧急增援入池 4→5 张——召唤物、夜末消散、7 战意，定价 rev32 终裁）
    const initialTactics = ['card_tactic_fire_oil', 'card_tactic_shield_wall', 'card_tactic_volley', 'card_tactic_rally', 'card_tactic_reinforce'];
    this.tacticDeck = this.shuffleArray(initialTactics
      .map(id => getCardData(id))
      .filter((c): c is CardData => !!c)
      .map(c => ({ ...c })));
  }

  startGame(): void {
    this.resetGame();
    this.phase = 'day';
    eventBus.emit('phase-change', { phase: 'day', day: this.dayCount });
  }

  /**
   * 主循环驱动（I4）：阶段过渡计时统一在 update(dt) 内推进，
   * 取代原 setTimeout 方案——切后台时 rAF 与阶段机不再脱钩。
   */
  update(dt: number): void {
    if (this.phase === 'night_transition') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        this.beginNight();
      }
    } else if (this.phase === 'day_transition') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        this.phase = 'day';
        eventBus.emit('phase-change', { phase: 'day', day: this.dayCount });
      }
    }
  }

  startNight(): void {
    if (this.phase !== 'day') return;
    this.phase = 'night_transition';
    this.phaseTimer = NIGHT_TRANSITION_SECONDS;
    eventBus.emit('phase-change', { phase: 'night_transition', day: this.dayCount });
  }

  /** 入夜过渡结束，真正进入夜间战斗（由 update(dt) 触发）。 */
  beginNight(): void {
    this.phase = 'night';
    this.waveActive = false;
    this.waveNumber = 0;
    this.waveTimer = 0;
    this.gapTimer = WAVE_PREVIEW_LEAD_SECONDS; // 首波抵达前的威胁预演窗口
    this.nightTimer = 0;
    this.lastTacticDrawAt = 0;
    this.commanderUltimateUsedThisNight = false;
    this.firstTacticFree = true;
    this.enemiesKilledThisNight = 0;
    this.goldEarnedThisNight = 0;
    this.squadsLostThisNight = 0;
    this.spiritConvertedLastNight = 0;

    // 抽初始战术手牌
    this.drawTacticCards(3);

    eventBus.emit('phase-change', { phase: 'night', day: this.dayCount });
    this.setWavePreview(1, this.gapTimer);
  }

  endNight(): void {
    if (this.phase !== 'night') return;
    this.phase = 'night_settlement';
    this.waveActive = false;
    this.wavePreview = null;

    // 清场残余敌人
    this.enemies = [];

    // 战意结余（上限 40，超出部分按 50% 折算为金币）
    if (this.warSpirit > 0) {
      const bonusGold = Math.floor(this.warSpirit * 0.5);
      this.gold += bonusGold;
      this.goldEarnedThisNight += bonusGold;
      this.spiritConvertedLastNight = bonusGold;
    }
    this.warSpirit = 0;
    eventBus.emit('war-spirit-changed', this.warSpirit);

    // 应急增援实体进入受损归营堆（I3）：夜末结算
    for (const sq of this.squads) {
      if (sq.isEmergency) {
        const cardId = `card_unit_${sq.unitId.replace('unit_', '')}`;
        if (getCardData(cardId)) {
          const existing = this.damagedCamp.find(d => d.cardId === cardId);
          if (existing) existing.count++;
          else this.damagedCamp.push({ cardId, count: 1 });
        }
      }
    }
    this.squads = this.squads.filter(sq => !sq.isEmergency);

    // 胜利路径（I5）：守住第 8 夜即通关
    if (this.dayCount >= VICTORY_DAYS) {
      this.victoryPending = true;
    }

    eventBus.emit('phase-change', { phase: 'night_settlement', day: this.dayCount });
  }

  startNextDay(): void {
    if (this.phase !== 'night_settlement') return;

    // 通关结算优先于进入次日（I5）
    if (this.victoryPending) {
      this.gameOver(true);
      return;
    }

    this.dayCount++;
    this.phase = 'day_transition';
    this.phaseTimer = DAY_TRANSITION_SECONDS;

    // 建筑轻微自愈
    for (const b of this.buildings) {
      b.health = Math.min(b.maxHealth, b.health + b.maxHealth * 0.3);
    }
    // 班组轻微自愈
    for (const sq of this.squads) {
      sq.health = Math.min(sq.maxHealth, sq.health + sq.maxHealth * 0.2);
    }

    eventBus.emit('phase-change', { phase: 'day_transition', day: this.dayCount });
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

  /** 波次间隙「弃 2 抽 2」（卡牌系统·战术手牌）。 */
  discardAndDrawAtGap(): void {
    const discardCount = Math.min(2, this.tacticHand.length);
    for (let i = 0; i < discardCount; i++) {
      this.tacticDiscard.push(this.tacticHand.shift()!);
    }
    this.drawTacticCards(2);
  }

  setWavePreview(wave: number, eta: number): void {
    if (wave < 1 || wave > TOTAL_WAVES) {
      this.wavePreview = null;
      return;
    }
    this.wavePreview = { wave, eta, entries: getWaveComposition(this.dayCount, wave) };
    eventBus.emit('wave-preview', this.wavePreview);
  }

  clearWavePreview(): void {
    this.wavePreview = null;
  }

  playTacticCard(handIndex: number, target?: Position): boolean {
    if (handIndex < 0 || handIndex >= this.tacticHand.length) return false;
    const card = this.tacticHand[handIndex];

    // N1 第一道保险：出牌前预检（军令容量满时直接拒绝，UI 同步置灰）
    if (!this.canPlayTacticCard(card)) return false;

    let cost = card.cost_night;

    // 指挥官被动：每夜第一张战术牌免费
    const usedFirstTacticFree = this.firstTacticFree && card.layer === 'tactic';
    if (usedFirstTacticFree) {
      cost = 0;
      this.firstTacticFree = false;
    }

    if (!this.spendWarSpirit(cost)) return false;

    this.tacticHand.splice(handIndex, 1);
    this.tacticDiscard.push(card);

    // N1 第二道保险（兜底）：效果落空（如竞态下军令容量已满）→ 退款退牌，不静默吞卡
    if (!this.applyTacticEffect(card, target)) {
      this.addWarSpirit(cost);
      if (usedFirstTacticFree) this.firstTacticFree = true;
      const di = this.tacticDiscard.lastIndexOf(card);
      if (di >= 0) this.tacticDiscard.splice(di, 1);
      this.tacticHand.splice(handIndex, 0, card);
      return false;
    }

    eventBus.emit('card-played', { card, target });

    // 立即补牌（I4：去掉 setTimeout 脱钩）
    this.drawTacticCards(1);

    return true;
  }

  /** N1：战术牌可打出预检——紧急增援需占用军令容量，容量不足时不可出（UI 置灰依据）。 */
  canPlayTacticCard(card: CardData): boolean {
    if (card.card_id === 'card_tactic_reinforce') {
      const data = getUnitData('unit_shieldbearer');
      if (!data) return false;
      if (this.militaryUsed + data.military_cost > this.militaryCapacity) return false;
    }
    return true;
  }

  applyTacticEffect(card: CardData, target?: Position): boolean {
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
        if (!target) return false;
        return this.spawnSquad('unit_shieldbearer', target, true);
      case 'card_tactic_rally':
        this.activeEffects.push({
          type: 'rally',
          duration: card.duration,
          params: { speedBonus: 0.5 },
        });
        break;
    }
    return true;
  }

  useCommanderUltimate(): boolean {
    if (this.commanderUltimateUsedThisNight) return false;
    if (this.phase !== 'night') return false;

    this.commanderUltimateUsedThisNight = true;
    this.drawTacticCards(3);
    eventBus.emit('commander-ultimate', {});
    return true;
  }

  /**
   * 军械册落阵（I3 + B3 收口）：白天打出单位/建筑卡。
   * - 同名实体在场 → 升级该实体（Lv1→2→3，规模 +50%/级，M1 无 A/B 分支的简化路径）
   * - 实体不在场且卡未受损 → 部署新实体（满血）
   * - 卡在受损归营堆 → 必须先付费修复，修复后部署以半血入场
   */
  deployArmoryCard(cardId: string, position: Position): boolean {
    if (this.phase !== 'day') return false;
    const card = this.armoryDeck.find(c => c.card_id === cardId);
    if (!card) return false;

    const damagedEntry = this.damagedCamp.find(d => d.cardId === cardId);
    if (damagedEntry && damagedEntry.count > 0) return false; // 需先修复

    if (card.category === 'unit') {
      const unitId = card.card_id.replace('card_unit_', 'unit_');
      const data = getUnitData(unitId);
      if (!data) return false;

      const existing = this.squads.find(s => s.unitId === unitId);
      if (existing) {
        // 同名牌升级（I3）
        if (existing.upgradeLevel >= 2) return false; // 已达 Lv3 上限
        if (!this.spendGold(card.cost_day)) return false;
        existing.upgradeLevel++;
        this.applySquadUpgrade(existing);
        card.upgrade_level = existing.upgradeLevel;
        eventBus.emit('entity-upgraded', { id: existing.id, level: existing.upgradeLevel, kind: 'squad' });
        return true;
      }

      if (this.militaryUsed + data.military_cost > this.militaryCapacity) return false;
      // N4：修复即含再入场——已修复卡落阵不再收 cost_day（费用已在修复时一次性付 50%）
      const pending = this.recalledPending.get(cardId) ?? 0;
      const isRecall = pending > 0;
      if (!isRecall && !this.spendGold(card.cost_day)) return false;
      const ok = this.spawnSquad(unitId, position, false, isRecall);
      if (!ok) {
        if (!isRecall) this.addGold(card.cost_day);
        return false;
      }
      if (isRecall) this.consumeRecalled(cardId, pending);
      return true;
    }

    if (card.category === 'building') {
      const buildingId = card.card_id.replace('card_building_', 'building_');
      const data = getBuildingData(buildingId);
      if (!data) return false;

      const existing = this.buildings.find(b => b.buildingId === buildingId);
      if (existing) {
        // 同名牌升级（I3）
        if (existing.upgradeLevel >= 2) return false;
        if (!this.spendGold(card.cost_day)) return false;
        existing.upgradeLevel++;
        this.applyBuildingUpgrade(existing);
        card.upgrade_level = existing.upgradeLevel;
        eventBus.emit('entity-upgraded', { id: existing.id, level: existing.upgradeLevel, kind: 'building' });
        return true;
      }

      if (this.workUsed + data.work_cost > this.workCapacity) return false;
      // N4：修复即含再入场——已修复卡落阵不再收 cost_day（费用已在修复时一次性付 50%）
      const pendingB = this.recalledPending.get(cardId) ?? 0;
      const isRecallB = pendingB > 0;
      if (!isRecallB && !this.spendGold(card.cost_day)) return false;
      const ok = this.spawnBuilding(buildingId, position, isRecallB);
      if (!ok) {
        if (!isRecallB) this.addGold(card.cost_day);
        return false;
      }
      if (isRecallB) this.consumeRecalled(cardId, pendingB);
      return true;
    }

    return false;
  }

  /** N4：消耗一张「已修复待落阵」计数（同名多张时只减一，不误清）。 */
  private consumeRecalled(cardId: string, pending: number): void {
    if (pending <= 1) this.recalledPending.delete(cardId);
    else this.recalledPending.set(cardId, pending - 1);
  }

  /** 同名牌升级：规模 +50%/级（M1 简化：属性路径；A/B 机制分支留待 MVP）。 */
  private applySquadUpgrade(sq: SquadEntity): void {
    const data = getUnitData(sq.unitId);
    if (!data) return;
    sq.maxHealth = data.max_health * (1 + 0.5 * sq.upgradeLevel);
    sq.health += data.max_health * 0.5;
  }

  private applyBuildingUpgrade(b: BuildingEntity): void {
    const data = getBuildingData(b.buildingId);
    if (!data) return;
    b.maxHealth = data.max_durability * (1 + 0.5 * b.upgradeLevel);
    b.health += data.max_durability * 0.5;
  }

  /** N4（原 I3）：受损归营堆消费——次日白天一次性 50% 金币修复（含再入场），修复后免费半血落阵。 */
  repairDamagedCard(cardId: string): boolean {
    const entry = this.damagedCamp.find(d => d.cardId === cardId);
    if (!entry || entry.count <= 0) return false;
    const card = this.armoryDeck.find(c => c.card_id === cardId);
    if (!card) return false;

    const cost = Math.ceil(card.cost_day * 0.5);
    if (!this.spendGold(cost)) return false;

    entry.count--;
    if (entry.count <= 0) {
      this.damagedCamp = this.damagedCamp.filter(d => d.count > 0);
    }
    // N4：Map 计数——同名多张受损卡各自修复、各自保留一张「免费半血落阵」名额
    this.recalledPending.set(cardId, (this.recalledPending.get(cardId) ?? 0) + 1);
    eventBus.emit('damaged-camp-changed', {});
    return true;
  }

  spawnSquad(unitId: string, position: Position, isEmergency: boolean = false, halfHealth: boolean = false): boolean {
    const data = getUnitData(unitId);
    if (!data) return false;

    if (this.militaryUsed + data.military_cost > this.militaryCapacity) {
      return false;
    }

    const squad: SquadEntity = {
      id: `squad_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      unitId,
      position: { ...position },
      health: data.max_health * (halfHealth ? 0.5 : 1),
      maxHealth: data.max_health,
      command: 'hold',
      attackCooldown: 0,
      isSelected: false,
      upgradeLevel: 0,
      isEmergency,
      warSpiritAccum: 0,
      warSpiritBlockTimer: 0,
      visualUnits: this.generateSquadFormation(data.squad_size),
    };

    this.squads.push(squad);
    this.militaryUsed += data.military_cost;
    eventBus.emit('military-changed', this.militaryUsed);
    return true;
  }

  spawnBuilding(buildingId: string, position: Position, halfHealth: boolean = false): boolean {
    const data = getBuildingData(buildingId);
    if (!data) return false;

    if (this.workUsed + data.work_cost > this.workCapacity) {
      return false;
    }

    const building: BuildingEntity = {
      id: `building_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      buildingId,
      position: { ...position },
      health: data.max_durability * (halfHealth ? 0.5 : 1),
      maxHealth: data.max_durability,
      attackCooldown: 0,
      upgradeLevel: 0,
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

  /** 班组阵亡（夜间）：常规班对应卡进入归营堆；应急增援直接消散。 */
  squadDestroyed(sq: SquadEntity): void {
    if (!sq.isEmergency) {
      const cardId = `card_unit_${sq.unitId.replace('unit_', '')}`;
      if (getCardData(cardId)) {
        const entry = this.damagedCamp.find(d => d.cardId === cardId);
        if (entry) entry.count++;
        else this.damagedCamp.push({ cardId, count: 1 });
        eventBus.emit('damaged-camp-changed', {});
      }
    }
    this.removeSquad(sq.id);
    this.squadsLostThisNight++;
  }

  /** 建筑被摧毁：对应卡进入归营堆。 */
  buildingDestroyed(b: BuildingEntity): void {
    const cardId = `card_building_${b.buildingId.replace('building_', '')}`;
    if (getCardData(cardId)) {
      const entry = this.damagedCamp.find(d => d.cardId === cardId);
      if (entry) entry.count++;
      else this.damagedCamp.push({ cardId, count: 1 });
      eventBus.emit('damaged-camp-changed', {});
    }
    eventBus.emit('entity-destroyed', { id: b.id });
    this.removeBuilding(b.id);
  }

  removeSquad(squadId: string): void {
    const idx = this.squads.findIndex(s => s.id === squadId);
    if (idx >= 0) {
      const sq = this.squads[idx];
      const data = getUnitData(sq.unitId);
      if (data) this.militaryUsed -= data.military_cost;
      this.squads.splice(idx, 1);
      eventBus.emit('military-changed', this.militaryUsed);
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

    // 撤退触发 5 秒战意封锁（I6，经济系统·战意行）
    if (command === 'retreat') {
      sq.warSpiritBlockTimer = RETREAT_WAR_SPIRIT_BLOCK_SECONDS;
    }

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
