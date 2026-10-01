#!/usr/bin/env node
/**
 * EMBERHOLD Simulator CLI Entry Point
 * Usage: npx tsx src/cli/simulate.ts --runs 1000 --preset baseline --out report.json
 */

import { parseArgs } from 'node:util';
import { writeFileSync } from 'node:fs';
import { runSingleSimulation } from '../core/engine.js';
import { generateBatchReport, generateComparisonReport, formatConsoleSummary } from '../core/reporter.js';
import type { BatchReport, ComparisonReport } from '../types/index.js';

interface CLIOptions {
  runs: number;
  preset: string;
  out?: string;
  compare?: string;
  seed?: number;
  help?: boolean;
}

function parseCLI(): CLIOptions {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      runs: { type: 'string', short: 'r', default: '100' },
      preset: { type: 'string', short: 'p', default: 'baseline' },
      out: { type: 'string', short: 'o' },
      compare: { type: 'string', short: 'c' },
      seed: { type: 'string', short: 's' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  return {
    runs: parseInt(values.runs as string, 10),
    preset: values.preset as string,
    out: values.out as string | undefined,
    compare: values.compare as string | undefined,
    seed: values.seed ? parseInt(values.seed as string, 10) : undefined,
    help: values.help as boolean | undefined,
  };
}

function showHelp(): void {
  console.log(`
EMBERHOLD Battle Simulator

Usage: npx tsx src/cli/simulate.ts [options]

Options:
  -r, --runs <number>     Number of simulation runs (default: 100)
  -p, --preset <name>     Preset build name (default: baseline)
                          Available: baseline, turtle, aggressive
  -o, --out <path>        Output JSON report file path
  -c, --compare <names>   Comma-separated preset names for comparison
  -s, --seed <number>     Random seed for reproducibility
  -h, --help              Show this help message

Examples:
  npx tsx src/cli/simulate.ts --runs 1000 --preset baseline
  npx tsx src/cli/simulate.ts --runs 500 --preset turtle --out turtle_report.json
  npx tsx src/cli/simulate.ts --compare baseline,turtle,aggressive --runs 200
`);
}

function runBatch(presetName: string, runs: number, seedBase: number): BatchReport {
  console.log(`\n▶ Running ${runs} simulations for preset "${presetName}"...`);
  const startTime = Date.now();

  const singleReports = [];
  for (let i = 0; i < runs; i++) {
    const report = runSingleSimulation(presetName, i, seedBase + i);
    singleReports.push(report);
  }

  const batchReport = generateBatchReport(presetName, singleReports, `batch_${presetName}_${Date.now()}`);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`  ✓ Completed in ${elapsed}s (${(runs / parseFloat(elapsed)).toFixed(0)} runs/sec)`);

  return batchReport;
}

async function main(): Promise<void> {
  const options = parseCLI();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  if (options.runs < 1 || options.runs > 100000) {
    console.error('Error: runs must be between 1 and 100000');
    process.exit(1);
  }

  const seedBase = options.seed ?? Date.now();
  console.log(`\n🔥 EMBERHOLD Battle Simulator v1.0`);
  console.log(`   Seed: ${seedBase}`);

  let output: BatchReport | ComparisonReport;

  if (options.compare) {
    // Comparison mode
    const presetNames = options.compare.split(',').map(s => s.trim());
    const batchReports = presetNames.map(name => runBatch(name, options.runs, seedBase));
    output = generateComparisonReport(batchReports);

    console.log(`\n${'='.repeat(64)}`);
    console.log('CROSS-BUILD COMPARISON');
    console.log(`${'='.repeat(64)}`);
    for (const br of batchReports) {
      console.log(formatConsoleSummary(br));
    }
    if (output.cross_flags.length > 0) {
      console.log('\nCross-Build Balance Flags:');
      output.cross_flags.forEach(f => console.log(`  [${f.type.toUpperCase()}] ${f.message}`));
    }
  } else {
    // Single preset mode
    const batchReport = runBatch(options.preset, options.runs, seedBase);
    output = batchReport;

    console.log(`\n${formatConsoleSummary(batchReport)}`);

    // Print balance observations
    console.log(`\n📊 Balance Observations:`);
    const vr = batchReport.victory_rate;
    console.log(`   1. 整体胜率 ${(vr * 100).toFixed(1)}% — ${vr < 0.3 ? '偏难，新手挫败风险高' : vr > 0.7 ? '偏易，挑战性不足' : '处于合理区间'}`);

    const day3Gold = batchReport.avg_gold_curve[3];
    if (day3Gold !== undefined) {
      const deficitRate = batchReport.runs.filter(r => (r.gold_curve[3] ?? 0) < 50).length / batchReport.runs.length;
      console.log(`   2. 第3夜经济赤字概率 ${(deficitRate * 100).toFixed(1)}% — ${deficitRate > 0.3 ? '中期经济压力偏高' : '现金流健康'}`);
    }

    const day6Rate = batchReport.victory_rate_by_day[6];
    if (day6Rate !== undefined) {
      console.log(`   3. 领主夜(第6夜)存活率 ${(day6Rate * 100).toFixed(1)}% — ${day6Rate < 0.4 ? '精英夜门槛显著' : '难度曲线平缓'}`);
    }

    const avgCasualties = batchReport.runs.reduce((sum, r) => sum + r.total_casualties, 0) / batchReport.runs.length;
    console.log(`   4. 平均每局阵亡 ${avgCasualties.toFixed(1)} 个班 — ${avgCasualties > 5 ? '消耗战特征明显' : '兵力保存较好'}`);
  }

  // Write output file if requested
  if (options.out) {
    writeFileSync(options.out, JSON.stringify(output, null, 2));
    console.log(`\n💾 Report saved to: ${options.out}`);
  }

  console.log('\n✨ Simulation complete.\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
