import * as THREE from 'three';
import { gameState, type SquadEntity, type BuildingEntity, type EnemyEntity } from '../gameplay/game-state';
import { getUnitData, getBuildingData, getEnemyData } from '../content/data';
import { eventBus } from '../core/event-bus';

export class GameRenderer {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  container: HTMLElement;

  // MVP 批次一·性能项：InstancedMesh 合批（每类实体一次 drawcall）+ 共享资源 + 帧内零分配
  // 敌人与班组完全走 InstancedMesh；建筑数量少（≤20）保留独立 Mesh 但 geometry/material 按 buildingId 共享缓存
  private static readonly MAX_ENEMIES = 256;
  private static readonly MAX_SQUADS = 64;
  private static readonly MAX_SQUAD_MEMBERS = 320; // 64 班 × 5 成员上限

  private enemyBodyMesh!: THREE.InstancedMesh;
  private enemyGlowMesh!: THREE.InstancedMesh;
  private enemyBarMesh!: THREE.InstancedMesh;
  private squadBodyMesh!: THREE.InstancedMesh;
  private squadBarMesh!: THREE.InstancedMesh;
  private squadSelMesh!: THREE.InstancedMesh;

  // 建筑共享资源缓存（按 buildingId），血条材质因颜色随血量逐建筑变化需 per-entity clone
  private buildingMeshes: Map<string, THREE.Mesh> = new Map();
  private buildingGeometries = new Map<string, THREE.BufferGeometry>();
  private buildingMaterials = new Map<string, THREE.MeshStandardMaterial>();
  private buildingBarGeometry!: THREE.PlaneGeometry;
  private buildingBarMaterialBase!: THREE.MeshBasicMaterial;

  // 帧内复用临时对象（性能项：热路径零分配）
  private tmpMatrix = new THREE.Matrix4();
  private tmpQuat = new THREE.Quaternion();
  private tmpEuler = new THREE.Euler();
  private tmpVec = new THREE.Vector3();
  private tmpScale = new THREE.Vector3();
  private tmpColor = new THREE.Color();

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
    this.createInstancedMeshes();

    // I1：火圈共享资源初始化
    this.fireZoneGeometry = new THREE.CircleGeometry(1, 32);
    this.fireZoneMaterial = new THREE.MeshBasicMaterial({
      color: 0xff4400,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });

    // 建筑共享资源初始化
    this.buildingBarGeometry = new THREE.PlaneGeometry(2, 0.15);
    this.buildingBarMaterialBase = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide });

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

  /**
   * MVP 批次一·性能项：实体渲染 InstancedMesh 化。
   * 敌人（body/glow/血条）与班组（成员/血条/选中环）各由固定上限的 InstancedMesh 承载，
   * drawcall 从「每实体 2~7 个」降为每类 1 个；实例缓冲即天然对象池，实体增删不再触发资源创建/销毁。
   * 颜色逐实例（instanceColor）：敌人按类型色 + 灼烧橙、班组成员按单位色、班组血条绿→红 HSL。
   */
  private createInstancedMeshes(): void {
    const white = 0xffffff;

    // 敌人主体：单位锥体，per-instance 缩放为 size*0.6 / size*1.2
    this.enemyBodyMesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1, 1, 6),
      new THREE.MeshStandardMaterial({ color: white }),
      GameRenderer.MAX_ENEMIES
    );
    this.enemyBodyMesh.castShadow = true;
    this.enemyBodyMesh.frustumCulled = false;

    // 敌人夜光晕：单位球，per-instance 缩放 size*0.8（灼烧变橙红，透明度统一 0.25）
    this.enemyGlowMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 8, 8),
      new THREE.MeshBasicMaterial({ color: white, transparent: true, opacity: 0.25 }),
      GameRenderer.MAX_ENEMIES
    );
    this.enemyGlowMesh.frustumCulled = false;

    // 敌人血条：红色固定，仅缩放长度
    this.enemyBarMesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 0.1),
      new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide }),
      GameRenderer.MAX_ENEMIES
    );
    this.enemyBarMesh.frustumCulled = false;

    // 班组成员：固定 box，per-instance 颜色为单位色
    this.squadBodyMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.4, 0.6, 0.4),
      new THREE.MeshStandardMaterial({ color: white }),
      GameRenderer.MAX_SQUAD_MEMBERS
    );
    this.squadBodyMesh.castShadow = true;
    this.squadBodyMesh.frustumCulled = false;

    // 班组血条：颜色随血量 HSL（绿→红），长度随比例
    this.squadBarMesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1.5, 0.15),
      new THREE.MeshBasicMaterial({ color: white, side: THREE.DoubleSide }),
      GameRenderer.MAX_SQUADS
    );
    this.squadBarMesh.frustumCulled = false;

    // 班组选中环：黄色固定，未选中时缩放 0 隐藏
    this.squadSelMesh = new THREE.InstancedMesh(
      new THREE.RingGeometry(0.8, 0.9, 16),
      new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide }),
      GameRenderer.MAX_SQUADS
    );
    this.squadSelMesh.frustumCulled = false;

    // 预分配 instanceColor 缓冲（首帧 setColorAt 前必须初始化）
    const initColor = new THREE.Color(white);
    for (const mesh of [this.enemyBodyMesh, this.enemyGlowMesh, this.squadBodyMesh, this.squadBarMesh]) {
      for (let i = 0; i < mesh.count; i++) mesh.setColorAt(i, initColor);
      mesh.count = 0;
      this.scene.add(mesh);
    }
    for (const mesh of [this.enemyBarMesh, this.squadSelMesh]) {
      this.scene.add(mesh);
      mesh.count = 0;
    }
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

  /**
   * 实体移除钩子：班组/敌人已 InstancedMesh 化，实例缓冲随 gameState 数组自动收缩，无需逐实体清理；
   * 仅建筑保留独立 Mesh（共享 geometry/material 不 dispose，只释放 per-entity 克隆的血条材质）。
   */
  private removeEntityMesh(id: string): void {
    const b = this.buildingMeshes.get(id);
    if (b) {
      this.scene.remove(b);
      const bar = b.getObjectByName('healthBar') as THREE.Mesh | undefined;
      if (bar) (bar.material as THREE.MeshBasicMaterial).dispose(); // 克隆材质，per-entity 释放
      this.buildingMeshes.delete(id);
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

  /** 班组渲染：成员/血条/选中环三张 InstancedMesh，每帧全量重写实例矩阵（帧内零分配）。 */
  private updateSquadMeshes(): void {
    let memberIdx = 0;
    let squadIdx = 0;

    for (const sq of gameState.squads) {
      if (squadIdx >= GameRenderer.MAX_SQUADS) break;
      const data = getUnitData(sq.unitId);
      if (!data) continue;

      // 血条：位置 (x, 1.2, z)，平铺，长度随血量，颜色绿→红
      const ratio = Math.max(0.01, sq.health / sq.maxHealth);
      this.tmpEuler.set(-Math.PI / 2, 0, 0);
      this.tmpQuat.setFromEuler(this.tmpEuler);
      this.tmpVec.set(sq.position.x, 1.2, sq.position.z);
      this.tmpScale.set(ratio, 1, 1);
      this.tmpMatrix.compose(this.tmpVec, this.tmpQuat, this.tmpScale);
      this.squadBarMesh.setMatrixAt(squadIdx, this.tmpMatrix);
      this.squadBarMesh.setColorAt(squadIdx, this.tmpColor.setHSL((sq.health / sq.maxHealth) * 0.33, 1, 0.5));

      // 选中环：未选中缩放 0 隐藏
      this.tmpVec.set(sq.position.x, 0.05, sq.position.z);
      const selScale = sq.isSelected ? 1 : 0;
      this.tmpScale.set(selScale, selScale, selScale);
      this.tmpMatrix.compose(this.tmpVec, this.tmpQuat, this.tmpScale);
      this.squadSelMesh.setMatrixAt(squadIdx, this.tmpMatrix);

      // 成员：按班组位置 + 编队相对位置
      this.tmpQuat.identity();
      this.tmpScale.set(1, 1, 1);
      for (let m = 0; m < data.squad_size && memberIdx < GameRenderer.MAX_SQUAD_MEMBERS; m++) {
        const rel = sq.visualUnits[m] ?? { x: 0, z: 0 };
        this.tmpVec.set(sq.position.x + rel.x, 0.3, sq.position.z + rel.z);
        this.tmpMatrix.compose(this.tmpVec, this.tmpQuat, this.tmpScale);
        this.squadBodyMesh.setMatrixAt(memberIdx, this.tmpMatrix);
        this.squadBodyMesh.setColorAt(memberIdx, this.tmpColor.set(data.color));
        memberIdx++;
      }

      squadIdx++;
    }

    this.squadBodyMesh.count = memberIdx;
    this.squadBarMesh.count = squadIdx;
    this.squadSelMesh.count = squadIdx;
    this.squadBodyMesh.instanceMatrix.needsUpdate = true;
    this.squadBarMesh.instanceMatrix.needsUpdate = true;
    this.squadSelMesh.instanceMatrix.needsUpdate = true;
    if (this.squadBodyMesh.instanceColor) this.squadBodyMesh.instanceColor.needsUpdate = true;
    if (this.squadBarMesh.instanceColor) this.squadBarMesh.instanceColor.needsUpdate = true;
  }

  /** 建筑渲染：数量少（≤20）保留独立 Mesh，geometry/material 按 buildingId 共享缓存；血条材质因逐建筑变色保持 clone。 */
  private updateBuildingMeshes(): void {
    const activeIds = new Set<string>();

    for (const b of gameState.buildings) {
      activeIds.add(b.id);
      let mesh = this.buildingMeshes.get(b.id);
      const data = getBuildingData(b.buildingId);
      if (!data) continue;

      if (!mesh) {
        let geo = this.buildingGeometries.get(b.buildingId);
        if (!geo) {
          if (b.buildingId === 'building_wall') {
            geo = new THREE.BoxGeometry(1.5, 2, 1.5);
          } else if (b.buildingId === 'building_arrow_tower') {
            geo = new THREE.CylinderGeometry(0.6, 0.8, 3, 8);
          } else {
            geo = new THREE.BoxGeometry(data.size * 1.5, 2, data.size * 1.5);
          }
          this.buildingGeometries.set(b.buildingId, geo);
        }

        let mat = this.buildingMaterials.get(b.buildingId);
        if (!mat) {
          mat = new THREE.MeshStandardMaterial({ color: data.color });
          this.buildingMaterials.set(b.buildingId, mat);
        }

        mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // 血条：材质逐建筑 clone（颜色随血量变化），geometry 共享
        const bar = new THREE.Mesh(this.buildingBarGeometry, this.buildingBarMaterialBase.clone());
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
        const bar = mesh.getObjectByName('healthBar') as THREE.Mesh | undefined;
        if (bar) (bar.material as THREE.MeshBasicMaterial).dispose(); // 克隆材质，per-entity 释放
        this.buildingMeshes.delete(id);
      }
    }
  }

  /** 敌人渲染：body/glow/血条三张 InstancedMesh；朝向主堡（Y 轴旋转），灼烧时 glow 变橙红。 */
  private updateEnemyMeshes(): void {
    let idx = 0;

    for (const en of gameState.enemies) {
      if (idx >= GameRenderer.MAX_ENEMIES) break;
      const data = getEnemyData(en.enemyId);
      if (!data) continue;

      const y = data.size * 0.6;
      // Y 轴朝向主堡（等价原 group.lookAt(0, y, 0) 的水平分量）
      this.tmpEuler.set(0, Math.atan2(-en.position.x, -en.position.z), 0);
      this.tmpQuat.setFromEuler(this.tmpEuler);

      // 主体锥体：单位几何 + per-instance 缩放
      this.tmpVec.set(en.position.x, y, en.position.z);
      this.tmpScale.set(data.size * 0.6, data.size * 1.2, data.size * 0.6);
      this.tmpMatrix.compose(this.tmpVec, this.tmpQuat, this.tmpScale);
      this.enemyBodyMesh.setMatrixAt(idx, this.tmpMatrix);
      this.enemyBodyMesh.setColorAt(idx, this.tmpColor.set(data.color));

      // 夜光晕：灼烧橙红 / 平时类型色（透明度统一 0.25，原 0.2/0.5 两档合并为折中值）
      this.tmpScale.set(data.size * 0.8, data.size * 0.8, data.size * 0.8);
      this.tmpMatrix.compose(this.tmpVec, this.tmpQuat, this.tmpScale);
      this.enemyGlowMesh.setMatrixAt(idx, this.tmpMatrix);
      this.enemyGlowMesh.setColorAt(idx, en.isBurning ? this.tmpColor.set(0xff4400) : this.tmpColor.set(data.color));

      // 血条：红色，平铺，长度随血量
      const ratio = Math.max(0.01, en.health / en.maxHealth);
      this.tmpEuler.set(-Math.PI / 2, 0, 0);
      this.tmpQuat.setFromEuler(this.tmpEuler);
      this.tmpVec.set(en.position.x, data.size + 0.5, en.position.z);
      this.tmpScale.set(ratio, 1, 1);
      this.tmpMatrix.compose(this.tmpVec, this.tmpQuat, this.tmpScale);
      this.enemyBarMesh.setMatrixAt(idx, this.tmpMatrix);

      idx++;
    }

    this.enemyBodyMesh.count = idx;
    this.enemyGlowMesh.count = idx;
    this.enemyBarMesh.count = idx;
    this.enemyBodyMesh.instanceMatrix.needsUpdate = true;
    this.enemyGlowMesh.instanceMatrix.needsUpdate = true;
    this.enemyBarMesh.instanceMatrix.needsUpdate = true;
    if (this.enemyBodyMesh.instanceColor) this.enemyBodyMesh.instanceColor.needsUpdate = true;
    if (this.enemyGlowMesh.instanceColor) this.enemyGlowMesh.instanceColor.needsUpdate = true;
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
    // I1 + 批次一：完整释放场景资源
    for (const id of [...this.buildingMeshes.keys()]) this.removeEntityMesh(id);

    // InstancedMesh：释放 geometry/material（共享资源统一在此销毁）
    for (const mesh of [this.enemyBodyMesh, this.enemyGlowMesh, this.enemyBarMesh,
                        this.squadBodyMesh, this.squadBarMesh, this.squadSelMesh]) {
      if (!mesh) continue;
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.dispose();
    }

    // 建筑共享缓存
    for (const geo of this.buildingGeometries.values()) geo.dispose();
    this.buildingGeometries.clear();
    for (const mat of this.buildingMaterials.values()) mat.dispose();
    this.buildingMaterials.clear();
    this.buildingBarGeometry.dispose();
    this.buildingBarMaterialBase.dispose();

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
