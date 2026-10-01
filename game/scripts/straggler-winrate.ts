/**
 * MVP 批次三·game 侧残兵口径胜率测试批（响应研发工程师模拟器交叉复核发现：
 * 残兵全额奖励把三 preset 胜率推到 92–98%，超出 40–70% 目标带——产品终裁需要 game 侧对照数据）。
 *
 * 方法：同一套「随机化固定策略」（沿路线布防 + 随机站位抖动 + 随机采购顺序）在五种
 * stragglerMode 口径下各跑 N 局，胜率差异即残兵奖励口径对 game 侧难度的影响。
 * game 引擎在给定布阵下是确定性的（路线制后出生位置不再随机），随机性全部来自策略层
 * （站位/采购时序），跨口径同分布——相对比较有效。
 *
 * 运行：npx vite-node scripts/straggler-winrate.ts
 * 可续跑：进度写 progress-straggler.jsonl，重跑只补缺失组合。
 */
import * as fs from 'fs';
import * as path from 'path';
import { gameState, getNightRouteAngles, type StragglerMode } from '../src/gameplay/game-state';
import { updateCombat } from '../src/gameplay/combat';

const PILOT = !!process.env.PILOT;
const MODES: { mode: StragglerMode; runs: number }[] = [
  { mode: 'off', runs: PILOT ? 3 : 30 },          // 消融对照：无残兵（纯批次三节奏）
  { mode: 'no_reward', runs: PILOT ? 3 : 30 },    // 选项①：残兵纯填充零奖励
  { mode: 'single', runs: PILOT ? 3 : 30 },       // 选项②：减为 1 只/波间（全额奖励）
  { mode: 'half_reward', runs: PILOT ? 3 : 30 },  // 选项③：2 只但奖励减半
  { mode: 'default', runs: PILOT ? 3 : 30 },      // v7 现状：2 只全额奖励
];

const PROGRESS_FILE = path.join(__dirname, 'progress-straggler.jsonl');
const TIME_BUDGET_SECONDS = 460;
const startedAt = Date.now();

/** 读取已完成组合：`mode#index`。 */
function loadProgress(): Set<string> {
  const done = new Set<string>();
  if (fs.existsSync(PROGRESS_FILE)) {
    for (const line of fs.readFileSync(PROGRESS_FILE, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try { const r = JSON.parse(line); done.add(`${r.mode}#${r.index}`); } catch { /* 跳过损坏行 */ }
    }
  }
  return done;
}

const progress = loadProgress();
const results = new Map<string, { wins: number; runs: number; daysSum: number }>();

function record(mode: string, index: number, win: boolean, days: number): void {
  const agg = results.get(mode) ?? { wins: 0, runs: 0, daysSum: 0 };
  agg.runs++; if (win) agg.wins++; agg.daysSum += days;
  results.set(mode, agg);
  fs.appendFileSync(PROGRESS_FILE, JSON.stringify({ mode, index, win, days }) + '\n');
}

const DEBUG = !!process.env.DEBUG;
const jitter = (m: number): number => (Math.random() - 0.5) * m;

/** 白天策略（真实经济打法，不用战术牌）：
 * 修复受损卡 → 落满 3 单位（盾卫贴堡 / 弓手中距 / 枪卒补位）→ 落箭塔+城墙 → 富余按随机化优先级升级。 */
function deployPolicy(): void {
  // 1) 修复受损卡（保留 100 金储备）
  let repairGuard = 0;
  while (repairGuard++ < 10) {
    const entry = gameState.damagedCamp[0];
    if (!entry || gameState.gold < 60) break;
    if (!gameState.repairDamagedCard(entry.cardId)) break;
  }

  const routes = getNightRouteAngles(gameState.dayCount);
  const placeAt = (routeIdx: number, radius: number, aj: number, rj: number) => {
    const a = routes[routeIdx % routes.length] + jitter(aj);
    const r = Math.max(1.2, radius + jitter(rj));
    return { x: Math.cos(a) * r, z: Math.sin(a) * r };
  };

  // 2) 落满 3 单位（MVP 军械册制：同名再打 = 升级，实体只有一个）
  const unitPlans: { card: string; unit: string; rIdx: number; radius: number }[] = [
    { card: 'card_unit_shieldbearer', unit: 'unit_shieldbearer', rIdx: 0, radius: 2.5 },
    { card: 'card_unit_archer', unit: 'unit_archer', rIdx: 1, radius: 7 },
    { card: 'card_unit_pikeman', unit: 'unit_pikeman', rIdx: 2, radius: 3.5 },
  ];
  for (const p of unitPlans) {
    if (gameState.squads.some(s => s.unitId === p.unit)) continue;
    gameState.deployArmoryCard(p.card, placeAt(p.rIdx, p.radius, 0.4, 1));
  }

  // 3) 建筑：箭塔沿主路线中距、城墙贴主路线
  if (!gameState.buildings.some(b => b.buildingId === 'building_arrow_tower')) {
    gameState.deployArmoryCard('card_building_arrow_tower', placeAt(0, 4.5, 0.4, 1.5));
  }
  if (!gameState.buildings.some(b => b.buildingId === 'building_wall')) {
    gameState.deployArmoryCard('card_building_wall', placeAt(0, 1.5, 0.5, 0.3));
  }
  if (!gameState.buildings.some(b => b.buildingId === 'building_barracks')) {
    gameState.deployArmoryCard('card_building_barracks', placeAt(0, 3, 0.4, 0.8));
  }

  // 4) 富余升级：随机化优先级，保留 60 金修复储备，升到 Lv3 上限为止
  const upgradePool = ['card_unit_archer', 'card_building_arrow_tower', 'card_unit_shieldbearer', 'card_unit_pikeman', 'card_building_barracks'];
  for (let i = upgradePool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [upgradePool[i], upgradePool[j]] = [upgradePool[j], upgradePool[i]];
  }
  let upGuard = 0;
  while (upGuard++ < 12) {
    const affordable = upgradePool.filter(id => {
      const card = gameState.armoryDeck.find(c => c.card_id === id);
      if (!card || gameState.gold < card.cost_day + 60) return false;
      if (id.startsWith('card_unit_')) {
        const sq = gameState.squads.find(s => s.unitId === id.replace('card_unit_', 'unit_'));
        return !!sq && sq.upgradeLevel < 2;
      }
      const b = gameState.buildings.find(x => x.buildingId === id.replace('card_building_', 'building_'));
      return !!b && b.upgradeLevel < 2;
    });
    if (affordable.length === 0) break;
    gameState.deployArmoryCard(affordable[0], placeAt(0, 5, 0.5, 2));
  }

  for (const sq of gameState.squads) sq.command = 'hold';
}

/** 夜间战术牌策略（跨口径同一策略）：
 * 火油桶砸近堡敌群质心（≥3 只）→ 血线吃紧时增援堵门 → 贴堡接敌开盾墙 → 敌群进弓程开齐射。
 * 战意是本策略的唯一夜内资源——不同残兵口径的战意收入差会直接体现在出牌量上，这正是要测的机制。 */
function nightTacticPolicy(): void {
  if (gameState.phase !== 'night' || gameState.tacticHand.length === 0) return;
  const enemies = gameState.enemies;
  if (enemies.length === 0) return;
  const distOf = (e: { position: { x: number; z: number } }) => Math.hypot(e.position.x, e.position.z);
  const near = enemies.filter(e => distOf(e) <= 8);
  const keepHPRatio = gameState.mainKeepHealth / 1000;

  for (let i = 0; i < gameState.tacticHand.length; i++) {
    const card = gameState.tacticHand[i];
    if (!gameState.canPlayTacticCard(card)) continue;
    const afford = gameState.canAffordWarSpirit(card.cost_night);
    if (!afford) continue;
    if (card.card_id === 'card_tactic_fire_oil') {
      if (near.length < 2) continue;
      const cx = near.reduce((s, e) => s + e.position.x, 0) / near.length;
      const cz = near.reduce((s, e) => s + e.position.z, 0) / near.length;
      if (gameState.playTacticCard(i, { x: cx, z: cz })) return;
    } else if (card.card_id === 'card_tactic_reinforce') {
      if (keepHPRatio >= 0.75 || !near.some(e => distOf(e) <= 6)) continue;
      const cx = near.reduce((s, e) => s + e.position.x, 0) / near.length;
      const cz = near.reduce((s, e) => s + e.position.z, 0) / near.length;
      const d = Math.hypot(cx, cz) || 1;
      if (gameState.playTacticCard(i, { x: (cx / d) * 3, z: (cz / d) * 3 })) return;
    } else if (card.card_id === 'card_tactic_shield_wall') {
      if (!near.some(e => distOf(e) <= 4)) continue;
      if (gameState.playTacticCard(i)) return;
    } else if (card.card_id === 'card_tactic_volley') {
      if (near.length < 2) continue;
      if (gameState.playTacticCard(i)) return;
    }
    // rally（集结号）低价值，不主动出
  }
}

/** 夜间微操（跨口径同一策略）：弓手站桩输出；近战班走向最近敌人拦截（钳制在距堡 2.5–8 环带，防脱防）。 */
function nightMicroPolicy(): void {
  const enemies = gameState.enemies;
  if (enemies.length === 0) return;
  for (const sq of gameState.squads) {
    if (sq.unitId === 'unit_archer') { sq.command = 'hold'; continue; }
    let nearest: { x: number; z: number } | null = null;
    let nd = Infinity;
    for (const e of enemies) {
      const d = Math.hypot(sq.position.x - e.position.x, sq.position.z - e.position.z);
      if (d < nd) { nd = d; nearest = { x: e.position.x, z: e.position.z }; }
    }
    if (!nearest) continue;
    let tx = nearest.x, tz = nearest.z;
    let r = Math.hypot(tx, tz);
    if (r < 1e-6) { r = 1; tx = 1; tz = 0; }
    if (r > 8) { tx = (tx / r) * 8; tz = (tz / r) * 8; }
    else if (r < 2.5) { tx = (tx / r) * 2.5; tz = (tz / r) * 2.5; }
    sq.command = 'move';
    sq.targetPosition = { x: tx, z: tz };
  }
}

/** 打一夜。返回 'win'（8 夜通关）/ 'loss' / 'continue'（进入次日白天）。 */
function playNight(): 'win' | 'loss' | 'continue' {
  gameState.startNight();
  while (gameState.phase === 'night_transition') gameState.update(0.2);
  let guard = 0;
  let tacticTick = 0;
  while (gameState.phase === 'night' && guard < 3000) { updateCombat(0.1); guard++; if (++tacticTick % 5 === 0) nightTacticPolicy(); if (tacticTick % 10 === 0) nightMicroPolicy(); }
  if (gameState.phase === 'game_over') return 'loss';
  if (gameState.phase !== 'night_settlement') return 'loss'; // 超时保护：按失守计
  if (gameState.victoryPending) { gameState.startNextDay(); return 'win'; }
  gameState.startNextDay();
  while (gameState.phase === 'day_transition') gameState.update(0.2);
  return 'continue';
}

/** 一整局（8 昼夜）。返回 { win, days }（days = 守到的天数）。 */
function playRun(mode: StragglerMode): { win: boolean; days: number } {
  gameState.stragglerMode = mode;
  gameState.resetGame();
  gameState.runCount = 2; // 非教学局
  gameState.dayCount = 1;
  gameState.phase = 'day';

  for (;;) {
    deployPolicy();
    const res = playNight();
    if (res === 'win') return { win: true, days: 8 };
    if (res === 'loss') {
      if (DEBUG) {
        console.log(`[debug] ${mode} 局失守: day=${gameState.dayCount} gold=${Math.round(gameState.gold)} keepHP=${Math.round(gameState.mainKeepHealth)} squads=${gameState.squads.length}(Lv: ${gameState.squads.map(s => s.upgradeLevel + 1).join(',')}) buildings=${gameState.buildings.length} damaged=[${gameState.damagedCamp.map(d => d.cardId + 'x' + d.count).join(';')}]`);
      }
      return { win: false, days: gameState.dayCount };
    }
    if (gameState.dayCount > 8) return { win: false, days: 8 }; // 安全阀
  }
}

// ===== 主循环（限时 + 可续跑）=====
let completed = 0;
let remaining = 0;
for (const { mode, runs } of MODES) remaining += runs;

for (const { mode, runs } of MODES) {
  for (let i = 0; i < runs; i++) {
    if (progress.has(`${mode}#${i}`)) continue; // 续跑：跳过已完成
    if ((Date.now() - startedAt) / 1000 > TIME_BUDGET_SECONDS) {
      report(true);
      process.exit(0);
    }
    const { win, days } = playRun(mode);
    record(mode, i, win, days);
    completed++;
  }
}

function report(partial: boolean): void {
  console.log(`\n===== 残兵口径胜率测试批${partial ? '（本轮部分完成，重跑续补）' : ''} =====`);
  console.log('口径说明：off=无残兵 / no_reward=纯填充零奖励 / single=1只全额 / half_reward=2只减半 / default=2只全额(v7现状)');
  console.log('策略：真实经济打法（3 单位+3 建筑落阵升级、夜间战术牌、近战拦截微操；随机化站位/采购时序）——跨口径同分布，相对比较有效\n');
  console.log('| 口径 | 局数 | 胜率 | 平均守到天数 |');
  console.log('| --- | --- | --- | --- |');
  for (const { mode } of MODES) {
    const agg = results.get(mode);
    if (!agg || agg.runs === 0) { console.log(`| ${mode} | 0/进行中 | — | — |`); continue; }
    const rate = ((agg.wins / agg.runs) * 100).toFixed(1);
    const avgDays = (agg.daysSum / agg.runs).toFixed(1);
    console.log(`| ${mode} | ${agg.runs} | ${rate}% | ${avgDays} |`);
  }
  console.log(`\n本轮新完成 ${completed} 局；剩余 ${Math.max(0, remaining - completed - (progress.size - countRecorded()))} 局`);
}

function countRecorded(): number {
  let n = 0;
  for (const { mode, runs } of MODES) {
    for (let i = 0; i < runs; i++) if (progress.has(`${mode}#${i}`)) n++;
  }
  return n;
}

report(false);
