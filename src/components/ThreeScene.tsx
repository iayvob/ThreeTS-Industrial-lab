'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MachineState } from '@/lib/machine/machineState';
import { UR5State } from '@/lib/machine/ur5State';
import {
  startMemoryDiagnostics,
  stopMemoryDiagnostics,
} from '@/lib/machine/memoryDiagnostics';

export interface SceneHandle {
  resetView: () => void;
}

interface ThreeSceneProps {
  onProgress: (_progress: number) => void;
  onLoaded: () => void;
  machineState: MachineState;
  ur5State: UR5State;
  onToggleDoor: () => void;
  onUr5TcpUpdate?: (_coords: { x: number; y: number; z: number }) => void;
}

const ThreeScene = forwardRef<SceneHandle, ThreeSceneProps>(function ThreeScene(
  {
    onProgress,
    onLoaded,
    machineState,
    ur5State,
    onToggleDoor,
    onUr5TcpUpdate,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const resetViewRef = useRef<() => void>(() => undefined);
  const sensorLabelRef = useRef<HTMLDivElement | null>(null);

  // Store callbacks in refs so the heavy useEffect doesn't re-run when they change.
  // This prevents full scene teardown/rebuild on callback identity changes.
  const onProgressRef = useRef(onProgress);
  const onLoadedRef = useRef(onLoaded);
  const onToggleDoorRef = useRef(onToggleDoor);
  const onUr5TcpUpdateRef = useRef(onUr5TcpUpdate);
  onProgressRef.current = onProgress;
  onLoadedRef.current = onLoaded;
  onToggleDoorRef.current = onToggleDoor;
  onUr5TcpUpdateRef.current = onUr5TcpUpdate;

  useImperativeHandle(ref, () => ({
    resetView: () => resetViewRef.current(),
  }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let animationFrameId = 0;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#E8ECF0');

    // Industrial lighting setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5000, -5000, 10000);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-5000, 5000, 5000);
    scene.add(fillLight);

    const grid = new THREE.GridHelper(5000, 50, 0xaaaaaa, 0xcccccc);
    grid.rotation.x = Math.PI / 2;
    grid.position.set(860, 725, 0.5);
    scene.add(grid);

    // Add floor plane for spatial reference
    const floorGeometry = new THREE.PlaneGeometry(30000, 30000);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0xf0f0f0,
      roughness: 0.8,
      metalness: 0.2,
      side: THREE.DoubleSide,
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.position.set(860, 725, -1); // Centered on machine base, just below grid
    floor.receiveShadow = true;
    scene.add(floor);

    // Machine assembly will be added after components are loaded
    const machineGroup = new THREE.Group();
    machineGroup.name = 'VLS6.60_Machine';
    scene.add(machineGroup);

    const camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      1,
      50000
    );
    THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
    camera.up.set(0, 0, 1);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    // Initialize with container size (will be 0 initially, but ResizeObserver will fix it)
    const initialWidth = container.clientWidth || 800; // Fallback to 800px if container has 0 width
    const initialHeight = container.clientHeight || 600; // Fallback to 600px if container has 0 height
    renderer.setSize(initialWidth, initialHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 500;
    controls.maxDistance = 20000;

    const resetCamera = () => {
      // Position camera to view entire machine from optimal angle
      // Machine spans X: 0-1718mm, Y: 0-1451mm, Z: 0-1184mm
      // Center approximately: X=860, Y=725, Z=590
      camera.position.set(2500, -1800, 1800); // Elevated isometric view closer to the machine
      camera.up.set(0, 0, 1);
      controls.target.set(860, 725, 590); // Center of machine volume
      controls.update();
    };
    resetCamera();
    resetViewRef.current = resetCamera;

    // Initialize STL loader and load components
    const loadComponents = async () => {
      // Guard against re-entry on React StrictMode double-mount.
      // Without this, all ~150 MB of STLs would be loaded twice with
      // the first set's geometries orphaned (~600 MB leak).
      if (disposed) return;

      console.log('[ThreeScene] Loading machine components...');
      machineState.initSTLLoader((progress) => {
        onProgressRef.current(0.3 + progress * 0.5); // 30-80% for loading
      });

      try {
        await machineState.loadMachineComponents('/VLS4.60');
        if (disposed) return; // Check again after async

        // Add base assembly (chassis + gantry + laser) if not already present
        // Prevents duplication on re-renders or React StrictMode double-mount
        if (!machineGroup.children.includes(machineState.groupBase)) {
          machineGroup.add(machineState.groupBase);
        }
        // Add door assembly (independent pivot) if not already present
        if (!machineGroup.children.includes(machineState.doorPivot)) {
          machineGroup.add(machineState.doorPivot);
        }

        console.log('[ThreeScene] Machine assembly loaded and added to scene');

        onProgressRef.current(0.85);

        // Load UR5 robot beside the CNC
        try {
          await ur5State.loadRobot('/ur5', (p) => {
            onProgressRef.current(0.85 + p * 0.15);
          });
          if (disposed) return; // Check again after async

          // Position UR5 beside the CNC machine
          // CNC spans roughly X: 0–1718, Y: 0–1451, Z: 0–1184
          // Place UR5 to the right at X=2200 (offset from CNC)
          // UR5 works in metres, CNC in millimetres — UR5 is ~1m tall
          // Scale UR5 group to mm (×1000) so units match
          ur5State.robotGroup.scale.setScalar(1000);
          ur5State.robotGroup.position.set(2200, 700, 0);

          // Add robot to scene if not already present (prevents duplication)
          if (!scene.children.includes(ur5State.robotGroup)) {
            scene.add(ur5State.robotGroup);
          }
          console.log('[ThreeScene] UR5 robot loaded and added to scene');
        } catch (ur5Error) {
          console.error('[ThreeScene] Failed to load UR5:', ur5Error);
        }

        onProgressRef.current(1);
        onLoadedRef.current();

        // Update renderer size after components are loaded
        setTimeout(() => updateSize(), 100);
      } catch (error) {
        console.error('[ThreeScene] Failed to load components:', error);
      }
    };

    loadComponents();

    // Initialize renderer and camera size based on container
    const updateSize = () => {
      if (!containerRef.current) return;

      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;

      // Always update renderer size, even with zero dimensions
      // ResizeObserver will trigger again when container gets real size
      if (width > 0 && height > 0) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
      renderer.setSize(width, height);
    };

    // Cache raycaster and mouse vectors to avoid per-frame allocations
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(-2, -2);
    let hoveredDoor = false;

    const onMouseMove = (event: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObject(
        machineState.groupDoorAssembly,
        true
      );
      hoveredDoor = intersects.length > 0;

      container.style.cursor = hoveredDoor ? 'pointer' : 'auto';
    };

    const onClick = () => {
      if (hoveredDoor) {
        onToggleDoorRef.current();
      }
    };

    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('click', onClick);

    // Reusable Vector3 for sensor label position — allocated once, not per-frame
    const sensorLabelPos = new THREE.Vector3();

    const animate = () => {
      if (disposed) return;
      animationFrameId = requestAnimationFrame(animate);

      // Update machine state for door animation and physics
      machineState.updateFrame(0.016); // ~60fps timestep

      // Update UR5 robot state (TCP tracking)
      if (ur5State.loaded) {
        ur5State.update();
        onUr5TcpUpdateRef.current?.(ur5State.tcpCoords);
      }

      controls.update();
      renderer.render(scene, camera);

      // Update Sensor Label position
      if (sensorLabelRef.current && machineState.vibrationSensorMesh) {
        machineState.vibrationSensorMesh.getWorldPosition(sensorLabelPos);
        sensorLabelPos.y += 10; // offset slightly above the sensor
        sensorLabelPos.project(camera);

        if (sensorLabelPos.z < 1) {
          // Only show if in front of camera
          const x = (sensorLabelPos.x * 0.5 + 0.5) * container.clientWidth;
          const y = (-(sensorLabelPos.y * 0.5) + 0.5) * container.clientHeight;
          sensorLabelRef.current.style.display = 'block';
          sensorLabelRef.current.style.left = `${x}px`;
          sensorLabelRef.current.style.top = `${y}px`;
        } else {
          sensorLabelRef.current.style.display = 'none';
        }
      }
    };

    // Initial size update
    updateSize();
    animate();

    // Use ResizeObserver to detect container size changes
    const resizeObserver = new ResizeObserver(() => {
      updateSize();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Also update size after a delay to catch any layout changes
    const delayedResize = () => updateSize();
    setTimeout(delayedResize, 100);
    setTimeout(delayedResize, 500);
    setTimeout(delayedResize, 1000);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('click', onClick);
      cancelAnimationFrame(animationFrameId);

      // Stop memory diagnostics to prevent console/memory accumulation
      stopMemoryDiagnostics();

      // Proper cleanup to prevent memory leaks
      controls.dispose();

      // Dispose all geometries and materials from machine group BEFORE removing it
      // This is critical because scene.traverse won't reach objects after they're removed
      machineGroup.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          if (object.geometry) {
            object.geometry.dispose();
          }
          if (object.material) {
            if (Array.isArray(object.material)) {
              object.material.forEach((material) => material.dispose());
            } else {
              object.material.dispose();
            }
          }
        }
      });

      // Dispose UR5 robot group separately
      ur5State.robotGroup.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          if (object.geometry) {
            object.geometry.dispose();
          }
          if (object.material) {
            if (Array.isArray(object.material)) {
              object.material.forEach((material) => material.dispose());
            } else {
              object.material.dispose();
            }
          }
        }
      });

      // Dispose remaining scene objects (lights, grid, floor)
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          if (object.geometry) {
            object.geometry.dispose();
          }
          if (object.material) {
            if (Array.isArray(object.material)) {
              object.material.forEach((material) => material.dispose());
            } else {
              object.material.dispose();
            }
          }
        }
      });

      // Now remove groups from scene after all disposal is complete
      // Previously, ur5State.robotGroup was added directly to scene
      // (line 168) but never removed on cleanup, leaking ~221 MB
      // of UR5 geometry per re-mount.
      scene.remove(ur5State.robotGroup);
      scene.remove(machineGroup);

      // Clear all scene children to release references
      while (scene.children.length > 0) {
        scene.remove(scene.children[0]);
      }

      renderer.dispose();

      // Force real WebGL context release — renderer.dispose() alone releases
      // Three.js-tracked resources but does not force the WebGL context to let
      // go of its ~220 MB of resident GPU geometry. Without this, every Fast
      // Refresh / HMR during a long dev session stacks another orphaned
      // context instead of freeing it.
      const gl = renderer.getContext();
      const loseContextExt = gl?.getExtension('WEBGL_lose_context');
      loseContextExt?.loseContext();
      renderer.forceContextLoss();

      renderer.domElement.remove();

      // Clean up machine and robot states (dispose their resources)
      machineState.dispose?.();
      ur5State.dispose?.();
    };
    // Only machineState and ur5State are true dependencies (stable via useMemo).
    // Callbacks are accessed via refs, so they don't need to be in the dep array.
  }, [machineState, ur5State]);

  return (
    <div
      ref={containerRef}
      className="relative z-10 overflow-hidden"
      style={{ width: '100%', height: '100%' }}
    >
      <div
        ref={sensorLabelRef}
        className="absolute pointer-events-none text-xs bg-slate-900/80 text-white px-2 py-1 rounded shadow-lg backdrop-blur-sm transition-opacity duration-200 border border-slate-700/50 font-medium"
        style={{
          display: 'none',
          transform: 'translate(-50%, -100%)',
          marginTop: '-15px',
        }}
      >
        Vibration Sensor
      </div>
    </div>
  );
});

export default ThreeScene;
