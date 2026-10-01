/**
 * EMBERHOLD 战斗数值模拟器 CLI v2
 *
 * 用法：
 *   npm run simulate -- [--preset baseline|turtle|aggressive|all] [--runs 1000] [--seed 20261001]
 *                      [--variant current] | [--variants current,dense_1_5x,...]
 *                      [--out ./reports] [--no-json]
 *
 * 示例：
 *   npm run simulate -- --preset all --runs 1000                # 三 preset × current 新基线
 *   npm run simulate -- --preset baseline --variants dense_1_5x,dense_2x,rebalanced --runs 1000
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runSingleSimulation } from '../core/engine.js';
import { generateBatchReport, generateComparisonReport, formatConsoleSummary } from '../core/reporter.js';
import { PRESETS } from '../data/presets.js';
import { DIFFICULTY_VARIANTS } from '../data/waves.js';
import type { BatchReport } from '../types/index.js';

interface Args {
  presets: string[];
  runs: number;
  seed: number;
  variants: string[];
  out: string;
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { presets: ['all'], runs: 1000, seed: 20261001, variants: ['current'], out: './reports', json: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`缺少参数值: ${a}`);
      return v;
    };
    switch (a) {
      case '--preset': args.presets = next().split(',').map(s => s.trim()); break;
      case '--runs': args.runs = Math.max(1, parseInt(next(), 10) || 1000); break;
      case '--seed': args.seed = parseInt(next(), 10) || 20261001; break;
      case '--variant': args.variants = [next()]; break;
      case '--variants': args.variants = next().split(',').map(s => s.trim()); break;
      case '--out': args.out = next(); break;
      case '--no-json': args.json = false; break;
      case '--help': case '-h':
        console.log('用法见文件头注释');
        process.exit(0);
        break;
      default:
        throw new Error(`未知参数: ${a}（--help 查看用法）`);
    }
  }
  if (args.presets.includes('all')) args.presets = Object.keys(PRESETS);
  for (const p of args.presets) {
    if (!PRESETS[p]) throw new Error(`未知 preset: ${p}（可选: ${Object.keys(PRESETS).join(', ')}）`);
  }
  for (const v of args.variants) {
    if (!DIFFICULTY_VARIANTS[v]) throw new Error(`未知 variant: ${v}（可选: ${Object.keys(DIFFICULTY_VARIANTS).join(', ')}）`);
  }
  return args;
}

function runBatch(presetName: string, variantName: string, runs: number, seedBase: number): BatchReport {
  const results = [];
  for (let i = 0; i < runs; i++) {
    results.push(runSingleSimulation(presetName, i, seedBase + i, variantName));
  }
  return generateBatchReport(presetName, results, `${presetName}@${variantName}`, variantName);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const started = Date.now();
  const batches: BatchReport[] = [];

  for (const variant of args.variants) {
    for (const preset of args.presets) {
      const t0 = Date.now();
      const report = runBatch(preset, variant, args.runs, args.seed);
      batches.push(report);
      console.log(formatConsoleSummary(report));
      console.log(`  （${args.runs} 局，耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s）\n`);
    }
  }

  if (batches.length > 1) {
    const cmp = generateComparisonReport(batches);
    if (cmp.cross_flags.length > 0) {
      console.log('▶ 跨 Build/变体对比标记:');
      for (const f of cmp.cross_flags) console.log(`  [${f.type === 'error' ? '✗' : f.type === 'warning' ? '!' : 'ℹ'}] ${f.message}`);
      console.log('');
    }
    if (args.json) {
      const outDir = resolve(args.out);
      mkdirSync(outDir, { recursive: true });
      const cmpPath = resolve(outDir, `comparison_seed${args.seed}.json`);
      writeFileSync(cmpPath, JSON.stringify({ ...cmp, batch_reports: cmp.batch_reports.map(b => ({ ...b, runs: b.runs.length })) }, null, 2));
      console.log(`对比摘要已写入 ${cmpPath}`);
    }
  }

  if (args.json) {
    const outDir = resolve(args.out);
    mkdirSync(outDir, { recursive: true });
    for (const b of batches) {
      const path = resolve(outDir, `${b.preset_name}@${b.variant_name}_seed${args.seed}.json`);
      writeFileSync(path, JSON.stringify(b, null, 2));
    }
    console.log(`完整报表（含 ${batches.length} 份、每份 ${args.runs} 局明细）已写入 ${resolve(args.out)}/`);
  }

  console.log(`\n总耗时 ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main();
