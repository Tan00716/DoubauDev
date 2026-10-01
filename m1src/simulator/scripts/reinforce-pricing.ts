/**
 * 增援牌定价三方案验证（供产品终裁）。
 * 对照：敌伤 ×0.6（ease_dmg_0_6）+ 增援入池 15 战意宽松使用。
 * 方案：A 降价（10/8）· B1 应急班 HP180 · B2 入场 6s 盾墙 · C 夜末存活返还 50%。
 * 判定标准：宽松使用不再显著掉胜率、牌从陷阱变可选。
 */
import { runSingleSimulation } from '../src/core/engine';

const RUNS = 1000, SEED = 20261001;
const presets = ['baseline', 'turtle', 'aggressive'];

const CONFIGS: [string, boolean, Record<string, unknown> | undefined][] = [
  ['基准(不入池)', false, undefined],
  ['对照(15意宽松)', true, {}],
  ['A 降价10意', true, { reinforceCost: 10 }],
  ['A 降价8意', true, { reinforceCost: 8 }],
  ['B1 HP180', true, { reinforceHP: 180 }],
  ['B2 入场盾墙6s', true, { reinforceShieldOnEntry: 6 }],
  ['C 夜末返还50%', true, { reinforceRefundOnSurvive: true }],
];

interface Acc {
  wins: number;
  plays: number; gamesUsed: number;
  nightHist: number[]; // 1..8
  reasons: Record<string, number>;
  refunds: number;
  daysSum: number;
}
const acc: Record<string, Record<string, Acc>> = {};

for (const [name, inPool, opt] of CONFIGS) {
  acc[name] = {};
  for (const p of presets) {
    const a: Acc = { wins: 0, plays: 0, gamesUsed: 0, nightHist: new Array(9).fill(0), reasons: {}, refunds: 0, daysSum: 0 };
    for (let i = 0; i < RUNS; i++) {
      const r = runSingleSimulation(p, i, SEED + i, 'ease_dmg_0_6', 'nearest',
        inPool ? { includeReinforce: true, ...(opt ?? {}) } : undefined);
      if (r.victory) a.wins++;
      a.daysSum += r.days_survived;
      const plays = r.reinforce_plays ?? [];
      a.plays += plays.length;
      if (plays.length > 0) a.gamesUsed++;
      for (const pl of plays) {
        a.nightHist[pl.night]++;
        a.reasons[pl.reason] = (a.reasons[pl.reason] ?? 0) + 1;
      }
      a.refunds += r.reinforce_refunds ?? 0;
    }
    acc[name][p] = a;
  }
  const line = presets.map(p => {
    const a = acc[name][p];
    return `${p}=${(a.wins / RUNS * 100).toFixed(1)}%`;
  }).join('  ');
  console.log(`${name.padEnd(14)} ${line}`);
}

// 明细表
console.log('\n==== 明细（每格：胜率 | 局均使用 | 使用局占比 | 返还/打出）====');
for (const [name] of CONFIGS) {
  console.log(`\n[${name}]`);
  for (const p of presets) {
    const a = acc[name][p];
    const useRate = a.plays / RUNS;
    const gamesPct = (a.gamesUsed / RUNS * 100).toFixed(0);
    const refundPct = a.plays > 0 ? (a.refunds / a.plays * 100).toFixed(1) : '-';
    console.log(`  ${p.padEnd(11)} 胜率=${(a.wins / RUNS * 100).toFixed(1).padStart(5)}%  局均打出=${useRate.toFixed(2)}  使用局占比=${gamesPct}%  返还率=${refundPct}%  平均存活=${(a.daysSum / RUNS).toFixed(1)}昼`);
  }
}

// 使用时机分布（合并三 preset）
console.log('\n==== 使用时机分布（合并 preset，按夜）====');
for (const [name] of CONFIGS.slice(1)) {
  const nights = new Array(9).fill(0);
  let total = 0;
  for (const p of presets) { for (let n = 1; n <= 8; n++) { nights[n] += acc[name][p].nightHist[n]; total += acc[name][p].nightHist[n]; } }
  if (total === 0) { console.log(`${name.padEnd(14)} 无使用`); continue; }
  const dist = nights.map((c, n) => n >= 1 && n <= 8 ? `N${n}:${(c / total * 100).toFixed(0)}%` : '').filter(Boolean).join(' ');
  console.log(`${name.padEnd(14)} 总打出=${total}  ${dist}`);
}
// 触发原因分布（合并）
console.log('\n==== 触发原因（crisis=前排残血 / gap=防线缺口 / both）====');
for (const [name] of CONFIGS.slice(1)) {
  const rs: Record<string, number> = {};
  for (const p of presets) for (const [k, v] of Object.entries(acc[name][p].reasons)) rs[k] = (rs[k] ?? 0) + v;
  const total = Object.values(rs).reduce((a, b) => a + b, 0);
  if (total === 0) { console.log(`${name.padEnd(14)} 无使用`); continue; }
  console.log(`${name.padEnd(14)} ` + Object.entries(rs).map(([k, v]) => `${k}:${(v / total * 100).toFixed(0)}%`).join(' '));
}
