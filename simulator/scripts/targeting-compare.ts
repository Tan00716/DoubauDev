/**
 * 一维 vs 2D 保真度对照实验。
 *
 * 发现：敌人接敌即停 → 串行布阵（半径间隔 1.0）时，敌永远停在第一个班的接敌边界，
 * 只有该班 + 远程弓手能打到敌人（前排近战 DPS 缺席 + 单班独扛伤害）——严格难于 game 2D。
 *
 * 三配置：
 *  A serial+nearest   ：现状（1D 保守下界）
 *  B colocated+nearest：共址布阵但敌仍集火单班（最坏）
 *  C colocated+spread ：共址 + 随机分散承伤（近似 2D 并肩布阵，上界估计）
 */
import { runSingleSimulation } from '../src/core/engine';
import { PRESETS } from '../src/data/presets';

const RUNS = 200;
const SEED_BASE = 20261001;
const presets = ['baseline', 'turtle', 'aggressive'];
const originalRadii: Record<string, number[]> = {};
for (const p of presets) originalRadii[p] = [...PRESETS[p].layout.front_squad_radii];

type Mode = 'serial' | 'colocated';
function setLayout(mode: Mode) {
  for (const p of presets) {
    PRESETS[p].layout.front_squad_radii = mode === 'serial'
      ? [...originalRadii[p]]
      : originalRadii[p].map(() => originalRadii[p][0]); // 全部共址于最外层
  }
}

for (const [layout, targeting] of [['serial', 'nearest'], ['colocated', 'nearest'], ['colocated', 'spread']] as const) {
  setLayout(layout as Mode);
  console.log(`\n=== ${layout}+${targeting} (${RUNS} runs/preset) ===`);
  for (const p of presets) {
    let wins = 0;
    const dayHist = new Map<number, number>();
    for (let i = 0; i < RUNS; i++) {
      const r = runSingleSimulation(p, i, SEED_BASE + i, 'current', targeting);
      if (r.victory) wins++;
      dayHist.set(r.days_survived, (dayHist.get(r.days_survived) ?? 0) + 1);
    }
    const wr = (wins / RUNS * 100).toFixed(1);
    const days = [...dayHist.entries()].sort((a, b) => a[0] - b[0]).map(([d, c]) => `d${d}:${c}`).join(' ');
    console.log(`${p.padEnd(11)} win=${wr}%  ${days}`);
  }
}
setLayout('serial'); // 还原
