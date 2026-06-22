import * as THREE from "three";

export interface URDFOrigin {
  position: THREE.Vector3;
  rotation: THREE.Euler;
}

export interface URDFLinkVisual {
  origin: URDFOrigin;
}

export interface URDFLink {
  visual: URDFLinkVisual | null;
}

export interface URDFJoint {
  type: string;
  parent: string | null;
  child: string | null;
  origin: URDFOrigin;
  axis: THREE.Vector3;
  limit: { lower: number; upper: number } | null;
}

export class KinematicChain {
  links = new Map<
    string,
    {
      mesh: THREE.Mesh | null;
      parent: string | null;
      joint: string | null;
      initialTransform: THREE.Matrix4;
    }
  >();
  joints = new Map<
    string,
    {
      name: string;
      type: string;
      parent: string | null;
      child: string | null;
      origin: THREE.Matrix4;
      axis: THREE.Vector3;
      limits: { lower: number; upper: number } | null;
      currentValue: number;
    }
  >();
  baseFrame: string | null = null;

  // Pre-allocated scratch objects — reused every frame to avoid GC pressure.
  // calculateLinkTransform was previously allocating 4-5 objects per joint per
  // frame (~600 allocs/sec), causing heap fragmentation that grew to tens of GB.
  private _scratchTransform = new THREE.Matrix4();
  private _scratchJointRotation = new THREE.Matrix4();
  private _scratchQuat = new THREE.Quaternion();
  private _scratchAxis = new THREE.Vector3();

  buildFromURDF(urdfData: { links: Map<string, URDFLink>; joints: Map<string, URDFJoint> }) {
    this.links.clear();
    this.joints.clear();

    for (const [linkName, linkData] of urdfData.links) {
      this.links.set(linkName, {
        mesh: null,
        parent: null,
        joint: null,
        initialTransform: linkData.visual ? this.originToMatrix(linkData.visual.origin) : new THREE.Matrix4(),
      });
    }

    for (const [jointName, jointData] of urdfData.joints) {
      this.joints.set(jointName, {
        name: jointName,
        type: jointData.type,
        parent: jointData.parent,
        child: jointData.child,
        origin: this.originToMatrix(jointData.origin),
        axis: jointData.axis,
        limits: jointData.limit,
        currentValue: 0,
      });

      if (jointData.child) {
        const link = this.links.get(jointData.child);
        if (link) {
          link.parent = jointData.parent;
          link.joint = jointName;
        }
      }
    }

    for (const [linkName, link] of this.links) {
      if (!link.parent) {
        this.baseFrame = linkName;
        break;
      }
    }
  }

  originToMatrix(origin: URDFOrigin) {
    const matrix = new THREE.Matrix4();
    matrix.makeRotationFromEuler(origin.rotation);
    matrix.setPosition(origin.position.x, origin.position.y, origin.position.z);
    return matrix;
  }

  registerLinkMesh(linkName: string, mesh: THREE.Mesh) {
    const link = this.links.get(linkName);
    if (!link) {
      console.warn(`[KinematicChain] Link ${linkName} not found`);
      return;
    }

    link.mesh = mesh;
    mesh.matrix.copy(link.initialTransform);
    mesh.matrixAutoUpdate = false;
  }

  updateTransforms() {
    for (const [, link] of this.links) {
      if (!link.joint) continue;
      const joint = this.joints.get(link.joint);
      if (!joint) continue;

      const transform = this.calculateLinkTransform(link, joint, joint.currentValue);
      if (link.mesh) {
        link.mesh.matrix.copy(transform);
      }
    }
  }

  calculateLinkTransform(
    link: { parent: string | null; mesh: THREE.Mesh | null; initialTransform: THREE.Matrix4 },
    joint: { type: string; origin: THREE.Matrix4; axis: THREE.Vector3 },
    jointValue: number
  ) {
    const transform = this._scratchTransform.identity();

    if (link.parent) {
      const parentLink = this.links.get(link.parent);
      if (parentLink?.mesh) {
        transform.copy(parentLink.mesh.matrix);
      }
    }

    transform.multiply(joint.origin);

    if (joint.type === "revolute" || joint.type === "continuous") {
      this._scratchAxis.copy(joint.axis).normalize();
      this._scratchQuat.setFromAxisAngle(this._scratchAxis, jointValue);
      this._scratchJointRotation.makeRotationFromQuaternion(this._scratchQuat);
      transform.multiply(this._scratchJointRotation);
    }

    transform.multiply(link.initialTransform);
    return transform;
  }

  setJointValue(jointName: string, value: number) {
    const joint = this.joints.get(jointName);
    if (!joint) return;

    if (joint.limits) {
      value = Math.max(joint.limits.lower, Math.min(joint.limits.upper, value));
    }

    joint.currentValue = value;
  }

  getJointValue(jointName: string) {
    return this.joints.get(jointName)?.currentValue ?? 0;
  }

  getJointLimits(jointName: string) {
    return this.joints.get(jointName)?.limits ?? null;
  }
}
