import { gameState, type GamePhase, type SquadEntity, type WavePreview, TOTAL_WAVES } from '../gameplay/game-state';
import { eventBus } from '../core/event-bus';
import { getUnitData, getBuildingData, getCardData, getEnemyData, COMMANDER, ARMORY_CARDS, TACTIC_CARDS } from '../content/data';
import type { GameRenderer } from '../renderer/scene';

export class GameUI {
  private uiLayer: HTMLElement;
  private renderer: GameRenderer;
  private menuScreen: HTMLElement | null = null;
  private hudScreen: HTMLElement | null = null;
  private gameOverScreen: HTMLElement | null = null;
  private settlementScreen: HTMLElement | null = null;

  constructor(renderer: GameRenderer) {
    this.uiLayer = document.getElementById('ui-layer')!;
    this.renderer = renderer;
    this.createStyles();
    this.showMenu();

    eventBus.on('phase-change', ({ phase }) => this.onPhaseChange(phase));
    eventBus.on('game-over', ({ victory, day }) => this.showGameOver(victory, day));
    eventBus.on('gold-changed', () => this.updateResources());
    eventBus.on('war-spirit-changed', () => this.updateResources());
    eventBus.on('squad-selected', () => this.updateSquadPanel());
    eventBus.on('card-played', () => this.updateTacticHand());
    eventBus.on('building-placed', () => this.updateArmoryDeck());
    eventBus.on('enemy-spawned', () => this.updateEnemyCount());
    eventBus.on('entity-destroyed', () => this.updateEnemyCount());
    eventBus.on('entity-upgraded', ({ kind, level }) => this.showInfo(`⬆️ 升级成功：${kind === 'squad' ? '班组' : '建筑'} 提升至 Lv${level + 1}，规模 +50%`));
    eventBus.on('damaged-camp-changed', () => {
      this.updateDamagedCampPanel();
      this.updateArmoryDeck();
    });
    eventBus.on('wave-preview', (preview: WavePreview) => this.showWavePreview(preview));
  }

  private createStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      .eh-menu { display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; height:100%; background:linear-gradient(180deg,#1a1a2e 0%,#16213e 100%); }
      .eh-title { font-size:48px; font-weight:bold; color:#e74c3c; margin-bottom:10px; text-shadow:0 0 20px rgba(231,76,60,0.5); }
      .eh-subtitle { font-size:18px; color:#aaa; margin-bottom:40px; }
      .eh-btn { padding:14px 40px; font-size:18px; border:none; border-radius:8px; cursor:pointer; margin:8px; transition:all 0.2s; font-family:inherit; }
      .eh-btn-primary { background:#e74c3c; color:#fff; }
      .eh-btn-primary:hover { background:#c0392b; transform:scale(1.05); }
      .eh-btn-secondary { background:#34495e; color:#fff; }
      .eh-btn-secondary:hover { background:#2c3e50; }
      .eh-hud { position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; }
      .eh-hud > * { pointer-events:auto; }
      .eh-top-bar { display:flex; justify-content:space-between; align-items:center; padding:10px 20px; background:rgba(0,0,0,0.6); }
      .eh-resource { display:flex; align-items:center; gap:6px; font-size:16px; font-weight:bold; }
      .eh-resource-gold { color:#f1c40f; }
      .eh-resource-war { color:#e74c3c; }
      .eh-phase-badge { padding:6px 16px; border-radius:20px; font-size:14px; font-weight:bold; }
      .eh-phase-day { background:#f39c12; color:#000; }
      .eh-phase-night { background:#2c3e50; color:#fff; border:1px solid #e74c3c; }
      .eh-bottom-panel { position:absolute; bottom:0; left:0; right:0; display:flex; justify-content:center; align-items:flex-end; gap:10px; padding:10px; background:linear-gradient(0deg,rgba(0,0,0,0.8) 0%,transparent 100%); }
      .eh-card { width:100px; height:140px; background:#2c3e50; border:2px solid #555; border-radius:8px; cursor:pointer; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:6px; transition:all 0.2s; position:relative; }
      .eh-card:hover { transform:translateY(-8px); border-color:#f1c40f; }
      .eh-card-selected { border-color:#e74c3c; box-shadow:0 0 10px rgba(231,76,60,0.5); }
      .eh-card-name { font-size:12px; font-weight:bold; text-align:center; color:#fff; }
      .eh-card-cost { position:absolute; top:4px; right:4px; background:#000; color:#f1c40f; padding:2px 6px; border-radius:4px; font-size:12px; font-weight:bold; }
      .eh-card-desc { font-size:10px; color:#aaa; text-align:center; margin-top:4px; }
      .eh-card-layer { position:absolute; top:4px; left:4px; font-size:9px; padding:1px 4px; border-radius:3px; }
      .eh-layer-armory { background:#3498db; color:#fff; }
      .eh-layer-tactic { background:#9b59b6; color:#fff; }
      .eh-action-bar { position:absolute; right:10px; top:50%; transform:translateY(-50%); display:flex; flex-direction:column; gap:8px; }
      .eh-action-btn { width:56px; height:56px; border-radius:50%; border:2px solid #555; background:#2c3e50; color:#fff; font-size:11px; cursor:pointer; display:flex; align-items:center; justify-content:center; text-align:center; transition:all 0.2s; }
      .eh-action-btn:hover { border-color:#f1c40f; transform:scale(1.1); }
      .eh-action-btn:disabled { opacity:0.4; cursor:not-allowed; }
      .eh-squad-panel { position:absolute; left:10px; top:50%; transform:translateY(-50%); background:rgba(0,0,0,0.7); padding:12px; border-radius:8px; min-width:140px; }
      .eh-squad-name { font-size:14px; font-weight:bold; color:#fff; margin-bottom:6px; }
      .eh-squad-hp { font-size:12px; color:#2ecc71; margin-bottom:8px; }
      .eh-squad-btn { display:block; width:100%; padding:6px; margin:3px 0; font-size:12px; border:none; border-radius:4px; cursor:pointer; background:#34495e; color:#fff; }
      .eh-squad-btn:hover { background:#4a6278; }
      .eh-gameover { display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; height:100%; background:rgba(0,0,0,0.85); }
      .eh-gameover-title { font-size:42px; font-weight:bold; margin-bottom:20px; }
      .eh-gameover-win { color:#2ecc71; }
      .eh-gameover-loss { color:#e74c3c; }
      .eh-settlement { display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; height:100%; background:rgba(0,0,0,0.85); }
      .eh-settlement-title { font-size:32px; color:#f1c40f; margin-bottom:20px; }
      .eh-stat-row { font-size:16px; color:#ddd; margin:4px 0; }
      .eh-enemy-counter { position:absolute; top:50px; right:20px; background:rgba(0,0,0,0.6); padding:6px 12px; border-radius:6px; font-size:14px; color:#e74c3c; }
      .eh-keep-hp { position:absolute; top:50px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.6); padding:6px 16px; border-radius:6px; font-size:14px; }
      .eh-keep-hp-bar { width:120px; height:8px; background:#333; border-radius:4px; margin-top:4px; overflow:hidden; }
      .eh-keep-hp-fill { height:100%; background:linear-gradient(90deg,#e74c3c,#f1c40f); transition:width 0.3s; }
      .eh-info-text { position:absolute; bottom:160px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.7); padding:8px 16px; border-radius:6px; font-size:14px; color:#f1c40f; }
      .eh-zoom-controls { position:absolute; bottom:10px; left:10px; display:flex; gap:4px; }
      .eh-zoom-btn { width:32px; height:32px; border-radius:4px; border:1px solid #555; background:#2c3e50; color:#fff; cursor:pointer; font-size:16px; }
      .eh-zoom-btn:hover { background:#4a6278; }
      .eh-damaged-panel { position:absolute; top:110px; left:20px; background:rgba(0,0,0,0.75); border:1px solid #e67e22; border-radius:8px; padding:10px; min-width:200px; }
      .eh-damaged-title { font-size:14px; font-weight:bold; color:#e67e22; margin-bottom:6px; }
      .eh-damaged-row { display:flex; justify-content:space-between; align-items:center; gap:10px; font-size:12px; color:#ddd; margin:4px 0; }
      .eh-repair-btn { padding:4px 8px; font-size:11px; border:none; border-radius:4px; cursor:pointer; background:#e67e22; color:#fff; }
      .eh-repair-btn:hover { background:#d35400; }
      .eh-card-lv { position:absolute; bottom:4px; left:4px; background:#f1c40f; color:#000; padding:1px 5px; border-radius:3px; font-size:10px; font-weight:bold; }
      .eh-card-damaged { position:absolute; bottom:4px; right:4px; background:#e74c3c; color:#fff; padding:1px 5px; border-radius:3px; font-size:10px; font-weight:bold; }
      .eh-card-recalled { position:absolute; bottom:4px; right:4px; background:#27ae60; color:#fff; padding:1px 5px; border-radius:3px; font-size:10px; font-weight:bold; }
      .eh-card-dim { filter:grayscale(0.8) brightness(0.7); }
      .eh-wave-banner { position:absolute; top:100px; left:50%; transform:translateX(-50%); background:rgba(231,76,60,0.85); color:#fff; padding:8px 20px; border-radius:6px; font-size:14px; font-weight:bold; }
    `;
    document.head.appendChild(style);
  }

  private clearUI(): void {
    this.uiLayer.innerHTML = '';
    this.menuScreen = null;
    this.hudScreen = null;
    this.gameOverScreen = null;
    this.settlementScreen = null;
  }

  private showMenu(): void {
    this.clearUI();
    const menu = document.createElement('div');
    menu.className = 'eh-menu';
    menu.innerHTML = `
      <div class="eh-title">烬堡 EMBERHOLD</div>
      <div class="eh-subtitle">M1 垂直切片 — 你的城堡，就是你的卡组</div>
      <button class="eh-btn eh-btn-primary" id="btn-start">开始新游戏</button>
      <button class="eh-btn eh-btn-secondary" id="btn-help">操作说明</button>
    `;
    this.uiLayer.appendChild(menu);
    this.menuScreen = menu;

    document.getElementById('btn-start')!.onclick = () => {
      gameState.startGame();
      this.showHUD();
    };

    document.getElementById('btn-help')!.onclick = () => {
      alert('操作说明：\n\n白天阶段：\n- 点击手牌选择建筑/单位卡，再点击地图放置\n- 点击已放置的班选中，再点击地图移动\n- 点击「入夜」进入夜间防守\n\n夜间阶段：\n- 敌人会从地图边缘进攻\n- 点击战术手牌，再点击地图释放效果\n- 选中己方班后可下达指令\n- 点击「终章」释放指挥官终极技\n\n目标：守住主堡炉火，击败所有进攻的敌人！');
    };
  }

  private showHUD(): void {
    this.clearUI();
    const hud = document.createElement('div');
    hud.className = 'eh-hud';
    hud.innerHTML = `
      <div class="eh-top-bar">
        <div style="display:flex;gap:20px;">
          <div class="eh-resource eh-resource-gold">
            <span>💰</span> <span id="res-gold">${gameState.gold}</span>
          </div>
          <div class="eh-resource eh-resource-war">
            <span>🔥</span> <span id="res-war">${gameState.warSpirit}</span> / ${gameState.warSpiritMax}
          </div>
          <div class="eh-resource" style="color:#3498db;">
            <span>⚔️</span> <span id="res-mil">${gameState.militaryUsed}</span> / ${gameState.militaryCapacity}
          </div>
          <div class="eh-resource" style="color:#95a5a6;">
            <span>🏗️</span> <span id="res-work">${gameState.workUsed}</span> / ${gameState.workCapacity}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:15px;">
          <div class="eh-phase-badge eh-phase-day" id="phase-badge">白天 · 第 ${gameState.dayCount} 天</div>
          <div style="font-size:14px;color:#aaa;">第 <span id="day-count">${gameState.dayCount}</span> 天</div>
        </div>
      </div>
      <div class="eh-keep-hp">
        <div>🏰 主堡耐久</div>
        <div class="eh-keep-hp-bar"><div class="eh-keep-hp-fill" id="keep-hp-fill" style="width:100%"></div></div>
        <div style="font-size:12px;margin-top:2px;"><span id="keep-hp">${gameState.mainKeepHealth}</span> / ${gameState.mainKeepMaxHealth}</div>
      </div>
      <div class="eh-enemy-counter" id="enemy-counter" style="display:none;">敌人: 0</div>
      <div class="eh-info-text" id="info-text" style="display:none;"></div>
      <div class="eh-squad-panel" id="squad-panel" style="display:none;">
        <div class="eh-squad-name" id="sq-name"></div>
        <div class="eh-squad-hp" id="sq-hp"></div>
        <button class="eh-squad-btn" id="sq-hold">🛡️ 驻守</button>
        <button class="eh-squad-btn" id="sq-retreat">🏃 撤退</button>
        <button class="eh-squad-btn" id="sq-focus">🎯 集火</button>
      </div>
      <div class="eh-action-bar" id="action-bar">
        <button class="eh-action-btn" id="btn-night" style="display:none;">🌙<br>入夜</button>
        <button class="eh-action-btn" id="btn-ultimate" style="display:none;">⚡<br>终章</button>
        <button class="eh-action-btn" id="btn-settle" style="display:none;">☀️<br>天亮</button>
      </div>
      <div class="eh-bottom-panel" id="bottom-panel"></div>
      <div class="eh-zoom-controls">
        <button class="eh-zoom-btn" id="zoom-in">+</button>
        <button class="eh-zoom-btn" id="zoom-out">−</button>
      </div>
    `;
    this.uiLayer.appendChild(hud);
    this.hudScreen = hud;

    this.setupHUDEvents();
    this.updateArmoryDeck();
    this.updateResources();
  }

  private setupHUDEvents(): void {
    document.getElementById('btn-night')!.onclick = () => gameState.startNight();
    document.getElementById('btn-ultimate')!.onclick = () => {
      if (gameState.useCommanderUltimate()) {
        this.showInfo('终章已释放！抽3张战术牌！');
        this.updateTacticHand();
      }
    };
    document.getElementById('btn-settle')!.onclick = () => gameState.startNextDay();

    document.getElementById('sq-hold')!.onclick = () => gameState.issueSquadCommand('hold');
    document.getElementById('sq-retreat')!.onclick = () => gameState.issueSquadCommand('retreat');
    document.getElementById('sq-focus')!.onclick = () => gameState.issueSquadCommand('focus');

    document.getElementById('zoom-in')!.onclick = () => {
      // S6：通过构造注入的 renderer 访问，不再依赖 window 全局
      this.renderer.setZoom(gameState.cameraZoom - 0.2);
    };
    document.getElementById('zoom-out')!.onclick = () => {
      this.renderer.setZoom(gameState.cameraZoom + 0.2);
    };
  }

  private onPhaseChange(phase: GamePhase): void {
    const badge = document.getElementById('phase-badge');
    const btnNight = document.getElementById('btn-night');
    const btnUlt = document.getElementById('btn-ultimate');
    const btnSettle = document.getElementById('btn-settle');
    const enemyCounter = document.getElementById('enemy-counter');
    const bottomPanel = document.getElementById('bottom-panel');

    if (phase === 'day') {
      badge!.textContent = `白天 · 第 ${gameState.dayCount} 天`;
      badge!.className = 'eh-phase-badge eh-phase-day';
      btnNight!.style.display = 'block';
      btnUlt!.style.display = 'none';
      btnSettle!.style.display = 'none';
      enemyCounter!.style.display = 'none';
      this.updateArmoryDeck();
      this.updateDamagedCampPanel();
    } else if (phase === 'night') {
      badge!.textContent = `🌙 夜间 · 第 ${gameState.dayCount} 天`;
      badge!.className = 'eh-phase-badge eh-phase-night';
      btnNight!.style.display = 'none';
      btnUlt!.style.display = 'block';
      btnSettle!.style.display = 'none';
      enemyCounter!.style.display = 'block';
      this.updateTacticHand();
    } else if (phase === 'night_settlement') {
      this.showSettlement();
    } else if (phase === 'night_transition') {
      this.showInfo('夜幕降临... 敌人正在接近');
      if (bottomPanel) bottomPanel.innerHTML = '';
    } else if (phase === 'day_transition') {
      this.showInfo('天亮了...');
    }
  }

  private updateArmoryDeck(): void {
    const panel = document.getElementById('bottom-panel');
    if (!panel || gameState.phase !== 'day') return;

    let html = '';
    for (const card of gameState.armoryDeck) {
      const isSelected = gameState.placementCardId === card.card_id;
      const costText = card.cost_day > 0 ? `${card.cost_day}金` : '免费';
      // I3：卡面等级 / 受损 / 已修复状态徽标
      const lvl = card.upgrade_level ?? 0;
      const lvBadge = lvl > 0 ? `<div class="eh-card-lv">Lv${lvl + 1}</div>` : '';
      const damaged = gameState.damagedCamp.find(d => d.cardId === card.card_id);
      const damagedBadge = damaged ? `<div class="eh-card-damaged">受损×${damaged.count}</div>` : '';
      const recalled = !damaged && gameState.recalledCards.has(card.card_id)
        ? '<div class="eh-card-recalled">已修复·半血</div>' : '';
      const dimClass = damaged ? 'eh-card-dim' : '';
      html += `
        <div class="eh-card ${isSelected ? 'eh-card-selected' : ''} ${dimClass}" data-card="${card.card_id}">
          <div class="eh-card-layer eh-layer-armory">军械</div>
          <div class="eh-card-cost">${costText}</div>
          <div class="eh-card-name">${card.card_name}</div>
          <div class="eh-card-desc">${card.effect_description}</div>
          ${lvBadge}${damagedBadge}${recalled}
        </div>
      `;
    }
    panel.innerHTML = html;

    // Add click handlers
    for (const el of Array.from(panel.querySelectorAll('.eh-card'))) {
      el.addEventListener('click', () => {
        const cardId = (el as HTMLElement).dataset.card!;
        if (gameState.placementCardId === cardId) {
          gameState.placementCardId = null;
        } else {
          gameState.placementCardId = cardId;
        }
        this.updateArmoryDeck();
      });
    }
  }

  private updateTacticHand(): void {
    const panel = document.getElementById('bottom-panel');
    if (!panel || gameState.phase !== 'night') return;

    let html = '';
    for (let i = 0; i < gameState.tacticHand.length; i++) {
      const card = gameState.tacticHand[i];
      const isSelected = gameState.hoveredCardIndex === i;
      const cost = gameState.firstTacticFree && i === 0 ? 0 : card.cost_night;
      html += `
        <div class="eh-card ${isSelected ? 'eh-card-selected' : ''}" data-index="${i}">
          <div class="eh-card-layer eh-layer-tactic">战术</div>
          <div class="eh-card-cost">${cost}意</div>
          <div class="eh-card-name">${card.card_name}</div>
          <div class="eh-card-desc">${card.effect_description}</div>
        </div>
      `;
    }
    panel.innerHTML = html;

    for (const el of Array.from(panel.querySelectorAll('.eh-card'))) {
      el.addEventListener('click', () => {
        const idx = parseInt((el as HTMLElement).dataset.index!);
        if (gameState.hoveredCardIndex === idx) {
          // Play the card
          const card = gameState.tacticHand[idx];
          if (card.target_type === 'global') {
            gameState.playTacticCard(idx);
            gameState.hoveredCardIndex = -1;
          } else if (card.target_type === 'terrain') {
            // Keep selected, wait for map click
            this.showInfo(`点击地图释放 ${card.card_name}`);
          }
        } else {
          gameState.hoveredCardIndex = idx;
        }
        this.updateTacticHand();
      });
    }
  }

  private updateResources(): void {
    const goldEl = document.getElementById('res-gold');
    const warEl = document.getElementById('res-war');
    const milEl = document.getElementById('res-mil');
    const workEl = document.getElementById('res-work');
    const keepHp = document.getElementById('keep-hp');
    const keepFill = document.getElementById('keep-hp-fill');

    if (goldEl) goldEl.textContent = String(gameState.gold);
    if (warEl) warEl.textContent = String(gameState.warSpirit);
    if (milEl) milEl.textContent = `${gameState.militaryUsed}/${gameState.militaryCapacity}`;
    if (workEl) workEl.textContent = `${gameState.workUsed}/${gameState.workCapacity}`;
    if (keepHp) keepHp.textContent = `${Math.ceil(gameState.mainKeepHealth)}/${gameState.mainKeepMaxHealth}`;
    if (keepFill) keepFill.style.width = `${Math.max(0, (gameState.mainKeepHealth / gameState.mainKeepMaxHealth) * 100)}%`;
  }

  private updateSquadPanel(): void {
    const panel = document.getElementById('squad-panel');
    if (!panel) return;

    if (!gameState.selectedSquadId) {
      panel.style.display = 'none';
      return;
    }

    const sq = gameState.squads.find(s => s.id === gameState.selectedSquadId);
    if (!sq) {
      panel.style.display = 'none';
      return;
    }

    const data = getUnitData(sq.unitId);
    panel.style.display = 'block';
    document.getElementById('sq-name')!.textContent = data?.unit_name || '未知单位';
    document.getElementById('sq-hp')!.textContent = `HP: ${Math.ceil(sq.health)} / ${sq.maxHealth}`;
  }

  private updateEnemyCount(): void {
    const el = document.getElementById('enemy-counter');
    if (!el) return;
    const waveText = gameState.waveActive
      ? ` · 第 ${gameState.waveNumber}/${TOTAL_WAVES} 波`
      : gameState.wavePreview
        ? ` · 第 ${gameState.wavePreview.wave} 波来袭倒计时`
        : '';
    el.textContent = `敌人: ${gameState.enemies.length}${waveText}`;
  }

  /** I3：受损归营堆修复面板（白天显示，50% 金币修复，修复后落阵半血入场）。 */
  private updateDamagedCampPanel(): void {
    let panel = document.getElementById('damaged-camp-panel');

    if (gameState.phase !== 'day' || gameState.damagedCamp.length === 0) {
      if (panel) panel.remove();
      return;
    }

    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'damaged-camp-panel';
      panel.className = 'eh-damaged-panel';
      this.uiLayer.appendChild(panel);
    }

    let html = '<div class="eh-damaged-title">🩹 受损归营堆（次日修复）</div>';
    for (const d of gameState.damagedCamp) {
      const card = getCardData(d.cardId);
      const cost = Math.ceil((card?.cost_day ?? 0) * 0.5);
      html += `
        <div class="eh-damaged-row">
          <span>${card?.card_name ?? d.cardId} ×${d.count}</span>
          <button class="eh-repair-btn" data-repair="${d.cardId}">修复 ${cost}金</button>
        </div>
      `;
    }
    panel.innerHTML = html;

    for (const btn of Array.from(panel.querySelectorAll('[data-repair]'))) {
      btn.addEventListener('click', () => {
        const cardId = (btn as HTMLElement).dataset.repair!;
        if (gameState.repairDamagedCard(cardId)) {
          this.showInfo('修复完成，再次落阵时半血入场');
        } else {
          this.showInfo('金币不足，无法修复');
        }
      });
    }
  }

  /** I2：威胁预演横幅（波次构成 + 抵达倒计时）。 */
  private showWavePreview(preview: WavePreview): void {
    const old = document.querySelector('.eh-wave-banner');
    if (old) old.remove();
    if (!preview) return;

    const enemyNames = preview.entries
      .map(e => {
        const data = getEnemyData(e.enemyId);
        return `${data?.enemy_name ?? e.enemyId}×${e.count}`;
      })
      .join('、');

    const banner = document.createElement('div');
    banner.className = 'eh-wave-banner';
    banner.textContent = `⚠️ 威胁预演：第 ${preview.wave} 波（${enemyNames}）约 ${Math.ceil(preview.eta)} 秒后抵达`;
    this.uiLayer.appendChild(banner);
    setTimeout(() => banner.remove(), 6000);

    this.updateEnemyCount();
  }

  private showInfo(text: string): void {
    const el = document.getElementById('info-text');
    if (!el) return;
    el.textContent = text;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 3000);
  }

  private showSettlement(): void {
    const existing = document.querySelector('.eh-settlement');
    if (existing) return;

    const settle = document.createElement('div');
    settle.className = 'eh-settlement';
    settle.innerHTML = `
      <div class="eh-settlement-title">☀️ 夜末清算 · 第 ${gameState.dayCount} 天</div>
      <div class="eh-stat-row">击败敌人: ${gameState.enemiesKilledThisNight}</div>
      <div class="eh-stat-row">获得金币: ${gameState.goldEarnedThisNight}</div>
      <div class="eh-stat-row">阵亡班组: ${gameState.squadsLostThisNight}</div>
      <div class="eh-stat-row">战意结余转金: ${Math.floor(gameState.warSpirit * 0.5)}</div>
      <div class="eh-stat-row">当前金币: ${gameState.gold}</div>
      <button class="eh-btn eh-btn-primary" id="btn-next-day" style="margin-top:20px;">进入下一天</button>
    `;
    this.uiLayer.appendChild(settle);

    document.getElementById('btn-next-day')!.onclick = () => {
      settle.remove();
      gameState.startNextDay();
    };
  }

  private showGameOver(victory: boolean, day: number): void {
    const go = document.createElement('div');
    go.className = 'eh-gameover';
    go.innerHTML = `
      <div class="eh-gameover-title ${victory ? 'eh-gameover-win' : 'eh-gameover-loss'}">
        ${victory ? '🏆 胜利！' : '💀 失守...'}
      </div>
      <div style="font-size:18px;color:#aaa;margin-bottom:10px;">坚持到第 ${day} 天</div>
      <div style="font-size:16px;color:#ddd;margin-bottom:30px;">
        ${victory ? '你成功守住了烬堡！' : '主堡炉火熄灭了，但余烬不灭...'}
      </div>
      <button class="eh-btn eh-btn-primary" id="btn-restart">再来一局</button>
      <button class="eh-btn eh-btn-secondary" id="btn-menu">返回主菜单</button>
    `;
    this.uiLayer.appendChild(go);

    document.getElementById('btn-restart')!.onclick = () => {
      go.remove();
      gameState.startGame();
      this.showHUD();
    };
    document.getElementById('btn-menu')!.onclick = () => {
      go.remove();
      this.showMenu();
    };
  }
}
