import { gameState, type SquadEntity, type EnemyEntity, type BuildingEntity, type Position } from './game-state';
import { getUnitData, getBuildingData, getEnemyData } from '../content/data';
import { eventBus } from '../core/event-bus';

const MAP_SIZE = 30;
const MAIN_KEEP_POS: Position = { x: 0, z: 0 };

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
  for (let i = gameState.enemies.length - 1; i >= 0; i--) {
    const en = gameState.enemies[i];
    const data = getEnemyData(en.enemyId);
    if (!data) continue;

    // Burn damage
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
    let targetSquad = findNearestSquad(en.position, 1.5);
    let targetBuilding = findNearestBuilding(en.position, 1.5);

    if (targetSquad) {
      // Attack squad
      if (en.attackCooldown <= 0) {
        targetSquad.health -= data.damage * dt * 2;
        en.attackCooldown = 1.0;
        eventBus.emit('entity-damaged', { id: targetSquad.id, health: targetSquad.health });
      }
      // Move toward squad
      moveToward(en.position, targetSquad.position, data.move_speed * en.speedModifier * dt * 0.5);
    } else if (targetBuilding) {
      // Attack building
      if (en.attackCooldown <= 0) {
        targetBuilding.health -= data.damage * dt * 2;
        en.attackCooldown = 1.0;
        eventBus.emit('entity-damaged', { id: targetBuilding.id, health: targetBuilding.health });
      }
      // Move toward building
      moveToward(en.position, targetBuilding.position, data.move_speed * en.speedModifier * dt * 0.5);
    } else {
      // Move toward main keep
      const distToKeep = distance(en.position, MAIN_KEEP_POS);
      if (distToKeep < 2.0) {
        if (en.attackCooldown <= 0) {
          gameState.mainKeepHealth -= data.damage * dt * 2;
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
  for (let i = gameState.squads.length - 1; i >= 0; i--) {
    const sq = gameState.squads[i];
    const data = getUnitData(sq.unitId);
    if (!data) continue;

    // Death check
    if (sq.health <= 0) {
      gameState.removeSquad(sq.id);
      gameState.squadsLostThisNight++;
      continue;
    }

    // Attack cooldown
    if (sq.attackCooldown > 0) {
      sq.attackCooldown -= dt;
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
      // Retreat only produces no war spirit for 5s (simplified: just move away)
    }

    // Auto-attack nearest enemy in range
    const attackRange = data.attack_range * (sq.unitId === 'unit_archer' && hasActiveEffect('volley') ? 1.3 : 1);
    const target = findNearestEnemyInRange(sq.position, attackRange);

    if (target && sq.attackCooldown <= 0 && sq.command !== 'retreat') {
      const dmg = data.attack_damage * (hasActiveEffect('volley') && sq.unitId === 'unit_archer' ? 1.5 : 1);
      target.health -= dmg;
      sq.attackCooldown = data.attack_speed;

      // Produce war spirit on contact
      gameState.addWarSpirit(0.5);

      eventBus.emit('entity-damaged', { id: target.id, health: target.health });
    }

    // Pikeman anti-charge bonus
    if (sq.unitId === 'unit_pikeman' && target) {
      const enemyData = getEnemyData(target.enemyId);
      if (enemyData && enemyData.move_speed > 3.0) {
        target.health -= data.attack_damage * 0.5; // Bonus damage
      }
    }
  }
}

function updateBuildings(dt: number): void {
  for (const b of gameState.buildings) {
    const data = getBuildingData(b.buildingId);
    if (!data) continue;

    // Building destruction check
    if (b.health <= 0) {
      eventBus.emit('entity-destroyed', { id: b.id });
      gameState.removeBuilding(b.id);
      continue;
    }

    if (b.attackCooldown > 0) {
      b.attackCooldown -= dt;
    }

    // Arrow tower auto-attack
    if (b.buildingId === 'building_arrow_tower' && b.attackCooldown <= 0) {
      const target = findNearestEnemyInRange(b.position, data.attack_range);
      if (target) {
        target.health -= data.attack_damage;
        b.attackCooldown = data.attack_speed;
        eventBus.emit('entity-damaged', { id: target.id, health: target.health });
      }
    }

    // Barracks: heal nearby squads
    if (b.buildingId === 'building_barracks') {
      for (const sq of gameState.squads) {
        if (distance(sq.position, b.position) < 4.0) {
          sq.health = Math.min(sq.maxHealth, sq.health + 5 * dt);
        }
      }
    }
  }
}

function checkWaveProgress(dt: number): void {
  gameState.nightTimer += dt;

  // Spawn enemies throughout the night
  const spawnRate = gameState.dayCount <= 1 ? 2.0 : gameState.dayCount <= 2 ? 1.5 : 1.0;
  if (gameState.waveActive && Math.random() < dt / spawnRate) {
    spawnRandomEnemy();
  }

  // Night ends after duration
  if (gameState.nightTimer >= gameState.nightDuration) {
    gameState.endNight();
  }
}

function spawnRandomEnemy(): void {
  const enemyTypes = ['enemy_wolf', 'enemy_shield_crusher', 'enemy_burrower'];
  // More enemy variety as days progress
  const available = enemyTypes.slice(0, Math.min(enemyTypes.length, gameState.dayCount + 1));
  const type = available[Math.floor(Math.random() * available.length)];

  // Spawn at edge of map
  const angle = Math.random() * Math.PI * 2;
  const radius = MAP_SIZE * 0.45;
  const pos = {
    x: Math.cos(angle) * radius,
    z: Math.sin(angle) * radius,
  };

  gameState.spawnEnemy(type, pos);
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
