/**
 * Industrial STL Loader for VLS6.60 Machine Components
 * Uses Three.js built-in STLLoader for reliable binary/ASCII format detection
 */

import * as THREE from 'three';
import { STLLoader as ThreeSTLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

export interface STLLoadOptions {
    baseUrl?: string;
    onProgress?: (_progress: number) => void;
    onError?: (_error: Error) => void;
}

export interface LoadedComponent {
    name: string;
    mesh: THREE.Mesh;
    material: THREE.Material;
    originalPosition: THREE.Vector3;
    boundingBox: THREE.Box3;
}

export class STLLoader {
    private materials: Map<string, THREE.Material> = new Map();
    private threeLoader: ThreeSTLLoader;
    private onProgressCallback?: (_progress: number) => void;

    constructor(options?: STLLoadOptions) {
        const loadingManager = new THREE.LoadingManager();

        if (options?.onProgress) {
            this.onProgressCallback = options.onProgress;
            loadingManager.onProgress = (_url, loaded, total) => {
                const progress = loaded / total;
                options.onProgress!(progress);
            };
        }

        if (options?.onError) {
            loadingManager.onError = (url) => {
                options.onError?.(new Error(`Failed to load: ${url}`));
            };
        }

        this.threeLoader = new ThreeSTLLoader(loadingManager);
        this.initializeMaterials();
    }

    /**
     * Initialize industrial material palette
     */
    private initializeMaterials() {
        // Steel grey - main structural components
        this.materials.set('steel', new THREE.MeshStandardMaterial({
            color: 0x4a5568,
            metalness: 0.8,
            roughness: 0.4,
            side: THREE.FrontSide
        }));

        // Aluminum - lighter components
        this.materials.set('aluminum', new THREE.MeshStandardMaterial({
            color: 0x8899aa,
            metalness: 0.9,
            roughness: 0.3,
            side: THREE.FrontSide
        }));

        // Safety orange - moving parts/guards
        this.materials.set('safety-orange', new THREE.MeshStandardMaterial({
            color: 0xff6b00,
            metalness: 0.3,
            roughness: 0.6,
            side: THREE.FrontSide
        }));

        // Dark grey - base/foundation
        this.materials.set('dark-grey', new THREE.MeshStandardMaterial({
            color: 0x2d3748,
            metalness: 0.6,
            roughness: 0.5,
            side: THREE.FrontSide
        }));

        // Chrome - precision surfaces
        this.materials.set('chrome', new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            metalness: 1.0,
            roughness: 0.1,
            side: THREE.FrontSide
        }));

        // Industrial yellow - safety components
        this.materials.set('industrial-yellow', new THREE.MeshStandardMaterial({
            color: 0xffc800,
            metalness: 0.4,
            roughness: 0.5,
            side: THREE.FrontSide
        }));
    }

    /**
     * Get material by name
     */
    getMaterial(name: string): THREE.Material {
        return this.materials.get(name) || this.materials.get('steel')!;
    }

    /**
     * Load STL file from URL using Three.js built-in STLLoader
     * Correctly handles both binary and ASCII STL by inspecting file content
     */
    async loadSTL(
        url: string,
        componentName: string,
        materialName: string = 'steel'
    ): Promise<LoadedComponent> {
        try {
            const geometry = await this.threeLoader.loadAsync(url);

            geometry.computeVertexNormals();

            const material = this.getMaterial(materialName);
            const mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            geometry.computeBoundingBox();
            const boundingBox = new THREE.Box3().setFromObject(mesh);

            // console.log(`[STLLoader] ${componentName}: ${geometry.attributes.position.count} vertices loaded`);

            return {
                name: componentName,
                mesh,
                material,
                originalPosition: mesh.position.clone(),
                boundingBox
            };
        } catch (error) {
            console.error(`[STLLoader] Failed to load ${componentName}:`, error);
            throw error;
        }
    }

    /**
     * Load all machine components
     */
    async loadAllComponents(baseUrl: string): Promise<Map<string, LoadedComponent>> {
        const components = new Map<string, LoadedComponent>();

        // Component definitions with their materials
        // Filenames must match exact casing on disk (.STL vs .stl)
        const componentSpecs = [
            { name: 'chassis', file: 'chasis.STL', material: 'dark-grey' },
            { name: 'door', file: 'dor.stl', material: 'safety-orange' },
            { name: 'y-guide', file: 'y-guide.STL', material: 'steel' },
            { name: 'x-guide', file: 'x-guide.stl', material: 'aluminum' },
            { name: 'tool', file: 'tool.stl', material: 'chrome' }
        ];

        const total = componentSpecs.length;

        for (let i = 0; i < componentSpecs.length; i++) {
            const spec = componentSpecs[i];
            try {
                const url = `${baseUrl}/${spec.file}`;
                const component = await this.loadSTL(url, spec.name, spec.material);
                components.set(spec.name, component);
                console.log(`[STLLoader] Loaded ${spec.name} successfully`);

                // Report per-component progress
                this.onProgressCallback?.((i + 1) / total);
            } catch (error) {
                console.error(`[STLLoader] Failed to load ${spec.name}:`, error);
                throw error;
            }
        }

        return components;
    }

    /**
     * Clean up resources
     */
    dispose(): void {
        this.materials.forEach(material => {
            if (material instanceof THREE.Material) {
                material.dispose();
            }
        });
        this.materials.clear();
    }
}

/**
 * Component positioner for precise coordinate placement
 */
export class ComponentPositioner {
    /**
     * Position component at exact coordinates
     */
    static positionComponent(
        component: LoadedComponent,
        position: THREE.Vector3,
        rotation: THREE.Euler = new THREE.Euler(0, 0, 0)
    ): void {
        component.mesh.position.copy(position);
        component.mesh.rotation.copy(rotation);
        component.mesh.updateMatrix();
    }

    /**
     * Create kinematic hierarchy for motion
     */
    static createMotionGroup(
        parent: THREE.Object3D,
        axis: 'X' | 'Y' | 'Z'
    ): THREE.Group {
        const group = new THREE.Group();
        group.name = `${axis}AxisGroup`;
        parent.add(group);
        return group;
    }

    /**
     * Calculate component offset from bounding box
     */
    static calculateComponentOffset(component: LoadedComponent): THREE.Vector3 {
        const box = component.boundingBox;
        const center = new THREE.Vector3();
        box.getCenter(center);
        return center;
    }
}