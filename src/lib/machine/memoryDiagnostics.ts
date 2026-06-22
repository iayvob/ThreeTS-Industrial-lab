import * as THREE from 'three';

let intervalId: number | null = null;
let enabled = false;

interface MemoryStats {
  geometries: number;
  textures: number;
  triangles: number;
  lines: number;
  points: number;
  sceneChildren: number;
  heapUsedMb: string;
}

/**
 * Counts total children in a scene recursively
 */
const countSceneChildren = (scene: THREE.Scene): number => {
  let count = 0;
  scene.traverse(() => {
    count++;
  });
  return count;
};

/**
 * Gets formatted memory stats
 */
export const getMemoryStats = (renderer: THREE.WebGLRenderer, scene: THREE.Scene): MemoryStats => {
  const info = renderer.info;
  
  // Try to get JS heap size (Chrome only)
  let heapUsedMb = "N/A";
  if ('memory' in performance) {
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    if (mem) {
      heapUsedMb = (mem.usedJSHeapSize / (1024 * 1024)).toFixed(1);
    }
  }

  return {
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    triangles: info.render.triangles,
    lines: info.render.lines,
    points: info.render.points,
    sceneChildren: countSceneChildren(scene),
    heapUsedMb
  };
};

/**
 * Starts periodic memory diagnostic logging
 */
export const startMemoryDiagnostics = (
  renderer: THREE.WebGLRenderer, 
  scene: THREE.Scene, 
  intervalMs = 5000
) => {
  if (enabled) return;
  enabled = true;
  
  console.log('[MemDiag] Memory diagnostics started');
  
  intervalId = window.setInterval(() => {
    const stats = getMemoryStats(renderer, scene);
    console.log(
      `[MemDiag] Geo: ${stats.geometries} | Tex: ${stats.textures} | Tri: ${(stats.triangles / 1000000).toFixed(1)}M | ` +
      `Scene Obj: ${stats.sceneChildren} | Heap: ${stats.heapUsedMb} MB`
    );
  }, intervalMs);
};

/**
 * Stops memory diagnostics
 */
export const stopMemoryDiagnostics = () => {
  if (intervalId !== null) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
  enabled = false;
  console.log('[MemDiag] Memory diagnostics stopped');
};
