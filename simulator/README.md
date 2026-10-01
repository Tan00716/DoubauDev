# EMBERHOLD Battle Simulator

Headless battle numerical simulator for **《烬堡 EMBERHOLD》** — a Node.js CLI tool that batch-simulates day/night combat cycles and outputs balance reports.

## Quick Start

```bash
# Install dependencies
npm install

# Run 100 simulations with baseline preset
npm run simulate -- --runs 100 --preset baseline

# Run 1000 simulations and save report
npm run simulate -- --runs 1000 --preset baseline --out report.json

# Compare multiple builds
npm run simulate -- --compare baseline,turtle,aggressive --runs 500

# Run tests
npm test
```

## CLI Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--runs` | `-r` | Number of simulation runs | `100` |
| `--preset` | `-p` | Build preset name | `baseline` |
| `--out` | `-o` | Output JSON file path | — |
| `--compare` | `-c` | Comma-separated presets to compare | — |
| `--seed` | `-s` | Random seed for reproducibility | — |
| `--help` | `-h` | Show help | — |

## Available Presets

- **`baseline`** — Balanced build: 2 shield + 2 archer + 1 pike, walls + arrow tower + barracks
- **`turtle`** — Fortification build: 1 shield + 1 pike, 3 walls + 2 arrow towers + barracks (Viera commander)
- **`aggressive`** — Army-heavy build: 3 shield + 2 pike + 1 archer, minimal defenses

## Data Files

The simulator uses a minimal dataset aligned with the design document JSON Schema:

```
src/data/
├── units.ts      # 3 units: shieldbearer, archer, pikeman
├── buildings.ts  # 3 buildings: wall, arrow_tower, barracks
├── enemies.ts    # 3 enemies: wolf_pack, shield_crusher, burrower
├── commanders.ts # 2 commanders: oen, veira
└── presets.ts    # Wave configurations per day (8 days)
```

To extend: add entries to the corresponding data files following the TypeScript interfaces in `src/types/index.ts`.

## Simplified Battle Model

The simulator uses an **analytical combat resolver** without spatial simulation:

- **No pathfinding** — enemies move linearly toward targets at fixed speed
- **No collision/avoidance** — units attack closest enemy in range
- **Aggregate DPS vs HP** — combat resolved in 0.5s time steps
- **Range abstraction** — archers/towers attack from distance; melee units engage at position 0

### Impact on Conclusions

| Aspect | Impact | Validity |
|--------|--------|----------|
| Build throughput comparison | ✅ Valid | Aggregate DPS differences are preserved |
| Economic balance | ✅ Valid | Income/upkeep formulas are exact |
| Win/loss rates | ⚠️ Directional | Tends to underrepresent micro-intensive builds |
| TTC/TTK metrics | ⚠️ Approximate | ±20% variance from spatial reality expected |
| AOE synergy chains | ❌ Underrepresented | 缆索塔+轰炮台 combos are linearized |
| Boss phase difficulty | ⚠️ Simplified | Rule rewrites approximated as stat modifiers |

**Recommendation**: Use simulator for macro balance (gold curves, capacity pressure, day-to-day attrition). Validate micro-heavy builds with manual playtests.

## Core Mechanisms Tested

Unit tests (`npm test`) cover:

1. **War Spirit Generation** — Contact-based generation, kill rewards, cap enforcement
2. **Night Settlement** — Spirit-to-gold conversion (50%), damaged camp transfer, wall repair
3. **Capacity Squeeze** — Military/work capacity enforcement, dropped repairs when capped
4. **Emergency Reinforcement** — 1.5× cost multiplier documented and applied

## Output Report Format

```json
{
  "batch_id": "batch_baseline_1696156800000",
  "preset_name": "baseline",
  "total_runs": 1000,
  "victory_rate": 0.42,
  "avg_days_survived": 5.3,
  "victory_rate_by_day": { "1": 0.95, "2": 0.88, ... },
  "defeat_reason_distribution": { "main_keep_destroyed": 580 },
  "avg_gold_curve": [500, 420, 380, ...],
  "avg_war_spirit_curve": [20, 35, 28, ...],
  "balance_flags": [
    { "type": "warning", "message": "Day 3 economic deficit risk", ... }
  ]
}
```

## Performance

- **1000 runs** completes in ~10-30 seconds on a 2-core sandbox
- Runs are single-threaded; parallelize by splitting seeds across processes

## Extending the Simulator

### Add a New Unit

1. Add entry to `src/data/units.ts`
2. Add unit card to preset initial squads if needed
3. Run tests: `npm test`

### Add a New Enemy

1. Add entry to `src/data/enemies.ts`
2. Add to wave configuration in `src/data/presets.ts`
3. Re-run batch simulations

### Add a New Preset

1. Add entry to `src/data/presets.ts`
2. Define initial squads, buildings, and wave composition
3. Run: `npm run simulate -- --preset mypreset --runs 1000`

## Architecture

```
src/
├── types/        # TypeScript interfaces (aligned with design doc schema)
├── data/         # JSON-like data definitions (units, buildings, enemies, presets)
├── core/         # Simulation engine + report generator
│   ├── engine.ts # Day/night cycle, combat resolution, settlement
│   └── reporter.ts # Statistics aggregation, balance flag detection
└── cli/
    └── simulate.ts # CLI entry point
```

## License

Internal tool for EMBERHOLD game development. Not for public distribution.
