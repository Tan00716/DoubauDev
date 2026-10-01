import * as THREE from 'three';
import { gameState, type SquadEntity, type BuildingEntity, type EnemyEntity } from '../gameplay/game-state';
import { getUnitData, getBuildingData, getEnemyData } from '../content/data';
import { eventBus } from '../core/event-bus';

export class GameRenderer {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  container: HTMLElement;

  // Object pools
  private squadMeshes: Map<string, THREE.Group> = new Map();
  private buildingMeshes: Map<string, THREE.Mesh> = new Map();
  private enemyMeshes: Map<string, THREE.Group> = new Map();
  private effectMeshes: THREE.Mesh[] = [];
  // I1：火圈资源复用——共享 geometry/material + 网格池，替代每帧 new CircleGeometry/Material
  private fireZoneGeometry!: THREE.CircleGeometry;
  private fireZoneMaterial!: THREE.MeshBasicMaterial;
  private fireZonePool: THREE.Mesh[] = [];
  private activeFireZoneMeshes: THREE.Mesh[] = [];

  // Ground
  private groundMesh!: THREE.Mesh;
  private keepMesh!: THREE.Mesh;
  private gridHelper!: THREE.GridHelper;
  // N5：主堡火焰 mesh 与点光（原局部变量，dispose 无法触达）
  private keepFlameMesh!: THREE.Mesh;
  private keepFlameLight!: THREE.PointLight;

  // Selection indicator
  private selectionRing!: THREE.Mesh;

  // Raycaster
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  constructor(containerId: string) {
    this.container = document.getElementById(containerId)!;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2d4a3e);

    // Fog for depth
    this.scene.fog = new THREE.Fog(0x2d4a3e, 20, 60);

    // Orthographic camera
    const aspect = w / h;
    const d = 20;
    this.camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 1, 1000);
    this.camera.position.set(20, 25, 20);
    this.camera.lookAt(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffeebb, 0.8);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.left = -30;
    dirLight.shadow.camera.right = 30;
    dirLight.shadow.camera.top = 30;
    dirLight.shadow.camera.bottom = -30;
    this.scene.add(dirLight);

    // Ground
    this.createGround();
    this.createMainKeep();
    this.createSelectionRing();

    // I1：火圈共享资源初始化
    this.fireZoneGeometry = new THREE.CircleGeometry(1, 32);
    this.fireZoneMaterial = new THREE.MeshBasicMaterial({
      color: 0xff4400,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });

    // Events
    window.addEventListener('resize', () => this.onResize());
    this.renderer.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.renderer.domElement.addEventListener('click', (e) => this.onClick(e));

    // Subscribe to game events
    eventBus.on('entity-destroyed', ({ id }) => this.removeEntityMesh(id));
    eventBus.on('phase-change', ({ phase }) => this.onPhaseChange(phase));
  }

  private createGround(): void {
    const geo = new THREE.PlaneGeometry(60, 60);
    const mat = new THREE.MeshStandardMaterial({ color: 0x3d5a3d });
    this.groundMesh = new THREE.Mesh(geo, mat);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.receiveShadow = true;
    this.scene.add(this.groundMesh);

    // Grid
    this.gridHelper = new THREE.GridHelper(60, 60, 0x555555, 0x444444);
    this.gridHelper.position.y = 0.01;
    this.scene.add(this.gridHelper);
  }

  private createMainKeep(): void {
    const geo = new THREE.BoxGeometry(3, 4, 3);
    const mat = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
    this.keepMesh = new THREE.Mesh(geo, mat);
    this.keepMesh.position.set(0, 2, 0);
    this.keepMesh.castShadow = true;
    this.scene.add(this.keepMesh);

    // Keep flame
    const flameGeo = new THREE.ConeGeometry(0.5, 1.5, 8);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff6600 });
    this.keepFlameMesh = new THREE.Mesh(flameGeo, flameMat);
    this.keepFlameMesh.position.set(0, 4.5, 0);
    this.scene.add(this.keepFlameMesh);

    // Point light for flame
    this.keepFlameLight = new THREE.PointLight(0xff6600, 1, 10);
    this.keepFlameLight.position.set(0, 4, 0);
    this.scene.add(this.keepFlameLight);
  }

  private createSelectionRing(): void {
    const geo = new THREE.RingGeometry(1, 1.2, 32);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
    this.selectionRing = new THREE.Mesh(geo, mat);
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.selectionRing.visible = false;
    this.scene.add(this.selectionRing);
  }

  private onPhaseChange(phase: string): void {
    if (phase === 'night') {
      this.scene.background = new THREE.Color(0x1a1a3e);
      this.scene.fog!.color.set(0x1a1a3e);
      (this.groundMesh.material as THREE.MeshStandardMaterial).color.set(0x2a3a2a);
    } else if (phase === 'day') {
      this.scene.background = new THREE.Color(0x2d4a3e);
      this.scene.fog!.color.set(0x2d4a3e);
      (this.groundMesh.material as THREE.MeshStandardMaterial).color.set(0x3d5a3d);
    }
  }

  private onResize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const aspect = w / h;
    const d = 20 * gameState.cameraZoom;
    this.camera.left = -d * aspect;
    this.camera.right = d * aspect;
    this.camera.top = d;
    this.camera.bottom = -d;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private onMouseMove(e: MouseEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private onClick(e: MouseEvent): void {
    if (e.button !== 0) return;

    const pos = this.getGroundPosition();
    if (!pos) return;

    // Handle placement —— 统一走 gameState.deployArmoryCard（I3：同名牌升级 / 归营堆半血入场在此结算）
    if (gameState.placementCardId && gameState.phase === 'day') {
      const ok = gameState.deployArmoryCard(gameState.placementCardId, pos);
      if (ok) {
        gameState.placementCardId = null;
      }
      return;
    }

    // Handle tactic card placement
    if (gameState.hoveredCardIndex >= 0 && gameState.phase === 'night') {
      const card = gameState.tacticHand[gameState.hoveredCardIndex];
      if (card && card.target_type === 'terrain') {
        gameState.playTacticCard(gameState.hoveredCardIndex, pos);
        gameState.hoveredCardIndex = -1;
        return;
      }
    }

    // Squad selection
    if (gameState.phase === 'day' || gameState.phase === 'night') {
      const clickedSquad = this.findSquadAtPosition(pos);
      if (clickedSquad) {
        gameState.selectSquad(clickedSquad.id);
      } else if (gameState.selectedSquadId) {
        // Move command
        gameState.issueSquadCommand('move', pos);
      } else {
        gameState.selectSquad(null);
      }
    }
  }

  private getGroundPosition(): { x: number; z: number } | null {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObject(this.groundMesh);
    if (intersects.length > 0) {
      return { x: intersects[0].point.x, z: intersects[0].point.z };
    }
    return null;
  }

  private findSquadAtPosition(pos: { x: number; z: number }): SquadEntity | null {
    for (const sq of gameState.squads) {
      const dx = sq.position.x - pos.x;
      const dz = sq.position.z - pos.z;
      if (dx * dx + dz * dz < 2) {
        return sq;
      }
    }
    return null;
  }

  /** I1：递归释放对象及其子级的 geometry / material，防止 GPU 资源泄漏。 */
  private disposeObject(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) {
        mat.forEach(m => m.dispose());
      } else if (mat) {
        mat.dispose();
      }
    });
  }

  private removeEntityMesh(id: string): void {
    const sq = this.squadMeshes.get(id);
    if (sq) {
      this.scene.remove(sq);
      this.disposeObject(sq);
      this.squadMeshes.delete(id);
    }
    const b = this.buildingMeshes.get(id);
    if (b) {
      this.scene.remove(b);
      this.disposeObject(b);
      this.buildingMeshes.delete(id);
    }
    const en = this.enemyMeshes.get(id);
    if (en) {
      this.scene.remove(en);
      this.disposeObject(en);
      this.enemyMeshes.delete(id);
    }
  }

  update(): void {
    this.updateSquadMeshes();
    this.updateBuildingMeshes();
    this.updateEnemyMeshes();
    this.updateEffects();
    this.updateSelectionRing();
    this.updateCamera();
    this.renderer.render(this.scene, this.camera);
  }

  private updateSquadMeshes(): void {
    const activeIds = new Set<string>();

    for (const sq of gameState.squads) {
      activeIds.add(sq.id);
      let group = this.squadMeshes.get(sq.id);
      const data = getUnitData(sq.unitId);
      if (!data) continue;

      if (!group) {
        group = new THREE.Group();
        const color = new THREE.Color(data.color);

        // Create squad members
        for (let i = 0; i < data.squad_size; i++) {
          const geo = new THREE.BoxGeometry(0.4, 0.6, 0.4);
          const mat = new THREE.MeshStandardMaterial({ color });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.castShadow = true;
          mesh.position.set(
            sq.visualUnits[i]?.x ?? 0,
            0.3,
            sq.visualUnits[i]?.z ?? 0
          );
          group.add(mesh);
        }

        // Health bar
        const barGeo = new THREE.PlaneGeometry(1.5, 0.15);
        const barMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide });
        const bar = new THREE.Mesh(barGeo, barMat);
        bar.position.set(0, 1.2, 0);
        bar.rotation.x = -Math.PI / 2;
        bar.name = 'healthBar';
        group.add(bar);

        // Selection indicator
        const selGeo = new THREE.RingGeometry(0.8, 0.9, 16);
        const selMat = new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide });
        const sel = new THREE.Mesh(selGeo, selMat);
        sel.rotation.x = -Math.PI / 2;
        sel.position.y = 0.05;
        sel.name = 'selection';
        sel.visible = false;
        group.add(sel);

        this.squadMeshes.set(sq.id, group);
        this.scene.add(group);
      }

      // Update position
      group.position.set(sq.position.x, 0, sq.position.z);

      // Update health bar
      const bar = group.getObjectByName('healthBar') as THREE.Mesh;
      if (bar) {
        const ratio = sq.health / sq.maxHealth;
        (bar.material as THREE.MeshBasicMaterial).color.setHSL(ratio * 0.33, 1, 0.5);
        bar.scale.x = Math.max(0.01, ratio);
      }

      // Update selection
      const sel = group.getObjectByName('selection') as THREE.Mesh;
      if (sel) {
        sel.visible = sq.isSelected;
      }
    }

    // Remove stale meshes（I1：补 dispose）
    for (const [id, mesh] of this.squadMeshes) {
      if (!activeIds.has(id)) {
        this.scene.remove(mesh);
        this.disposeObject(mesh);
        this.squadMeshes.delete(id);
      }
    }
  }

  private updateBuildingMeshes(): void {
    const activeIds = new Set<string>();

    for (const b of gameState.buildings) {
      activeIds.add(b.id);
      let mesh = this.buildingMeshes.get(b.id);
      const data = getBuildingData(b.buildingId);
      if (!data) continue;

      if (!mesh) {
        const color = new THREE.Color(data.color);
        let geo: THREE.BufferGeometry;

        if (b.buildingId === 'building_wall') {
          geo = new THREE.BoxGeometry(1.5, 2, 1.5);
        } else if (b.buildingId === 'building_arrow_tower') {
          geo = new THREE.CylinderGeometry(0.6, 0.8, 3, 8);
        } else {
          geo = new THREE.BoxGeometry(data.size * 1.5, 2, data.size * 1.5);
        }

        const mat = new THREE.MeshStandardMaterial({ color });
        mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Health bar
        const barGeo = new THREE.PlaneGeometry(2, 0.15);
        const barMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide });
        const bar = new THREE.Mesh(barGeo, barMat);
        bar.position.set(0, data.size + 0.5, 0);
        bar.rotation.x = -Math.PI / 2;
        bar.name = 'healthBar';
        mesh.add(bar);

        this.buildingMeshes.set(b.id, mesh);
        this.scene.add(mesh);
      }

      mesh.position.set(b.position.x, data.size, b.position.z);

      const bar = mesh.getObjectByName('healthBar') as THREE.Mesh;
      if (bar) {
        const ratio = b.health / b.maxHealth;
        (bar.material as THREE.MeshBasicMaterial).color.setHSL(ratio * 0.33, 1, 0.5);
        bar.scale.x = Math.max(0.01, ratio);
      }
    }

    for (const [id, mesh] of this.buildingMeshes) {
      if (!activeIds.has(id)) {
        this.scene.remove(mesh);
        this.disposeObject(mesh);
        this.buildingMeshes.delete(id);
      }
    }
  }

  private updateEnemyMeshes(): void {
    const activeIds = new Set<string>();

    for (const en of gameState.enemies) {
      activeIds.add(en.id);
      let group = this.enemyMeshes.get(en.id);
      const data = getEnemyData(en.enemyId);
      if (!data) continue;

      if (!group) {
        group = new THREE.Group();
        const color = new THREE.Color(data.color);

        // Enemy body
        const geo = new THREE.ConeGeometry(data.size * 0.6, data.size * 1.2, 6);
        const mat = new THREE.MeshStandardMaterial({ color });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        group.add(mesh);

        // Glow for night visibility
        const glowGeo = new THREE.SphereGeometry(data.size * 0.8, 8, 8);
        const glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2 });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.name = 'glow';
        group.add(glow);

        // Health bar
        const barGeo = new THREE.PlaneGeometry(1, 0.1);
        const barMat = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide });
        const bar = new THREE.Mesh(barGeo, barMat);
        bar.position.set(0, data.size + 0.5, 0);
        bar.rotation.x = -Math.PI / 2;
        bar.name = 'healthBar';
        group.add(bar);

        this.enemyMeshes.set(en.id, group);
        this.scene.add(group);
      }

      group.position.set(en.position.x, data.size * 0.6, en.position.z);

      // Look at main keep
      group.lookAt(0, data.size * 0.6, 0);

      const bar = group.getObjectByName('healthBar') as THREE.Mesh;
      if (bar) {
        const ratio = en.health / en.maxHealth;
        bar.scale.x = Math.max(0.01, ratio);
      }

      // Burn effect
      const glow = group.getObjectByName('glow') as THREE.Mesh;
      if (glow) {
        (glow.material as THREE.MeshBasicMaterial).color.set(
          en.isBurning ? 0xff4400 : new THREE.Color(data.color)
        );
        (glow.material as THREE.MeshBasicMaterial).opacity = en.isBurning ? 0.5 : 0.2;
      }
    }

    for (const [id, mesh] of this.enemyMeshes) {
      if (!activeIds.has(id)) {
        this.scene.remove(mesh);
        this.disposeObject(mesh);
        this.enemyMeshes.delete(id);
      }
    }
  }

  private updateEffects(): void {
    // I1：火圈网格池复用——所有激活的火圈回到池中，再按需取出
    for (const m of this.activeFireZoneMeshes) {
      m.visible = false;
      this.fireZonePool.push(m);
    }
    this.activeFireZoneMeshes = [];

    for (const eff of gameState.activeEffects) {
      if (eff.type === 'fire_zone') {
        const mesh = this.fireZonePool.pop() ?? this.createFireZoneMesh();
        const radius = eff.params.radius as number;
        mesh.scale.set(radius, radius, 1);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(eff.params.x, 0.02, eff.params.z);
        mesh.visible = true;
        this.activeFireZoneMeshes.push(mesh);
      }
    }
  }

  /** I1：火圈网格使用共享 geometry/material，仅网格对象本身进池。 */
  private createFireZoneMesh(): THREE.Mesh {
    const mesh = new THREE.Mesh(this.fireZoneGeometry, this.fireZoneMaterial);
    this.scene.add(mesh);
    return mesh;
  }

  private updateSelectionRing(): void {
    if (gameState.selectedSquadId) {
      const sq = gameState.squads.find(s => s.id === gameState.selectedSquadId);
      if (sq) {
        this.selectionRing.position.set(sq.position.x, 0.02, sq.position.z);
        this.selectionRing.visible = true;
      } else {
        this.selectionRing.visible = false;
      }
    } else {
      this.selectionRing.visible = false;
    }
  }

  private updateCamera(): void {
    // Smooth camera follow
    const target = gameState.cameraTarget;
    this.camera.position.x += (target.x + 20 - this.camera.position.x) * 0.05;
    this.camera.position.z += (target.z + 20 - this.camera.position.z) * 0.05;
    this.camera.lookAt(target.x, 0, target.z);
  }

  setZoom(zoom: number): void {
    gameState.cameraZoom = Math.max(0.5, Math.min(2, zoom));
    this.onResize();
  }

  dispose(): void {
    // I1：完整释放场景资源
    for (const id of [...this.squadMeshes.keys()]) this.removeEntityMesh(id);
    for (const id of [...this.buildingMeshes.keys()]) this.removeEntityMesh(id);
    for (const id of [...this.enemyMeshes.keys()]) this.removeEntityMesh(id);

    for (const m of this.activeFireZoneMeshes) this.scene.remove(m);
    for (const m of this.fireZonePool) this.scene.remove(m);
    this.activeFireZoneMeshes = [];
    this.fireZonePool = [];
    this.fireZoneGeometry.dispose();
    this.fireZoneMaterial.dispose();

    if (this.groundMesh) {
      this.scene.remove(this.groundMesh);
      this.disposeObject(this.groundMesh);
    }
    if (this.keepMesh) {
      this.scene.remove(this.keepMesh);
      this.disposeObject(this.keepMesh);
    }
    // N5：补齐 GridHelper、主堡火焰 mesh/材质、点光的释放
    if (this.gridHelper) {
      this.scene.remove(this.gridHelper);
      this.gridHelper.dispose();
    }
    if (this.keepFlameMesh) {
      this.scene.remove(this.keepFlameMesh);
      this.disposeObject(this.keepFlameMesh);
    }
    if (this.keepFlameLight) {
      this.scene.remove(this.keepFlameLight);
      this.keepFlameLight.dispose();
    }
    if (this.selectionRing) {
      this.scene.remove(this.selectionRing);
      this.disposeObject(this.selectionRing);
    }

    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
