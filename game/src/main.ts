import { GameRenderer } from './renderer/scene';
import { GameUI } from './ui/ui';
import { gameState } from './gameplay/game-state';
import { updateCombat } from './gameplay/combat';
import { eventBus } from './core/event-bus';

class Game {
  renderer: GameRenderer;
  ui: GameUI;
  running = false;
  lastTime = 0;

  constructor() {
    this.renderer = new GameRenderer('canvas-container');
    this.ui = new GameUI();
    (window as any).gameRenderer = this.renderer;
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  loop(time: number): void {
    if (!this.running) return;

    const dt = Math.min((time - this.lastTime) / 1000, 0.05); // Cap delta time
    this.lastTime = time;

    gameState.deltaTime = dt;
    gameState.lastTick = time;

    // Update combat logic
    updateCombat(dt);

    // Update UI resources periodically
    if (Math.floor(time / 500) !== Math.floor((time - dt * 1000) / 500)) {
      eventBus.emit('gold-changed', gameState.gold);
      eventBus.emit('war-spirit-changed', gameState.warSpirit);
    }

    // Render
    this.renderer.update();

    requestAnimationFrame((t) => this.loop(t));
  }
}

// Start game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new Game();
});
