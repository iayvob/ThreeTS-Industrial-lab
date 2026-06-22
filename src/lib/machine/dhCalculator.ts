import * as THREE from "three";

export class DHCalculator {
  static standardDH(theta: number, d: number, a: number, alpha: number) {
    const matrix = new THREE.Matrix4();

    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    const ca = Math.cos(alpha);
    const sa = Math.sin(alpha);

    matrix.set(
      ct,
      -st * ca,
      st * sa,
      a * ct,
      st,
      ct * ca,
      -ct * sa,
      a * st,
      0,
      sa,
      ca,
      d,
      0,
      0,
      0,
      1
    );

    return matrix;
  }

  static modifiedDH(alpha: number, a: number, theta: number, d: number) {
    const matrix = new THREE.Matrix4();

    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    const ca = Math.cos(alpha);
    const sa = Math.sin(alpha);

    matrix.set(
      ct,
      -st,
      0,
      a,
      st * ca,
      ct * ca,
      -sa,
      -d * sa,
      st * sa,
      ct * sa,
      ca,
      d * ca,
      0,
      0,
      0,
      1
    );

    return matrix;
  }

  static forwardKinematics(
    dhParams: Array<{ theta: number; d: number; a: number; alpha: number }>,
    jointValues: number[],
    useModified = false
  ) {
    const transforms: THREE.Matrix4[] = [];
    const cumulativeTransform = new THREE.Matrix4();

    for (let i = 0; i < dhParams.length; i += 1) {
      const params = dhParams[i];
      const theta = jointValues[i] !== undefined ? jointValues[i] : params.theta;
      const d = params.d || 0;
      const a = params.a || 0;
      const alpha = params.alpha || 0;

      const jointTransform = useModified
        ? this.modifiedDH(alpha, a, theta, d)
        : this.standardDH(theta, d, a, alpha);

      cumulativeTransform.multiply(jointTransform);
      transforms.push(cumulativeTransform.clone());
    }

    return transforms;
  }

  static extractPosition(matrix: THREE.Matrix4) {
    return new THREE.Vector3(matrix.elements[12], matrix.elements[13], matrix.elements[14]);
  }

  static extractRotation(matrix: THREE.Matrix4) {
    const rotation = new THREE.Matrix4();
    rotation.copy(matrix);
    rotation.setPosition(0, 0, 0);

    const euler = new THREE.Euler();
    euler.setFromRotationMatrix(rotation);

    return euler;
  }

  static distance(point1: THREE.Vector3, point2: THREE.Vector3) {
    return point1.distanceTo(point2);
  }

  static calculateJacobian(transforms: THREE.Matrix4[]) {
    const n = transforms.length;
    const jacobian: number[][] = [];

    for (let i = 0; i < n; i += 1) {
      const jointColumn: number[] = [];
      const transform = transforms[i];
      const position = this.extractPosition(transform);

      for (let j = 0; j < n; j += 1) {
        if (j <= i) {
          const axis = new THREE.Vector3(0, 0, 1);
          axis.applyMatrix4(transforms[j]);

          const cross = new THREE.Vector3();
          cross.crossVectors(axis, position.clone().sub(this.extractPosition(transforms[j])));

          jointColumn.push(cross.x, cross.y, cross.z, axis.x, axis.y, axis.z);
        } else {
          jointColumn.push(0, 0, 0, 0, 0, 0);
        }
      }
      jacobian.push(jointColumn);
    }

    return jacobian;
  }
}
