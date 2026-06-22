/**
 * UR5 Robot State Manager (Vanilla Three.js)
 * Re-implementation of the React Three Fiber UR5 scene as an imperative Three.js class
 * for integration into the existing CNC lab renderer.
 */

import * as THREE from 'three';
import { STLLoader as ThreeSTLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

/* ─── DH Parameters (from original Scene.tsx) ────────────────────────────── */

const DH_PARAMS = [
  { a: 0.0, alpha: Math.PI / 2, d: 0.0884, color: 0xe8701a }, // J1 orange
  { a: 0.0, alpha: 0.0, d: 0.147, color: 0x2d7dd2 }, // J2 blue
  { a: 0.428, alpha: Math.PI, d: 0.117, color: 0xe81a3d }, // J3 red
  { a: 0.393, alpha: Math.PI / 2, d: 0.096, color: 0xd2b22d }, // J4 yellow
  { a: 0.0, alpha: Math.PI / 2, d: 0.095, color: 0x2dd2b2 }, // J5 teal
  { a: 0.0, alpha: Math.PI / 2, d: 0.04155, color: 0x888888 }, // J6 grey
];

// J3 special: a3 is applied before the d/theta group
// J3 special: a3 is applied before the d/theta group
const A3 = 0.428; // J3 link length

/* ─── RG6 Gripper Kinematics ─────────────────────────────────────────────── */

function computeGripAngles(gripValue: number) {
  const old_min = -43.0;
  const old_max = 35.0;
  const new_min = old_min + 0.10 * (old_max - old_min); // ≈ -35.2°

  const t = Math.max(0, Math.min(100, gripValue)) / 100.0;
  const l_out_deg = new_min + t * (old_max - new_min);
  const l_out_rad = (l_out_deg * Math.PI) / 180;

  return {
    l_out: l_out_rad,
    r_out: -l_out_rad,
    l_tip: -l_out_rad,
    r_tip: l_out_rad,
    l_inner: l_out_rad,
    r_inner: -l_out_rad,
  };
}

/* ─── UR5State Class ─────────────────────────────────────────────────────── */

export class UR5State {
  /** The root group to add to the scene */
  robotGroup = new THREE.Group();

  /** Joint angles in radians */
  joints: number[] = [0, 0, 0, 0, 0, 0];

  /** Gripper value 0–100 */
  gripValue = 50;

  /** TCP world-space coordinates (robot base frame) */
  tcpCoords = { x: 0, y: 0, z: 0 };

  /** Whether STLs have loaded */
  loaded = false;

  private _loadingPromise: Promise<boolean> | null = null;
  private _isDisposed = false;

  // Internal references for joint pivots (for updating rotations)
  private jointPivots: THREE.Group[] = [];

  // Gripper joint references
  private gripperJoints: {
    l_out?: THREE.Group;
    r_out?: THREE.Group;
    l_tip?: THREE.Group;
    r_tip?: THREE.Group;
    l_inner?: THREE.Group;
    r_inner?: THREE.Group;
  } = {};

  // TCP tracker mesh
  private tcpMesh: THREE.Mesh | null = null;
  private tcpWorldPos = new THREE.Vector3();
  private robotWorldPos = new THREE.Vector3();

  private loader = new ThreeSTLLoader();
  private _materials = new Map<number, THREE.MeshStandardMaterial>();

  constructor() {
    this.robotGroup.name = 'UR5_Robot';
  }

  /* ── Load all STL meshes and build kinematic chain ───────────────────── */

  async loadRobot(
    baseUrl: string = '/ur5',
    onProgress?: (_progress: number) => void
  ): Promise<boolean> {
    if (this.loaded) return true;
    if (this._loadingPromise) return this._loadingPromise;

    this._isDisposed = false;
    this._loadingPromise = (async () => {
      try {
        const stlFiles = ['base.stl', 'j1.stl', 'j2.stl', 'j3.stl', 'j4.stl', 'j5.stl', 'j6.stl'];
        const geometries: THREE.BufferGeometry[] = [];

        for (let i = 0; i < stlFiles.length; i++) {
          const geom = await this.loader.loadAsync(`${baseUrl}/${stlFiles[i]}`);
          geom.computeVertexNormals();
          geometries.push(geom);
          onProgress?.((i + 1) / (stlFiles.length + 9)); // +9 for gripper meshes
        }

        // Load gripper meshes
        const gripperFiles = [
          'rg6_meshes/base_link.stl',
          'rg6_meshes/g_main.stl',
          'rg6_meshes/l_out.stl',
          'rg6_meshes/l_tip.stl',
          'rg6_meshes/r_out.stl',
          'rg6_meshes/r_tip.stl',
          'rg6_meshes/l_inner.stl',
          'rg6_meshes/r_inner.stl',
        ];
        const gripperGeoms: THREE.BufferGeometry[] = [];
        for (let i = 0; i < gripperFiles.length; i++) {
          const geom = await this.loader.loadAsync(`${baseUrl}/${gripperFiles[i]}`);
          geom.computeVertexNormals();
          gripperGeoms.push(geom);
          onProgress?.((stlFiles.length + i + 1) / (stlFiles.length + gripperFiles.length));
        }

        if (this._isDisposed) {
          // Clean up if disposed while loading
          geometries.forEach(g => g.dispose());
          gripperGeoms.forEach(g => g.dispose());
          return false;
        }

        // Build robot
        this.buildRobot(geometries, gripperGeoms);
        this.loaded = true;
        onProgress?.(1);

        console.log('[UR5State] Robot loaded successfully');
        return true;
      } catch (error) {
        console.error('[UR5State] Failed to load robot:', error);
        return false;
      } finally {
        this._loadingPromise = null;
      }
    })();

    return this._loadingPromise;
  }

  /* ── Build the kinematic chain from geometries ─────────────────────── */

  private getMaterial(color: number, roughness: number = 0.5, metalness: number = 0.4) {
    if (!this._materials.has(color)) {
      this._materials.set(
        color,
        new THREE.MeshStandardMaterial({
          color,
          roughness,
          metalness,
        })
      );
    }
    return this._materials.get(color)!;
  }

  /* ── Build a base platform to elevate the robot ───────────────────── */

  private buildBasePlatform() {
    // Create a sturdy industrial base platform
    // All dimensions are in METERS (matching robot STLs)
    // Will be scaled by 1000x in ThreeScene to match CNC millimeter units
    const PLATFORM_HEIGHT = 1.15; // 1200mm in meters = 1.2m (will become 1200mm after 1000x scale)

    // Main vertical column/cylinder - tapered for industrial look
    const columnGeometry = new THREE.CylinderGeometry(0.05, 0.10, PLATFORM_HEIGHT, 32);
    const columnMaterial = this.getMaterial(0x4a5568, 0.7, 0.3); // Industrial gray
    const column = new THREE.Mesh(columnGeometry, columnMaterial);
    column.position.set(-0.4, -0.5, (PLATFORM_HEIGHT) / 2);
    column.rotation.x = Math.PI / 2;
    column.castShadow = true;
    column.receiveShadow = true;
    this.robotGroup.add(column);
    // Return the height at which the robot should be mounted
    return PLATFORM_HEIGHT;
  }

  private buildRobot(
    jointGeoms: THREE.BufferGeometry[],
    gripperGeoms: THREE.BufferGeometry[]
  ) {
    // Build base platform first - this creates the stand at z=0
    const platformHeight = this.buildBasePlatform();

    // The whole robot is rotated so Z is up (matching Three.js Y-up → robot Z-up)
    // Robot is mounted on top of the platform
    const zUpGroup = new THREE.Group();
    zUpGroup.rotation.set(-Math.PI / 2, 0, 0);
    zUpGroup.position.set(-0.4, -0.5, platformHeight); // Elevate robot to sit on platform top
    zUpGroup.rotateX(Math.PI / 2); // Rotate 180° around Z to face the correct direction
    this.robotGroup.add(zUpGroup);

    // Base mesh (no joint)
    const baseMaterial = this.getMaterial(0x808080);
    const baseMesh = new THREE.Mesh(jointGeoms[0], baseMaterial);
    baseMesh.scale.setScalar(0.001);
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    zUpGroup.add(baseMesh);

    // Build nested DH chain
    // Each joint: group(position=[0,0,d], rotation=[0,0,theta]) → group(position=[a,0,0], rotation=[alpha,0,0]) → mesh
    // The theta rotation group is what we animate

    let parent: THREE.Object3D = zUpGroup;

    for (let i = 0; i < 6; i++) {
      const dh = DH_PARAMS[i];

      // Special handling matches the original Scene.tsx structure exactly
      if (i === 0) {
        // J1: position=[0,0,d1], rotation=[0,0,theta1]
        const thetaGroup = new THREE.Group();
        thetaGroup.position.set(0, 0, dh.d);
        parent.add(thetaGroup);
        this.jointPivots.push(thetaGroup);

        // alpha group: position=[a1,0,0], rotation=[alpha1,0,0]
        const alphaGroup = new THREE.Group();
        alphaGroup.position.set(dh.a, 0, 0);
        alphaGroup.rotation.set(dh.alpha, 0, 0);
        thetaGroup.add(alphaGroup);

        const mat = this.getMaterial(dh.color);
        const mesh = new THREE.Mesh(jointGeoms[i + 1], mat);
        mesh.scale.setScalar(0.001);
        mesh.rotation.set(-Math.PI / 2, 0, 0);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        alphaGroup.add(mesh);

        parent = alphaGroup;
      } else if (i === 1) {
        // J2: position=[0,0,d2], rotation=[0,0,theta2] → position=[0,0,0], rotation=[0,0,0]
        const thetaGroup = new THREE.Group();
        thetaGroup.position.set(0, 0, dh.d);
        parent.add(thetaGroup);
        this.jointPivots.push(thetaGroup);

        const alphaGroup = new THREE.Group();
        alphaGroup.position.set(0, 0, 0);
        alphaGroup.rotation.set(dh.alpha, 0, 0);
        thetaGroup.add(alphaGroup);

        const mat = this.getMaterial(dh.color);
        const mesh = new THREE.Mesh(jointGeoms[i + 1], mat);
        mesh.scale.setScalar(0.001);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        alphaGroup.add(mesh);

        parent = alphaGroup;
      } else if (i === 2) {
        // J3: position=[a3,0,0], rotation=[alpha3,0,0] → position=[0,0,d3], rotation=[0,0,theta3]
        const preGroup = new THREE.Group();
        preGroup.position.set(A3, 0, 0);
        preGroup.rotation.set(dh.alpha, 0, 0);
        parent.add(preGroup);

        const thetaGroup = new THREE.Group();
        thetaGroup.position.set(0, 0, dh.d);
        preGroup.add(thetaGroup);
        this.jointPivots.push(thetaGroup);

        const mat = this.getMaterial(dh.color);
        const mesh = new THREE.Mesh(jointGeoms[i + 1], mat);
        mesh.scale.setScalar(0.001);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        thetaGroup.add(mesh);

        parent = thetaGroup;
      } else if (i === 3) {
        // J4: position=[a4,0,0], rotation=[0,PI,0] → position=[0,0,d4], rotation=[0,0,theta4]
        const preGroup = new THREE.Group();
        preGroup.position.set(dh.a, 0, 0);
        preGroup.rotation.set(0, Math.PI, 0);
        parent.add(preGroup);

        const thetaGroup = new THREE.Group();
        thetaGroup.position.set(0, 0, dh.d);
        preGroup.add(thetaGroup);
        this.jointPivots.push(thetaGroup);

        const mat = this.getMaterial(dh.color);
        const mesh = new THREE.Mesh(jointGeoms[i + 1], mat);
        mesh.scale.setScalar(0.001);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        thetaGroup.add(mesh);

        parent = thetaGroup;
      } else if (i === 4) {
        // J5: position=[a5,0,0], rotation=[alpha5,0,0] → position=[0,0,d5], rotation=[0,0,theta5]
        const alphaGroup = new THREE.Group();
        alphaGroup.position.set(dh.a, 0, 0);
        alphaGroup.rotation.set(dh.alpha, 0, 0);
        parent.add(alphaGroup);

        const thetaGroup = new THREE.Group();
        thetaGroup.position.set(0, 0, dh.d);
        alphaGroup.add(thetaGroup);
        this.jointPivots.push(thetaGroup);

        const mat = this.getMaterial(dh.color);
        const mesh = new THREE.Mesh(jointGeoms[i + 1], mat);
        mesh.scale.setScalar(0.001);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        thetaGroup.add(mesh);

        parent = thetaGroup;
      } else if (i === 5) {
        // J6: position=[a6,0,0], rotation=[alpha6,0,0] → position=[0,0,d6], rotation=[0,0,theta6]
        const alphaGroup = new THREE.Group();
        alphaGroup.position.set(dh.a, 0, 0);
        alphaGroup.rotation.set(dh.alpha, 0, 0);
        parent.add(alphaGroup);

        const thetaGroup = new THREE.Group();
        thetaGroup.position.set(0, 0, dh.d);
        alphaGroup.add(thetaGroup);
        this.jointPivots.push(thetaGroup);

        const mat = this.getMaterial(dh.color);
        const mesh = new THREE.Mesh(jointGeoms[i + 1], mat);
        mesh.scale.setScalar(0.001);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        thetaGroup.add(mesh);

        // Add TCP tracker sphere
        const tcpGeom = new THREE.SphereGeometry(0.015, 16, 16);
        const tcpMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        this.tcpMesh = new THREE.Mesh(tcpGeom, tcpMat);
        this.tcpMesh.position.set(0, 0, 0.32);
        thetaGroup.add(this.tcpMesh);

        // Build gripper and attach to J6
        this.buildGripper(gripperGeoms, thetaGroup);

        parent = thetaGroup;
      }
    }
  }

  /* ── Build RG6 gripper ─────────────────────────────────────────────── */

  private buildGripper(geoms: THREE.BufferGeometry[], parent: THREE.Object3D) {
    const gripperRoot = new THREE.Group();
    gripperRoot.position.set(0, 0, 0.03);
    parent.add(gripperRoot);

    const colors = {
      base: 0x2d3748,
      body: 0x4a5568,
      left: 0xdd6b20,
      right: 0xe53e3e,
      finger: 0xcbd5e0,
    };

    // base_link (index 0)
    const baseMesh = new THREE.Mesh(
      geoms[0],
      this.getMaterial(colors.base, 0.4, 0.2)
    );
    baseMesh.scale.setScalar(0.001);
    baseMesh.castShadow = true;
    gripperRoot.add(baseMesh);

    // g_main (index 1) — fixed joint offset
    const gMainGroup = new THREE.Group();
    gMainGroup.position.set(-0.031849, 0.000001, 0.04953);
    gripperRoot.add(gMainGroup);

    const gMainMesh = new THREE.Mesh(
      geoms[1],
      this.getMaterial(colors.body, 0.4, 0.2)
    );
    gMainMesh.scale.setScalar(0.001);
    gMainMesh.position.set(0.031849, -0.000001, -0.04953);
    gMainMesh.castShadow = true;
    gMainGroup.add(gMainMesh);

    // l_out (index 2) — joint pivot Y axis
    const lOutGroup = new THREE.Group();
    lOutGroup.position.set(0.0557, 0.0128, 0.085);
    gMainGroup.add(lOutGroup);
    this.gripperJoints.l_out = lOutGroup;

    const lOutMesh = new THREE.Mesh(
      geoms[2],
      this.getMaterial(colors.left, 0.3)
    );
    lOutMesh.scale.setScalar(0.001);
    lOutMesh.position.set(-0.023851, -0.012801, -0.13453);
    lOutMesh.castShadow = true;
    lOutGroup.add(lOutMesh);

    // l_tip (index 3) — inside l_out
    const lTipGroup = new THREE.Group();
    lTipGroup.position.set(0.047384, -0.0253, 0.06442);
    lOutGroup.add(lTipGroup);
    this.gripperJoints.l_tip = lTipGroup;

    const lTipMesh = new THREE.Mesh(
      geoms[3],
      this.getMaterial(colors.finger, 0.5)
    );
    lTipMesh.scale.setScalar(0.001);
    lTipMesh.position.set(-0.071235, 0.012499, -0.19895);
    lTipMesh.castShadow = true;
    lTipGroup.add(lTipMesh);

    // r_out (index 4) — joint pivot Y axis
    const rOutGroup = new THREE.Group();
    rOutGroup.position.set(0.0081, 0.0128, 0.085);
    gMainGroup.add(rOutGroup);
    this.gripperJoints.r_out = rOutGroup;

    const rOutMesh = new THREE.Mesh(
      geoms[4],
      this.getMaterial(colors.right, 0.3)
    );
    rOutMesh.scale.setScalar(0.001);
    rOutMesh.position.set(0.023749, -0.012801, -0.13453);
    rOutMesh.castShadow = true;
    rOutGroup.add(rOutMesh);

    // r_tip (index 5) — inside r_out
    const rTipGroup = new THREE.Group();
    rTipGroup.position.set(-0.047384, -0.0253, 0.064494);
    rOutGroup.add(rTipGroup);
    this.gripperJoints.r_tip = rTipGroup;

    const rTipMesh = new THREE.Mesh(
      geoms[5],
      this.getMaterial(colors.finger, 0.5)
    );
    rTipMesh.scale.setScalar(0.001);
    rTipMesh.position.set(0.071133, 0.012499, -0.199024);
    rTipMesh.castShadow = true;
    rTipGroup.add(rTipMesh);

    // l_inner (index 6) — passive
    const lInnerGroup = new THREE.Group();
    lInnerGroup.position.set(0.0424, 0.0001, 0.1081);
    gMainGroup.add(lInnerGroup);
    this.gripperJoints.l_inner = lInnerGroup;

    const lInnerMesh = new THREE.Mesh(
      geoms[6],
      this.getMaterial(colors.finger, 0.5)
    );
    lInnerMesh.scale.setScalar(0.001);
    lInnerMesh.position.set(-0.010551, -0.000101, -0.15763);
    lInnerMesh.castShadow = true;
    lInnerGroup.add(lInnerMesh);

    // r_inner (index 7) — passive
    const rInnerGroup = new THREE.Group();
    rInnerGroup.position.set(0.0214, 0.0001, 0.1081);
    gMainGroup.add(rInnerGroup);
    this.gripperJoints.r_inner = rInnerGroup;

    const rInnerMesh = new THREE.Mesh(
      geoms[7],
      this.getMaterial(colors.finger, 0.5)
    );
    rInnerMesh.scale.setScalar(0.001);
    rInnerMesh.position.set(0.010449, -0.000101, -0.15763);
    rInnerMesh.castShadow = true;
    rInnerGroup.add(rInnerMesh);
  }

  /* ── Public setters ────────────────────────────────────────────────── */

  setJoint(index: number, angleRad: number) {
    if (index < 0 || index > 5) return;
    this.joints[index] = angleRad;
    this.applyJoints();
  }

  setAllJoints(angles: number[]) {
    for (let i = 0; i < 6; i++) {
      this.joints[i] = angles[i] ?? 0;
    }
    this.applyJoints();
  }

  setGripValue(value: number) {
    this.gripValue = Math.max(0, Math.min(100, value));
    this.applyGripper();
  }

  /* ── Apply current state to Three.js objects ───────────────────────── */

  private applyJoints() {
    for (let i = 0; i < this.jointPivots.length; i++) {
      const pivot = this.jointPivots[i];
      if (pivot) {
        pivot.rotation.z = this.joints[i];
      }
    }
  }

  private applyGripper() {
    const angles = computeGripAngles(this.gripValue);

    if (this.gripperJoints.l_out) this.gripperJoints.l_out.rotation.y = angles.l_out;
    if (this.gripperJoints.r_out) this.gripperJoints.r_out.rotation.y = angles.r_out;
    if (this.gripperJoints.l_tip) this.gripperJoints.l_tip.rotation.y = angles.l_tip;
    if (this.gripperJoints.r_tip) this.gripperJoints.r_tip.rotation.y = angles.r_tip;
    if (this.gripperJoints.l_inner) this.gripperJoints.l_inner.rotation.y = angles.l_inner;
    if (this.gripperJoints.r_inner) this.gripperJoints.r_inner.rotation.y = angles.r_inner;
  }

  /* ── Update (call each frame) ──────────────────────────────────────── */

  update() {
    if (!this.loaded || !this.tcpMesh) return;

    // Get TCP world position
    this.tcpMesh.getWorldPosition(this.tcpWorldPos);

    // Convert from Three.js (Y-up) to robot base frame (Z-up):
    // Robot X = scene X, Robot Y = -scene Z, Robot Z = scene Y
    // But the robotGroup itself might be positioned, so we get relative coords
    this.robotGroup.getWorldPosition(this.robotWorldPos);

    const relX = this.tcpWorldPos.x - this.robotWorldPos.x;
    const relY = this.tcpWorldPos.y - this.robotWorldPos.y;
    const relZ = this.tcpWorldPos.z - this.robotWorldPos.z;

    // After the -PI/2 X rotation: scene Y ↔ -robot_Z, scene Z ↔ robot_Y
    // Actually, the zUpGroup already handles the conversion, so TCP world pos
    // is in Three.js Y-up space. Converting back to robot base frame:
    this.tcpCoords.x = relX;
    this.tcpCoords.y = -relZ;
    this.tcpCoords.z = relY;
  }

  /**
   * Dispose all Three.js resources to prevent memory leaks
   * Call this when the robot is no longer needed
   */
  dispose(): void {
    console.log('[UR5State] Disposing robot resources...');
    this._isDisposed = true;
    this._loadingPromise = null;

    // Dispose all geometries and materials in the robot group
    this.robotGroup.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        if (object.geometry) {
          object.geometry.dispose();
        }
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach(mat => mat.dispose());
          } else {
            object.material.dispose();
          }
        }
      }
    });

    // Clear arrays and objects
    this.robotGroup.clear();
    this._materials.clear();
    this.jointPivots = [];
    this.gripperJoints = {};
    this.joints = [0, 0, 0, 0, 0, 0];

    console.log('[UR5State] Robot resources disposed');
  }
}
