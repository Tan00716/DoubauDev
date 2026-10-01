import { gameState, type GamePhase, type SquadEntity, type WavePreview, TOTAL_WAVES } from '../gameplay/game-state';
import { hasSave, continueFromSave, persistSave } from '../gameplay/save-load';
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
  private helpOverlay: HTMLElement | null = null;
  /** 批次三（MVP-AC-05）：军械册面板收起状态——B 键切换，白天开局默认展开。 */
  private buildPanelCollapsed = false;
  /** 批次二修复：构造期注册的事件监听注销器集合——支持 destroy()，避免多实例（热重载/测试）下监听泄漏、
   * 游离 DOM 实例继续消费事件并在 getElementById 上抛错（P0 复核同类根因：异常被事件总线吞掉）。 */
  private disposers: (() => void)[] = [];

  constructor(renderer: GameRenderer) {
    this.uiLayer = document.getElementById('ui-layer')!;
    this.renderer = renderer;
    this.createStyles();
    this.showMenu();

    this.disposers.push(
      eventBus.on('phase-change', ({ phase }) => this.onPhaseChange(phase)),
      eventBus.on('game-over', ({ victory, day }) => this.showGameOver(victory, day)),
      eventBus.on('gold-changed', () => this.updateResources()),
      eventBus.on('war-spirit-changed', () => this.updateResources()),
      eventBus.on('squad-selected', () => this.updateSquadPanel()),
      eventBus.on('card-played', () => this.updateTacticHand()),
      eventBus.on('military-changed', () => {
        this.updateResources();
        this.updateTacticHand();
      }),
      eventBus.on('building-placed', () => this.updateArmoryDeck()),
      eventBus.on('enemy-spawned', () => this.updateEnemyCount()),
      eventBus.on('entity-destroyed', () => this.updateEnemyCount()),
      eventBus.on('entity-upgraded', ({ kind, level }) => this.showInfo(`⬆️ 升级成功：${kind === 'squad' ? '班组' : '建筑'} 提升至 Lv${level + 1}，规模 +50%`)),
      eventBus.on('damaged-camp-changed', () => {
        this.updateDamagedCampPanel();
        this.updateArmoryDeck();
      }),
      eventBus.on('wave-preview', (preview: WavePreview) => this.showWavePreview(preview)),
      // 批次二·新手第 1 夜分阶段引导：波次开始推进教学阶段（波 1 班级指令 / 波 2 战意和打牌 / 波 3 整合）。
      eventBus.on('wave-started', ({ wave }) => this.onWaveStarted(wave)),
      eventBus.on('tutorial-dismissed', () => this.onTutorialDismissed()),
    );

    // 批次三（MVP-AC-05）：B 键收起/展开军械册面板（白天）。挂进 disposers，destroy() 时注销。
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'b' || e.key === 'B') this.toggleBuildPanel();
    };
    document.addEventListener('keydown', onKeydown);
    this.disposers.push(() => document.removeEventListener('keydown', onKeydown));
  }

  /** 注销全部事件监听（测试 / 热重载场景防泄漏；正常游戏单例无需调用）。 */
  destroy(): void {
    for (const off of this.disposers) off();
    this.disposers = [];
  }

  /** 批次三（MVP-AC-05）：B 键收起/展开军械册面板。只作用于白天军械册；夜间战术手牌面板不受影响。 */
  private toggleBuildPanel(): void {
    const panel = document.getElementById('bottom-panel');
    if (!panel || gameState.phase !== 'day') return;
    this.buildPanelCollapsed = !this.buildPanelCollapsed;
    panel.style.display = this.buildPanelCollapsed ? 'none' : 'flex';
  }

  /** 跳过引导后：撤横幅 + 解锁终章按钮（战术牌解锁与补抽在按钮回调内完成）。 */
  private onTutorialDismissed(): void {
    this.hideTutorialBanner();
    const btnUlt = document.getElementById('btn-ultimate');
    btnUlt?.removeAttribute('disabled');
    btnUlt?.removeAttribute('title');
    (btnUlt as HTMLElement | null)?.style.setProperty('opacity', '1');
  }

  /** 批次二·新手教学文案（≤30 字，设计文档 UX 章节认知负担控制口径）。 */
  private static readonly TUTORIAL_STAGES: Record<number, string> = {
    1: '教学① 点击你的班级，试试驻守 / 集火指令',
    2: '教学② 班级接敌会涨战意，战意驱动战术牌',
    3: '教学③ 综合运用指令与战意，守住今夜！',
  };

  private onWaveStarted(wave: number): void {
    if (!gameState.isTutorialNight()) return;
    const text = GameUI.TUTORIAL_STAGES[wave];
    if (text) this.showTutorialBanner(text);
  }

  private showTutorialBanner(text: string): void {
    this.hideTutorialBanner();
    const hud = this.hudScreen;
    if (!hud) return;
    const banner = document.createElement('div');
    banner.className = 'eh-tutorial-banner';
    banner.id = 'tutorial-banner';
    banner.innerHTML = `
      <div class="eh-tutorial-text">${text}</div>
      <button class="eh-tutorial-skip" id="btn-skip-tutorial">跳过引导</button>
    `;
    hud.appendChild(banner);
    document.getElementById('btn-skip-tutorial')!.onclick = () => {
      gameState.dismissTutorial();
      // 跳过 = 关闭整局新手模式：战术牌层立即解锁并补抽初始手牌（与第 2 局体验一致）
      gameState.drawTacticCards(3);
      this.updateTacticHand();
    };
  }

  private hideTutorialBanner(): void {
    document.getElementById('tutorial-banner')?.remove();
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
      .eh-help-overlay { position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:200; }
      .eh-help-panel { background:linear-gradient(180deg,#1a1a2e 0%,#16213e 100%); border:1px solid #e74c3c; border-radius:12px; padding:28px 36px; max-width:520px; max-height:80vh; overflow-y:auto; box-shadow:0 0 40px rgba(231,76,60,0.3); }
      .eh-help-panel h2 { color:#e74c3c; font-size:24px; margin:0 0 16px; }
      .eh-help-panel h3 { color:#f39c12; font-size:16px; margin:14px 0 6px; }
      .eh-help-panel ul { margin:0; padding-left:20px; }
      .eh-help-panel li { color:#ddd; font-size:14px; line-height:1.7; }
      .eh-help-panel .eh-help-goal { color:#fff; font-size:15px; margin:16px 0 0; padding:10px 12px; background:rgba(231,76,60,0.15); border-left:3px solid #e74c3c; border-radius:4px; }
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
      .eh-tutorial-banner { position:absolute; top:110px; left:50%; transform:translateX(-50%); display:flex; align-items:center; gap:14px; background:rgba(30,60,30,0.88); border:1px solid #6dbb6d; padding:10px 18px; border-radius:8px; z-index:60; }
      .eh-tutorial-text { font-size:15px; color:#c8f7c5; }
      .eh-tutorial-skip { background:transparent; border:1px solid #6dbb6d; color:#9be09a; font-size:12px; padding:4px 10px; border-radius:4px; cursor:pointer; }
      .eh-tutorial-skip:hover { background:rgba(109,187,109,0.25); }
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
      <button class="eh-btn eh-btn-primary" id="btn-continue" style="display:none;">继续游戏</button>
      <button class="eh-btn eh-btn-primary" id="btn-start">开始新游戏</button>
      <button class="eh-btn eh-btn-secondary" id="btn-help">操作说明</button>
    `;
    this.uiLayer.appendChild(menu);
    this.menuScreen = menu;

    // 批次三（MVP-AC-17）：主菜单「继续游戏」——有档（版本校验通过）才显示。
    const btnContinue = document.getElementById('btn-continue');
    if (btnContinue && hasSave()) {
      btnContinue.style.display = 'block';
      btnContinue.onclick = () => {
        // P0 教训同 btn-start：HUD 先挂载再读档——读档 emit phase-change(day) 时
        // onPhaseChange 要找 #btn-night 等元素，HUD 未挂载则按钮状态永久失步。
        this.showHUD();
        if (!continueFromSave(gameState)) {
          // 档在菜单渲染后被清/损坏（竞态）：回到主菜单，不静默开新局
          this.showMenu();
          return;
        }
        this.buildPanelCollapsed = false;
        this.updateResources();
      };
    }

    document.getElementById('btn-start')!.onclick = () => {
      // P0 修复（质检批次一复核）：showHUD 必须先于 startGame 挂载——
      // startGame 内部 emit('phase-change', day) 时 onPhaseChange 会查找 #btn-night 并置可见，
      // 若 HUD 尚未创建，getElementById 返回 null，`btnNight!.style` 抛 TypeError 被事件总线吞掉，
      // 按钮保持 display:none，白天无自动入夜兜底 → 第一局卡死白天。gameState 构造时已 resetGame，
      // 先挂 HUD 读到的资源值与 startGame 内 reset 后一致，无显示错位。
      this.showHUD();
      gameState.startGame();
    };

    document.getElementById('btn-help')!.onclick = () => {
      this.showHelpPanel();
    };
  }

  /** S2（质检清理项）：帮助说明由 alert() 改为游戏内面板，避免浏览器原生弹窗打断体验。 */
  private showHelpPanel(): void {
    this.closeHelpPanel();
    const overlay = document.createElement('div');
    overlay.className = 'eh-help-overlay';
    overlay.innerHTML = `
      <div class="eh-help-panel">
        <h2>操作说明</h2>
        <h3>白天阶段</h3>
        <ul>
          <li>点击手牌选择建筑/单位卡，再点击地图放置</li>
          <li>点击已放置的班选中，再点击地图移动</li>
          <li>按 B 键收起 / 展开军械册面板</li>
          <li>点击「入夜」进入夜间防守</li>
          <li>「存档退出」随时保存并回主菜单，下次「继续游戏」</li>
        </ul>
        <h3>夜间阶段</h3>
        <ul>
          <li>敌人会从地图边缘进攻</li>
          <li>点击战术手牌，再点击地图释放效果</li>
          <li>选中己方班后可下达指令</li>
          <li>点击「终章」释放指挥官终极技</li>
        </ul>
        <p class="eh-help-goal">目标：守住主堡炉火，击败所有进攻的敌人！</p>
        <button class="eh-btn eh-btn-primary" id="btn-help-close" style="margin-top:20px;">知道了</button>
      </div>
    `;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.closeHelpPanel();
    });
    this.uiLayer.appendChild(overlay);
    this.helpOverlay = overlay;
    document.getElementById('btn-help-close')!.onclick = () => this.closeHelpPanel();
  }

  private closeHelpPanel(): void {
    if (this.helpOverlay) {
      this.helpOverlay.remove();
      this.helpOverlay = null;
    }
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
        <button class="eh-action-btn" id="btn-save-quit" style="display:none;">💾<br>存档退出</button>
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
    // 批次三（MVP-AC-17）：保存并退出——白天任意时刻落盘 day 档并回主菜单（canSaveInCurrentPhase 守卫）。
    document.getElementById('btn-save-quit')!.onclick = () => {
      if (gameState.phase !== 'day') return;
      if (persistSave(gameState, 'day')) {
        this.showInfo('已保存，返回主菜单');
        this.showMenu();
      } else {
        this.showInfo('保存失败（存储不可用），进度未落盘');
      }
    };
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
    const btnSaveQuit = document.getElementById('btn-save-quit');
    const btnUlt = document.getElementById('btn-ultimate');
    const btnSettle = document.getElementById('btn-settle');
    const enemyCounter = document.getElementById('enemy-counter');
    const bottomPanel = document.getElementById('bottom-panel');

    if (phase === 'day') {
      // 防御（P0 复盘）：HUD 未挂载时这些元素可能为 null——用可选链替代强制断言，
      // 避免事件总线吞掉 TypeError 后 UI 永久失步（根因已在 btn-start/btn-restart 侧修复，此处兜底）。
      if (badge) badge.textContent = `白天 · 第 ${gameState.dayCount} 天`;
      if (badge) badge.className = 'eh-phase-badge eh-phase-day';
      btnNight?.style.setProperty('display', 'block');
      // 批次三（MVP-AC-17）：存档退出只在白天可见；B 键收起状态每个白天复位为展开。
      btnSaveQuit?.style.setProperty('display', 'block');
      this.buildPanelCollapsed = false;
      if (bottomPanel) bottomPanel.style.removeProperty('display');
      btnUlt?.style.setProperty('display', 'none');
      btnSettle?.style.setProperty('display', 'none');
      enemyCounter?.style.setProperty('display', 'none');
      this.updateArmoryDeck();
      this.updateDamagedCampPanel();
    } else if (phase === 'night') {
      if (badge) badge.textContent = `🌙 夜间 · 第 ${gameState.dayCount} 天`;
      if (badge) badge.className = 'eh-phase-badge eh-phase-night';
      btnNight?.style.setProperty('display', 'none');
      btnSaveQuit?.style.setProperty('display', 'none');
      // 批次二·新手第 1 夜：终章随战术牌层一并锁定（置灰 + 提示），第 2 夜正常开放
      if (gameState.isTutorialNight()) {
        btnUlt?.setAttribute('disabled', 'true');
        btnUlt?.setAttribute('title', '第 2 夜开放');
        (btnUlt as HTMLElement | null)?.style.setProperty('opacity', '0.4');
      } else {
        btnUlt?.removeAttribute('disabled');
        btnUlt?.removeAttribute('title');
        (btnUlt as HTMLElement | null)?.style.setProperty('opacity', '1');
      }
      btnUlt?.style.setProperty('display', 'block');
      btnSettle?.style.setProperty('display', 'none');
      enemyCounter?.style.setProperty('display', 'block');
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
      const recalled = !damaged && (gameState.recalledPending.get(card.card_id) ?? 0) > 0
        ? '<div class="eh-card-recalled">已修复·免费落阵(半血)</div>' : '';
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

    // 批次二·新手第 1 夜：战术牌层锁定占位（审计修复项 #8：延迟到第 2 夜开放）
    if (gameState.isTutorialNight()) {
      panel.innerHTML = `
        <div class="eh-card eh-card-dim" style="justify-content:center;min-width:240px;">
          <div class="eh-card-layer eh-layer-tactic">战术</div>
          <div class="eh-card-name">🔒 战术牌第 2 夜开放</div>
          <div class="eh-card-desc">今晚专注指挥班级作战</div>
        </div>
      `;
      return;
    }

    let html = '';
    for (let i = 0; i < gameState.tacticHand.length; i++) {
      const card = gameState.tacticHand[i];
      const isSelected = gameState.hoveredCardIndex === i;
      const cost = gameState.firstTacticFree && i === 0 ? 0 : card.cost_night;
      // N1：紧急增援在军令容量满时置灰不可点
      const playable = gameState.canPlayTacticCard(card);
      html += `
        <div class="eh-card ${isSelected ? 'eh-card-selected' : ''} ${playable ? '' : 'eh-card-dim'}" data-index="${i}">
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
        const card = gameState.tacticHand[idx];
        if (!card) return;
        // N1：容量满时拦截点击并提示，不再静默吞卡
        if (!gameState.canPlayTacticCard(card)) {
          this.showInfo('军令容量已满，紧急增援无法召唤');
          return;
        }
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
          <button class="eh-repair-btn" data-repair="${d.cardId}">修复 ${cost}金(含再入场)</button>
        </div>
      `;
    }
    panel.innerHTML = html;

    for (const btn of Array.from(panel.querySelectorAll('[data-repair]'))) {
      btn.addEventListener('click', () => {
        const cardId = (btn as HTMLElement).dataset.repair!;
        if (gameState.repairDamagedCard(cardId)) {
          this.showInfo('修复完成：点击卡牌免费落阵（半血入场），不再额外收费');
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
    // 批次三（MVP-AC-12·结算收支明细）：击杀金币与战意转金分列。
    // 修复记录：原「战意结余转金」读 gameState.warSpirit——endNight 在结算前已清零 warSpirit，
    // 恒显示 0；改读 spiritConvertedLastNight（endNight 记账的实际转金值）。
    // killGoldThisNight 只含击杀奖励（含残兵，口径受 stragglerMode 影响）；goldEarnedThisNight 为总收入（含转金）。
    const killGold = Math.round(gameState.killGoldThisNight);
    const spiritGold = gameState.spiritConvertedLastNight;
    settle.innerHTML = `
      <div class="eh-settlement-title">☀️ 夜末清算 · 第 ${gameState.dayCount} 天</div>
      <div class="eh-stat-row">击败敌人: ${gameState.enemiesKilledThisNight}</div>
      <div class="eh-stat-row">🪙 击杀金币: ${killGold}</div>
      <div class="eh-stat-row">🔥 战意结余转金: ${spiritGold}</div>
      <div class="eh-stat-row">💰 本夜总收入: ${Math.round(gameState.goldEarnedThisNight)}</div>
      <div class="eh-stat-row">阵亡班组: ${gameState.squadsLostThisNight}</div>
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
      // P0 修复同 btn-start：HUD 先挂载再 startGame，保证 phase-change 事件能找到 #btn-night。
      this.showHUD();
      gameState.startGame();
    };
    document.getElementById('btn-menu')!.onclick = () => {
      go.remove();
      this.showMenu();
    };
  }
}
