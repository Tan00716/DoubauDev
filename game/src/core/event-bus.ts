export type GameEventType =
  | 'phase-change'
  | 'gold-changed'
  | 'war-spirit-changed'
  | 'squad-selected'
  | 'squad-deselected'
  | 'building-placed'
  | 'card-played'
  | 'enemy-spawned'
  | 'entity-damaged'
  | 'entity-destroyed'
  | 'wave-started'
  | 'wave-ended'
  | 'night-ended'
  | 'day-started'
  | 'game-over'
  | 'commander-ultimate'
  | 'squad-command'
  | 'wave-preview'
  | 'entity-upgraded'
  | 'damaged-camp-changed'
  | 'military-changed'
  | 'tick';

export interface GameEvent {
  type: GameEventType;
  payload?: any;
}

type EventHandler = (payload?: any) => void;

class EventBus {
  private listeners: Map<GameEventType, EventHandler[]> = new Map();

  on(type: GameEventType, handler: EventHandler): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(handler);
    return () => this.off(type, handler);
  }

  off(type: GameEventType, handler: EventHandler): void {
    const list = this.listeners.get(type);
    if (list) {
      const idx = list.indexOf(handler);
      if (idx >= 0) list.splice(idx, 1);
    }
  }

  emit(type: GameEventType, payload?: any): void {
    const list = this.listeners.get(type);
    if (list) {
      list.forEach(h => {
        try { h(payload); } catch (e) { console.error(e); }
      });
    }
  }

  once(type: GameEventType, handler: EventHandler): void {
    const wrapped = (payload?: any) => {
      this.off(type, wrapped);
      handler(payload);
    };
    this.on(type, wrapped);
  }
}

export const eventBus = new EventBus();
