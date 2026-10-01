import { gameState, type SquadEntity, type EnemyEntity, type BuildingEntity, type Position, getWaveComposition, TOTAL_WAVES, WAVE_GAP_SECONDS, WAR_SPIRIT_PER_ENGAGED_SQUAD_PER_SEC } from './game-state';
import { getUnitData, getBuildingData, getEnemyData } from '../content/data';
import { eventBus } from '../core/event-bus';

const MAP_SIZE = 30;
const MAIN_KEEP_POS: Position = { x: 0, z: 0 };

/** 夜间每 8 秒补抽 1 张战术牌（设计：卡牌系统·战术手牌）。 */
const NIGHT_TACTIC_DRAW_INTERVAL = 8;

export function updateCombat(dt: number): void {
  if (gameState.phase !== 'night') return;

  updateEffects(dt);
  updateEnemies(dt);
  updateSquads(dt);
  updateBuildings(dt);
  checkWaveProgress(dt);
}

function updateEffects(dt: number): void {
  for (let i = gameState.activeEffects.length - 1; i >= 0; i--) {
    const eff = gameState.activeEffects[i];
    eff.duration -= dt;

    if (eff.type === 'fire_zone') {
      const { x, z, radius, damage } = eff.params;
      for (const en of gameState.enemies) {
        const dx = en.position.x - x;
        const dz = en.position.z - z;
        if (dx * dx + dz * dz < radius * radius) {
          // 火圈为持续伤害（DPS 模型），* dt 是正确语义，保留
          en.health -= damage * dt;
          en.isBurning = true;
          en.burnDamage = damage;
          en.burnTimer = 1;
        }
      }
    }

    if (eff.duration <= 0) {
      gameState.activeEffects.splice(i, 1);
    }
  }
}

function updateEnemies(dt: number): void {
  // 盾墙令减伤（原有 activeEffects 中存在但从未被消费，B1 重构时激活）
  const squadDamageReduction = hasActiveEffect('shield_wall') ? 0.3 : 0;

  for (let i = gameState.enemies.length - 1; i >= 0; i--) {
    const en = gameState.enemies[i];
    const data = getEnemyData(en.enemyId);
    if (!data) continue;

    // Burn damage（DPS 模型，保留 * dt）
    if (en.isBurning) {
      en.burnTimer -= dt;
      if (en.burnTimer <= 0) {
        en.isBurning = false;
        en.burnDamage = 0;
      } else {
        en.health -= en.burnDamage * dt;
      }
    }

    // Speed modifier decay
    if (en.speedModTimer > 0) {
      en.speedModTimer -= dt;
      if (en.speedModTimer <= 0) {
        en.speedModifier = 1;
      }
    }

    // Death check
    if (en.health <= 0) {
      gameState.removeEnemy(en.id);
      continue;
    }

    // Attack cooldown
    if (en.attackCooldown > 0) {
      en.attackCooldown -= dt;
    }

    // Find target: prioritize squads, then buildings, then main keep
    const targetSquad = findNearestSquad(en.position, 1.5);
    const targetBuilding = findNearestBuilding(en.position, 1.5);

    if (targetSquad) {
      // Attack squad —— B1：事件式固定伤害（原 * dt * 2 帧率依赖已移除）
      if (en.attackCooldown <= 0) {
        targetSquad.health -= data.damage * (1 - squadDamageReduction);
        en.attackCooldown = 1.0;
        eventBus.emit('entity-damaged', { id: targetSquad.id, health: targetSquad.health });
      }
      // Move toward squad
      moveToward(en.position, targetSquad.position, data.move_speed * en.speedModifier * dt * 0.5);
    } else if (targetBuilding) {
      // Attack building —— B1：事件式固定伤害
      if (en.attackCooldown <= 0) {
        targetBuilding.health -= data.damage;
        en.attackCooldown = 1.0;
        eventBus.emit('entity-damaged', { id: targetBuilding.id, health: targetBuilding.health });
      }
      // Move toward building
      moveToward(en.position, targetBuilding.position, data.move_speed * en.speedModifier * dt * 0.5);
    } else {
      // Move toward main keep
      const distToKeep = distance(en.position, MAIN_KEEP_POS);
      if (distToKeep < 2.0) {
        // Attack main keep —— B1：事件式固定伤害
        if (en.attackCooldown <= 0) {
          gameState.mainKeepHealth -= data.damage;
          en.attackCooldown = 1.0;
          eventBus.emit('entity-damaged', { id: 'main_keep', health: gameState.mainKeepHealth });
        }
      } else {
        moveToward(en.position, MAIN_KEEP_POS, data.move_speed * en.speedModifier * dt);
      }
    }
  }

  // Check main keep
  if (gameState.mainKeepHealth <= 0) {
    gameState.gameOver(false);
  }
}

function updateSquads(dt: number): void {
  // I6：本帧接敌班战意产出汇总，一次性入账（避免逐班 emit）
  let frameWarSpirit = 0;

  for (let i = gameState.squads.length - 1; i >= 0; i--) {
    const sq = gameState.squads[i];
    const data = getUnitData(sq.unitId);
    if (!data) continue;

    // Death check —— 阵亡入受损归营堆（I3），由 game-state 统一结算
    if (sq.health <= 0) {
      gameState.squadDestroyed(sq);
      continue;
    }

    // Attack cooldown
    if (sq.attackCooldown > 0) {
      sq.attackCooldown -= dt;
    }

    // I6：撤退战意封锁计时衰减
    if (sq.warSpiritBlockTimer > 0) {
      sq.warSpiritBlockTimer -= dt;
      if (sq.warSpiritBlockTimer < 0) sq.warSpiritBlockTimer = 0;
    }

    // Handle commands
    if (sq.command === 'move' && sq.targetPosition) {
      const dist = distance(sq.position, sq.targetPosition);
      if (dist > 0.5) {
        const speed = data.move_speed * (hasActiveEffect('rally') ? 1.5 : 1);
        moveToward(sq.position, sq.targetPosition, speed * dt);
      } else {
        sq.command = 'hold';
        sq.targetPosition = undefined;
      }
    } else if (sq.command === 'retreat') {
      // Move away from nearest enemy
      const nearest = findNearestEnemy(sq.position);
      if (nearest) {
        const dx = sq.position.x - nearest.position.x;
        const dz = sq.position.z - nearest.position.z;
        const len = Math.sqrt(dx * dx + dz * dz) || 1;
        sq.position.x += (dx / len) * data.move_speed * dt;
        sq.position.z += (dz / len) * data.move_speed * dt;
      }
    }

    // Auto-attack nearest enemy in range
    const attackRange = data.attack_range * (sq.unitId === 'unit_archer' && hasActiveEffect('volley') ? 1.3 : 1);
    const target = findNearestEnemyInRange(sq.position, attackRange);

    // I6：接敌班每秒 0.5 战意（原「每次攻击事件 +0.5」移除）。
    // 接敌 = 射程内有敌、非撤退、且不在 5 秒封锁期。
    const engaged = !!target && sq.command !== 'retreat' && sq.warSpiritBlockTimer <= 0;
    if (engaged) {
      const gain = WAR_SPIRIT_PER_ENGAGED_SQUAD_PER_SEC * dt;
      sq.warSpiritAccum += gain;
      frameWarSpirit += gain;
    }

    if (target && sq.attackCooldown <= 0 && sq.command !== 'retreat') {
      let dmg = data.attack_damage * (hasActiveEffect('volley') && sq.unitId === 'unit_archer' ? 1.5 : 1);

      // B2：枪卒反冲锋加成并入 attackCooldown 门控分支，与主攻击同拍结算。
      // 对移速 > 3.0 的冲锋型敌人（狼群 3.5），单次攻击 = 基础伤害 + 50% 加成。
      if (sq.unitId === 'unit_pikeman') {
        const enemyData = getEnemyData(target.enemyId);
        if (enemyData && enemyData.move_speed > 3.0) {
          dmg += data.attack_damage * 0.5;
        }
      }

      target.health -= dmg;
      sq.attackCooldown = data.attack_speed;

      eventBus.emit('entity-damaged', { id: target.id, health: target.health });
    }
  }

  // I6：本帧接敌战意一次性入账
  if (frameWarSpirit > 0) {
    gameState.addWarSpirit(frameWarSpirit);
  }
}

function updateBuildings(dt: number): void {
  for (let i = gameState.buildings.length - 1; i >= 0; i--) {
    const b = gameState.buildings[i];
    const data = getBuildingData(b.buildingId);
    if (!data) continue;

    // Building destruction check —— 摧毁入受损归营堆（I3）
    if (b.health <= 0) {
      gameState.buildingDestroyed(b);
      continue;
    }

    if (b.attackCooldown > 0) {
      b.attackCooldown -= dt;
    }

    // Arrow tower auto-attack（事件式固定伤害，原实现即正确）
    if (b.buildingId === 'building_arrow_tower' && b.attackCooldown <= 0) {
      const target = findNearestEnemyInRange(b.position, data.attack_range);
      if (target) {
        target.health -= data.attack_damage;
        b.attackCooldown = data.attack_speed;
        eventBus.emit('entity-damaged', { id: target.id, health: target.health });
      }
    }

    // Barracks: heal nearby squads（DPS 模型，保留 * dt）
    if (b.buildingId === 'building_barracks') {
      for (const sq of gameState.squads) {
        if (distance(sq.position, b.position) < 4.0) {
          sq.health = Math.min(sq.maxHealth, sq.health + 5 * dt);
        }
      }
    }
  }
}

/**
 * I2：显式波次状态机（替代原概率刷怪 `Math.random() < dt/spawnRate`）。
 * 节奏：入夜 5 秒威胁预演 → 波 1 → 清波 → 15 秒间隙（弃 2 抽 2 + 下波预演）→ 波 2 → … → 波 3 清空或 240s 夜时到 → 结夜。
 */
function checkWaveProgress(dt: number): void {
  gameState.nightTimer += dt;

  // 夜间每 8 秒补抽 1 张战术牌
  if (gameState.nightTimer - gameState.lastTacticDrawAt >= NIGHT_TACTIC_DRAW_INTERVAL) {
    gameState.lastTacticDrawAt = gameState.nightTimer;
    gameState.drawTacticCards(1);
  }

  if (!gameState.waveActive) {
    // 波间/首波倒计时
    gameState.gapTimer -= dt;
    if (gameState.gapTimer <= 0) {
      spawnWave(gameState.waveNumber + 1);
    }
  } else if (gameState.enemies.length === 0) {
    // 当前波已清空
    if (gameState.waveNumber >= TOTAL_WAVES) {
      gameState.endNight();
      return;
    }
    gameState.waveActive = false;
    gameState.gapTimer = WAVE_GAP_SECONDS;
    gameState.discardAndDrawAtGap();
    gameState.setWavePreview(gameState.waveNumber + 1, gameState.gapTimer);
  }

  // 夜时长兜底（240s，含波次间隙）
  if (gameState.nightTimer >= gameState.nightDuration) {
    gameState.endNight();
  }
}

/** 按显式波次表生成一波敌人（I2）：构成确定，无随机。 */
function spawnWave(waveNumber: number): void {
  gameState.waveNumber = waveNumber;
  gameState.waveActive = true;
  gameState.clearWavePreview();

  const entries = getWaveComposition(gameState.dayCount, waveNumber);
  for (const entry of entries) {
    for (let i = 0; i < entry.count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = MAP_SIZE * 0.45;
      gameState.spawnEnemy(entry.enemyId, {
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
      });
    }
  }
}

function findNearestSquad(pos: Position, maxRange: number): SquadEntity | null {
  let nearest: SquadEntity | null = null;
  let minDist = maxRange;
  for (const sq of gameState.squads) {
    const d = distance(pos, sq.position);
    if (d < minDist) {
      minDist = d;
      nearest = sq;
    }
  }
  return nearest;
}

function findNearestBuilding(pos: Position, maxRange: number): BuildingEntity | null {
  let nearest: BuildingEntity | null = null;
  let minDist = maxRange;
  for (const b of gameState.buildings) {
    const d = distance(pos, b.position);
    if (d < minDist) {
      minDist = d;
      nearest = b;
    }
  }
  return nearest;
}

function findNearestEnemy(pos: Position): EnemyEntity | null {
  let nearest: EnemyEntity | null = null;
  let minDist = Infinity;
  for (const en of gameState.enemies) {
    const d = distance(pos, en.position);
    if (d < minDist) {
      minDist = d;
      nearest = en;
    }
  }
  return nearest;
}

function findNearestEnemyInRange(pos: Position, range: number): EnemyEntity | null {
  let nearest: EnemyEntity | null = null;
  let minDist = range;
  for (const en of gameState.enemies) {
    const d = distance(pos, en.position);
    if (d < minDist) {
      minDist = d;
      nearest = en;
    }
  }
  return nearest;
}

function moveToward(pos: Position, target: Position, speed: number): void {
  const dx = target.x - pos.x;
  const dz = target.z - pos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist > 0.1) {
    const move = Math.min(speed, dist);
    pos.x += (dx / dist) * move;
    pos.z += (dz / dist) * move;
  }
}

function distance(a: Position, b: Position): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function hasActiveEffect(type: string): boolean {
  return gameState.activeEffects.some(e => e.type === type);
}
