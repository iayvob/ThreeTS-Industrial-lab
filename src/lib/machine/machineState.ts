import * as THREE from "three";

import { URDFParser } from "./urdfParser";
import { DHCalculator } from "./dhCalculator";
import { KinematicChain } from "./kinematicChain";
import { STLLoader, LoadedComponent } from "./stlLoader";

const DOOR_MAX_ANGLE_RAD = (80 * Math.PI) / 180; // 80° max opening
const DOOR_SPEED = 1.0;
const DEBUG = false;

export class MachineState {
  en_marche = false;
  mode: "MANUAL" | "AUTOMATIC" | "MAINTENANCE" = "MANUAL";
  position_x = 0;
  position_y = 0;

  puissance_laser = 30;
  laser_actif = false;
  temperature = 22.0;
  porte_progression = 0.0;
  porte_cible = 0.0;

  doorPivot = new THREE.Group();
  groupDoor = new THREE.Group();
  groupBase = new THREE.Group();
  groupGantry = new THREE.Group();
  groupLaser = new THREE.Group();

  gantryBaseY = 0;
  laserBaseX = 0;

  staticObjs: THREE.Object3D[] = [];
  laserMaterial: THREE.MeshStandardMaterial | null = null;

  vibrationSensorMesh: THREE.Mesh | null = null;
  vibrationValue = 0;
  vibrationHistory = new Array<number>(60).fill(0);
  private _vibHead = 0;

  statusLights: Record<"active" | "maintenance" | "warning" | "stop", THREE.Mesh | null> = {
    active: null,
    maintenance: null,
    warning: null,
    stop: null,
  };

  urdfParser = new URDFParser();
  kinematicChain = new KinematicChain();
  kinematicLinks = new Map<string, THREE.Object3D>();

  // STL loading system
  stlLoader: STLLoader | null = null;
  loadedComponents = new Map<string, LoadedComponent>();

  // Component assembly groups for organized scene graph
  groupChassis = new THREE.Group();
  groupDoorAssembly = new THREE.Group();
  groupYGuide = new THREE.Group();
  groupXGuide = new THREE.Group();
  groupTool = new THREE.Group();

  // Component coordinate positions (millimetres, Z-up system)
  // X = right side motion, Y = inside depth motion, Z = upper vertical motion
  componentPositions = {
    chassis: { x: 0, y: 0, z: 0 },          // Foundation at origin
    door: { x: 200.8101, y: 984.711, z: 1150.594 },      // Door position
    yGuide: { x: 84.5391, y: 50.00, z: 895.00 },       // Y-guide rail
    xGuide: { x: 1.0, y: 882.8894, z: 925.00 },            // X-guide rail
    tool: { x: 665.00, y: 837.00, z: 850.00 }            // Tool/laser assembly
  };

  // Axis travel limits (millimetres)
  axisLimits = {
    x: { min: -440, max: 550 },    // X-axis: -440-550mm travel range
    y: { min: -750, max: 0 },    // Y-axis: -750-0mm travel range
  };

  // Motion system configuration
  motionConfig = {
    y: {
      basePosition: 0,           // Y-guide base position
      travelRange: 457,          // Total travel distance
      speed: 1000,               // mm per second (configurable)
      acceleration: 500          // mm per second²
    },
    x: {
      basePosition: 0,           // X-guide base position
      travelRange: 813,          // Total travel distance
      speed: 1200,               // mm per second (faster than Y-axis)
      acceleration: 600          // mm per second²
    },
  };

  private hingeDetermined = false;
  private vibSampleTimer = 0;

  private _loadingPromise: Promise<boolean> | null = null;
  private _isDisposed = false;

  constructor() {
    // Build hierarchical scene structure
    // Base is the foundation containing chassis and gantry
    // Gantry contains Y-guide and laser assembly
    // Laser assembly contains X-guide and tool
    // Door is independent with its own pivot

    this.groupBase.add(this.groupGantry);
    this.groupGantry.add(this.groupLaser);
    this.doorPivot.add(this.groupDoor);

    // Keep compatibility with the original imports.
    void DHCalculator;
  }

  setAssemblyOffsets(offsets: { gantryBaseY: number; laserBaseX: number }) {
    this.gantryBaseY = offsets.gantryBaseY;
    this.laserBaseX = offsets.laserBaseX;
    this.updateTransforms();
  }

  /**
   * Set door target position (0.0 = closed, 1.0 = fully open)
   */
  setDoorTarget(target: number): void {
    this.porte_cible = Math.max(0, Math.min(1, target));
    if (DEBUG) console.log(`[MachineState] Door target set to ${this.porte_cible}`);
  }

  /**
   * Get current door position
   */
  getDoorPosition(): number {
    return this.porte_progression;
  }

  /**
   * Check if door is fully open
   */
  isDoorOpen(): boolean {
    return this.porte_progression > 0.95;
  }

  /**
   * Check if door is fully closed
   */
  isDoorClosed(): boolean {
    return this.porte_progression < 0.05;
  }

  /**
   * Set Y-axis position with limit validation
   */
  setPositionY(value: number): void {
    const clampedValue = Math.max(
      this.axisLimits.y.min,
      Math.min(this.axisLimits.y.max, value)
    );
    this.position_y = clampedValue;
    this.updateTransforms();
    if (DEBUG) console.log(`[MachineState] Y-axis position set to ${this.position_y}mm`);
  }

  /**
   * Get current Y-axis position
   */
  getPositionY(): number {
    return this.position_y;
  }

  /**
   * Set X-axis position with limit validation
   */
  setPositionX(value: number): void {
    const clampedValue = Math.max(
      this.axisLimits.x.min,
      Math.min(this.axisLimits.x.max, value)
    );
    this.position_x = clampedValue;
    this.updateTransforms();
    if (DEBUG) console.log(`[MachineState] X-axis position set to ${this.position_x}mm`);
  }

  /**
   * Get current X-axis position
   */
  getPositionX(): number {
    return this.position_x;
  }

  /**
   * Get axis limits for UI display
   */
  getAxisLimits() {
    return {
      x: this.axisLimits.x,
      y: this.axisLimits.y,
    };
  }

  updateFrame(dt: number) {
    if (Math.abs(this.porte_cible - this.porte_progression) > 1e-6) {
      const step = DOOR_SPEED * dt;
      if (this.porte_cible > this.porte_progression) {
        this.porte_progression = Math.min(this.porte_cible, this.porte_progression + step);
      } else {
        this.porte_progression = Math.max(this.porte_cible, this.porte_progression - step);
      }
    }

    if (this.kinematicChain.joints.has("door_hinge_joint")) {
      const doorAngle = this.porte_progression * DOOR_MAX_ANGLE_RAD;
      this.kinematicChain.setJointValue("door_hinge_joint", doorAngle);
    }

    if (this.porte_progression > 1e-3 && this.laser_actif) {
      this.laser_actif = false;
    }

    const isMachineWorking = this.en_marche && this.laser_actif;

    if (isMachineWorking) {
      let baseVibration = 0.1 + Math.sin(Date.now() * 0.003) * 0.05;
      baseVibration += 0.2 + Math.sin(Date.now() * 0.01) * 0.1;

      // Randomly inject spikes
      const rand = Math.random();
      if (rand < 0.002) {
        // danger spike (very low probability)
        this.vibrationValue = 0.85 + Math.random() * 0.15;
      } else if (rand < 0.01) {
        // warning spike (low probability)
        this.vibrationValue = 0.4 + Math.random() * 0.3;
      } else {
        // Smoothly return to base vibration to make spikes last and look like physical ringing
        this.vibrationValue = this.vibrationValue * 0.9 + baseVibration * 0.1;
      }
    } else {
      this.vibrationValue = 0;
    }

    this.vibSampleTimer += dt;
    if (this.vibSampleTimer >= 0.1) {
      this.vibSampleTimer = 0;
      this.vibrationHistory[this._vibHead] = this.vibrationValue;
      this._vibHead = (this._vibHead + 1) % this.vibrationHistory.length;
    }

    this.updateTransforms();
    this.updateLaserVisuals();
    this.updateVibrationSensor();
    this.updateStatusPanel();
    this.kinematicChain.updateTransforms();
  }


  updateTransforms() {
    if (this.hingeDetermined) {
      const angleRad = -DOOR_MAX_ANGLE_RAD * this.porte_progression;
      this.doorPivot.rotation.set(angleRad, 0, 0);
    }

    // Y-axis motion: moves gantry along depth
    this.groupGantry.position.set(0, this.gantryBaseY + this.position_y, 0);

    // X-axis motion: moves laser head along width
    this.groupLaser.position.set(this.laserBaseX + this.position_x, 0, 0);


  }

  updateLaserVisuals() {
    if (!this.laserMaterial) return;
    const colorHex = this.laser_actif ? 0xff3a10 : 0x2b3a50;
    if (this.laserMaterial.color.getHex() !== colorHex) {
      this.laserMaterial.color.setHex(colorHex);
    }
  }

  updateStatusPanel() {
    if (!this.statusLights.active) return;

    const setLight = (mesh: THREE.Mesh | null, colorHex: number, on: boolean) => {
      if (!mesh) return;
      const mat = mesh.material as THREE.MeshPhongMaterial;
      if (on) {
        mat.color.setHex(colorHex);
        mat.emissive.setHex(colorHex);
        mat.emissiveIntensity = 0.8;
      } else {
        mat.color.setHex(0x222222);
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0;
      }
    };

    const isMachineWorking = this.en_marche && this.laser_actif;
    const isWarning = this.getVibrationStatus() === "warning";
    const isDanger = this.getVibrationStatus() === "danger";
    const isMaintenance = this.mode === "MAINTENANCE";

    const stopActive = !isMachineWorking || isDanger;
    const warningActive = isMachineWorking && isWarning;
    const maintenanceActive = isMachineWorking && isMaintenance && !isDanger;
    const activeRunning = isMachineWorking && !stopActive && !warningActive && !maintenanceActive;

    setLight(this.statusLights.stop, 0xff0000, stopActive);
    setLight(this.statusLights.warning, 0xffaa00, warningActive);
    setLight(this.statusLights.maintenance, 0x0088ff, maintenanceActive);
    setLight(this.statusLights.active, 0x00ff00, activeRunning);
  }

  updateVibrationSensor() {
    if (!this.vibrationSensorMesh) return;
    const mat = this.vibrationSensorMesh.material as THREE.MeshPhongMaterial;

    if (!this.en_marche) {
      mat.color.setHex(0x222222);
      mat.emissive.setHex(0x000000);
      return;
    }

    const status = this.getVibrationStatus();
    if (status === "danger") {
      mat.color.setHex(0xff0000); // Red
      mat.emissive.setHex(0x880000);
    } else if (status === "warning") {
      mat.color.setHex(0xffa500); // Orange
      mat.emissive.setHex(0x884400);
    } else {
      mat.color.setHex(0x00ff00); // Green
      mat.emissive.setHex(0x004400);
    }
  }

  getVibrationStatus() {
    if (this.vibrationValue > 0.8) return "danger" as const;
    if (this.vibrationValue > 0.3) return "warning" as const;
    return "normal" as const;
  }

  togglePower() {
    this.en_marche = !this.en_marche;
    if (!this.en_marche) this.laser_actif = false;
  }

  estop() {
    this.en_marche = false;
    this.laser_actif = false;
    this.porte_cible = 0.0;
  }

  async loadURDF(urdfPath: string) {
    try {
      const response = await fetch(urdfPath);
      const urdfContent = await response.text();
      this.urdfParser.parseURDF(urdfContent);

      this.kinematicChain.buildFromURDF({
        links: this.urdfParser.links,
        joints: this.urdfParser.joints,
      });

      return true;
    } catch (error) {
      console.error("[MachineState] Failed to load URDF:", error);
      return false;
    }
  }

  getURDFMeshFiles() {
    const meshes: Array<{
      linkName: string;
      filename: string;
      material: { color: THREE.Color; opacity: number } | null;
    }> = [];

    for (const [name, link] of this.urdfParser.links) {
      if (link.visual && link.visual.geometry) {
        meshes.push({
          linkName: name,
          filename: link.visual.geometry,
          material: link.visual.material,
        });
      }
    }

    return meshes;
  }

  getJointValueForLink(linkName: string) {
    for (const [jointName, joint] of this.kinematicChain.joints) {
      if (joint.child === linkName) {
        return this.kinematicChain.getJointValue(jointName) || 0;
      }
    }
    return 0;
  }

  /**
   * Initialize STL loader with progress tracking
   */
  initSTLLoader(onProgress?: (_progress: number) => void) {
    // Only reinitialize if there isn't one already to avoid losing state
    if (!this.stlLoader) {
      this.stlLoader = new STLLoader({ onProgress });
    } else if (onProgress) {
      // Re-bind progress callback if re-initializing.
      // Dispose the old loader first to avoid leaking its cached geometry
      // before replacing the reference.
      this.stlLoader.dispose();
      this.stlLoader = new STLLoader({ onProgress });
    }
  }

  /**
   * Assemble machine components into organized groups
   * This method positions each component according to industrial coordinates
   */
  assembleMachineComponents(): void {
    console.log('[MachineState] Assembling machine components...');

    // Clean up old procedural geometries before recreating
    this.disposeSensorAndPanel();

    // Clear existing groups
    this.groupChassis.clear();
    this.groupDoorAssembly.clear();
    this.groupYGuide.clear();
    this.groupXGuide.clear();
    this.groupTool.clear();

    // Organize components into assembly groups
    this.loadedComponents.forEach((component, name) => {
      let targetGroup: THREE.Group;
      let position: { x: number; y: number; z: number };

      switch (name) {
        case 'chassis':
          targetGroup = this.groupChassis;
          position = this.componentPositions.chassis;
          break;
        case 'door':
          targetGroup = this.groupDoorAssembly;
          position = this.componentPositions.door;
          break;
        case 'y-guide':
          targetGroup = this.groupYGuide;
          position = this.componentPositions.yGuide;
          break;
        case 'x-guide':
          targetGroup = this.groupXGuide;
          position = this.componentPositions.xGuide;
          break;
        case 'tool':
          targetGroup = this.groupTool;
          position = this.componentPositions.tool;
          break;
        default:
          console.warn(`[MachineState] Unknown component: ${name}`);
          return;
      }

      // Position the component mesh
      component.mesh.position.set(position.x, position.y, position.z);
      component.mesh.name = name;
      component.mesh.castShadow = true;
      component.mesh.receiveShadow = true;

      // Add to appropriate assembly group
      targetGroup.add(component.mesh);

      console.log(`[MachineState] Positioned ${name} at (${position.x}, ${position.y}, ${position.z})`);
    });

    // Set up hierarchical relationships
    // Chassis and Y-guide are static foundation
    this.groupBase.add(this.groupChassis);
    this.groupBase.add(this.groupYGuide);

    // Gantry moves with Y-axis motion
    // Position gantry base at Y-guide position
    this.gantryBaseY = 0;
    this.groupGantry.add(this.groupXGuide);
    this.groupGantry.add(this.groupLaser);

    // X-guide and tool are part of laser assembly (X-axis motion)
    // Position laser base at X-guide position
    this.laserBaseX = 0;
    this.groupLaser.add(this.groupTool);

    // Door is independent (rotates around hinge)
    this.groupDoor.add(this.groupDoorAssembly);

    // Compute door hinge automatically from door geometry
    this.computeDoorHinge();

    // Initialize motion systems
    this.initializeYAxisMotion();
    this.initializeXAxisMotion();

    // Create physical vibration sensor indicator at the bottom-front of the machine
    const sensorGroup = new THREE.Group();
    sensorGroup.name = "vibration_sensor_assembly";

    // Mounting bracket (dark grey metallic box)
    const bracketGeo = new THREE.BoxGeometry(80, 80, 20);
    const bracketMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      metalness: 0.8,
      roughness: 0.2
    });
    const bracketMesh = new THREE.Mesh(bracketGeo, bracketMat);
    bracketMesh.position.set(0, 0, 10);
    bracketMesh.castShadow = true;
    bracketMesh.receiveShadow = true;
    sensorGroup.add(bracketMesh);

    // Glowing sensor dome (changes color based on vibration level)
    const domeGeo = new THREE.SphereGeometry(25, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    domeGeo.rotateX(Math.PI / 2); // Orient Z-up
    const domeMat = new THREE.MeshPhongMaterial({
      color: 0x00ff00,
      emissive: 0x003300,
      shininess: 100,
      flatShading: true
    });
    const domeMesh = new THREE.Mesh(domeGeo, domeMat);
    domeMesh.position.set(0, 0, 20);
    domeMesh.castShadow = true;
    sensorGroup.add(domeMesh);

    this.vibrationSensorMesh = domeMesh;

    // Position clearly outside on the floor in front of the machine (center X)
    sensorGroup.position.set(1510, 1000, 800);
    sensorGroup.rotateY(Math.PI / 2);
    this.groupChassis.add(sensorGroup);

    // Create CE norm Status Indicator Panel
    const panelGroup = new THREE.Group();
    panelGroup.name = "status_panel_assembly";

    // Panel box: tall along Z, thin along Y, wide along X
    const panelBoxGeo = new THREE.BoxGeometry(60, 20, 240);
    const panelBoxMat = new THREE.MeshStandardMaterial({
      color: 0x333333,
      metalness: 0.5,
      roughness: 0.5
    });
    const panelBox = new THREE.Mesh(panelBoxGeo, panelBoxMat);
    panelBox.position.set(0, 0, 0);
    panelBox.castShadow = true;
    panelBox.receiveShadow = true;
    panelGroup.add(panelBox);

    // Create 4 indicator lights (Stop, Warning, Maintenance, Active)
    const lightNames: Array<keyof typeof this.statusLights> = ["stop", "warning", "maintenance", "active"];
    // Positions from top to bottom (Z axis)
    const zOffsets = [90, 30, -30, -90];

    lightNames.forEach((name, index) => {
      // Cylinder height is 6, pointing along local Y by default (perpendicular to XZ plane).
      // We want the flat circular face to face front (negative Y in our machine space).
      // Since default cylinder has its flat faces along the Y axis, we rotate it around X by 90 deg 
      // so the cylinder body runs along Z, and its flat faces point along Y.
      const finalLightGeo = new THREE.CylinderGeometry(15, 15, 6, 32);
      finalLightGeo.rotateX(Math.PI / 2); // Now flat faces point along Y

      const lightMat = new THREE.MeshPhongMaterial({
        color: 0x222222,
        emissive: 0x000000,
        shininess: 100,
      });
      const lightMesh = new THREE.Mesh(finalLightGeo, lightMat);

      // Position on the front face (negative Y)
      lightMesh.position.set(0, -10, zOffsets[index]);

      panelGroup.add(lightMesh);
      this.statusLights[name] = lightMesh;
    });

    // Position connected directly on the machine chassis front-right edge
    // Right side is around X: 1718, we mount it at X: 1740, Y: 0 (front edge), Z: 900 (upper half)
    panelGroup.position.set(60, 0, 900);
    this.groupChassis.add(panelGroup);

    console.log('[MachineState] Machine assembly complete with status panel');
  }

  /**
   * Disposes of procedurally generated geometries to prevent leaks
   */
  private disposeSensorAndPanel(): void {
    const disposeMesh = (mesh: THREE.Mesh | null | undefined) => {
      if (!mesh) return;
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((mat) => mat.dispose());
        } else {
          mesh.material.dispose();
        }
      }
    };

    // Dispose sensor dome
    disposeMesh(this.vibrationSensorMesh);
    this.vibrationSensorMesh = null;

    // Dispose indicator lights
    disposeMesh(this.statusLights.stop);
    disposeMesh(this.statusLights.warning);
    disposeMesh(this.statusLights.maintenance);
    disposeMesh(this.statusLights.active);
    this.statusLights.stop = null;
    this.statusLights.warning = null;
    this.statusLights.maintenance = null;
    this.statusLights.active = null;

    // Find and dispose the panel box and bracket in the groups
    const disposeProceduralInGroup = (group: THREE.Group, name: string) => {
      const assembly = group.children.find((c) => c.name === name);
      if (assembly) {
        assembly.traverse((child) => {
          if (child instanceof THREE.Mesh) disposeMesh(child);
        });
      }
    };
    disposeProceduralInGroup(this.groupChassis, "vibration_sensor_assembly");
    disposeProceduralInGroup(this.groupChassis, "status_panel_assembly");
  }

  /**
   * Initialize Y-axis motion system
   * Sets up gantry positioning and motion limits
   */
  private initializeYAxisMotion(): void {
    console.log('[MachineState] Initializing Y-axis motion system...');

    // Set initial gantry position based on component positioning
    // Y-guide is positioned at (845.391, 500.00, 8950.00)
    // Gantry moves along Y-axis from this base position

    // Configure motion parameters
    this.position_y = 0; // Start at minimum position
    this.updateTransforms();

    console.log(`[MachineState] Y-axis motion initialized: 0-${this.axisLimits.y.max}mm range`);
  }

  /**
   * Initialize X-axis motion system
   * Sets up laser positioning and motion limits
   */
  private initializeXAxisMotion(): void {
    console.log('[MachineState] Initializing X-axis motion system...');

    // Set initial laser position based on component positioning
    // X-guide is positioned at (10, 10028.894, 9250)
    // Laser assembly moves along X-axis from this base position

    // Configure motion parameters
    this.position_x = 0; // Start at minimum position
    this.updateTransforms();

    console.log(`[MachineState] X-axis motion initialized: 0-${this.axisLimits.x.max}mm range`);
  }



  /**
   * Compute door hinge position from door geometry
   * The hinge runs along the X-axis at the back-top edge of the door
   * (max Y, max Z in world space). The door opens by rotating around
   * this back edge, swinging upward/away from the viewer.
   */
  computeDoorHinge(): void {
    console.log('[MachineState] Computing door hinge from geometry...');

    const doorMesh = this.groupDoorAssembly.children.find(child => child instanceof THREE.Mesh);
    if (!doorMesh || !(doorMesh instanceof THREE.Mesh)) {
      console.warn('[MachineState] No door mesh found for hinge computation');
      return;
    }

    // Ensure world matrix is up to date before accessing matrixWorld
    this.groupDoorAssembly.updateMatrixWorld(true);

    // Compute bounding box in world space
    const box = new THREE.Box3();
    doorMesh.geometry.computeBoundingBox();
    const geoBox = doorMesh.geometry.boundingBox;
    if (!geoBox) {
      console.warn('[MachineState] Door geometry has no bounding box');
      return;
    }

    // Transform bounding box to world space
    const worldGeoBox = geoBox.clone().applyMatrix4(doorMesh.matrixWorld);
    box.union(worldGeoBox);

    if (box.isEmpty()) {
      console.warn('[MachineState] Door bbox empty — no door meshes');
      return;
    }

    // The hinge is at the BACK edge of the door (max Y) at the top (max Z).
    // The hinge line runs along the X axis, so X is centered.
    // Using max Y places the pivot at the rear of the door so it swings
    // upward/away from the front-facing camera, matching a real CNC lid.
    const hingeCenterX = (box.min.x + box.max.x) / 2;
    const hinge = new THREE.Vector3(hingeCenterX, box.max.y, box.max.z);

    this.doorPivot.position.copy(hinge);
    this.groupDoor.position.set(-hinge.x, -hinge.y, -hinge.z);

    this.hingeDetermined = true;
    console.log(`[MachineState] Door hinge computed at (${hinge.x.toFixed(2)}, ${hinge.y.toFixed(2)}, ${hinge.z.toFixed(2)})`);
  }

  /**
   * Load all machine components from STL files
   */
  async loadMachineComponents(
    baseUrl: string = '/VLS4.60'
  ): Promise<boolean> {
    if (this.loadedComponents.size > 0) {
      return true; // Already loaded
    }
    if (this._loadingPromise) {
      return this._loadingPromise; // In progress
    }
    if (!this.stlLoader) {
      console.error('[MachineState] STL loader not initialized');
      return false;
    }

    this._isDisposed = false;
    this._loadingPromise = (async () => {
      try {
        const components = await this.stlLoader!.loadAllComponents(baseUrl);

        if (this._isDisposed) {
          // Disposed while loading, clean up immediately
          components.forEach(c => {
            if (c.mesh.geometry) c.mesh.geometry.dispose();
            if (c.mesh.material) {
              if (Array.isArray(c.mesh.material)) {
                c.mesh.material.forEach(m => m.dispose());
              } else {
                c.mesh.material.dispose();
              }
            }
          });
          return false;
        }

        this.loadedComponents = components;
        console.log('[MachineState] All components loaded successfully');

        // Assemble components into organized structure
        this.assembleMachineComponents();

        return true;
      } catch (error) {
        console.error('[MachineState] Failed to load components:', error);
        return false;
      } finally {
        this._loadingPromise = null;
      }
    })();

    return this._loadingPromise;
  }

  /**
   * Get loaded component by name
   */
  getComponent(name: string): LoadedComponent | undefined {
    return this.loadedComponents.get(name);
  }

  /**
   * Add component mesh to scene group
   */
  addComponentToScene(name: string, group: THREE.Group): boolean {
    const component = this.loadedComponents.get(name);
    if (!component) {
      console.warn(`[MachineState] Component ${name} not found`);
      return false;
    }

    group.add(component.mesh);
    return true;
  }

  /**
   * Dispose all Three.js resources to prevent memory leaks
   * Call this when the machine is no longer needed
   */
  dispose(): void {
    console.log('[MachineState] Disposing machine resources...');
    this._isDisposed = true;
    this._loadingPromise = null;

    // Dispose all loaded components
    this.loadedComponents.forEach((component) => {
      if (component.mesh.geometry) {
        component.mesh.geometry.dispose();
      }
      if (component.mesh.material) {
        if (Array.isArray(component.mesh.material)) {
          component.mesh.material.forEach(mat => mat.dispose());
        } else {
          component.mesh.material.dispose();
        }
      }
    });
    this.loadedComponents.clear();

    // Dispose STL loader resources
    this.stlLoader?.dispose();

    // Dispose scene groups
    [this.groupBase, this.groupGantry, this.groupLaser, this.groupDoor,
    this.doorPivot, this.groupChassis, this.groupDoorAssembly,
    this.groupYGuide, this.groupXGuide, this.groupTool].forEach(group => {
      group.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          if (object.geometry) object.geometry.dispose();
          if (object.material) {
            if (Array.isArray(object.material)) {
              object.material.forEach(mat => mat.dispose());
            } else {
              object.material.dispose();
            }
          }
        }
      });
      group.clear();
    });

    this.disposeSensorAndPanel();

    // Clear maps and arrays
    this.kinematicLinks.clear();
    this.staticObjs = [];
    this.vibrationHistory = [];

    console.log('[MachineState] Machine resources disposed');
  }
}
