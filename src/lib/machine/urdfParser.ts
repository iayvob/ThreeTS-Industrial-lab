import * as THREE from "three";

export interface URDFOrigin {
  position: THREE.Vector3;
  rotation: THREE.Euler;
}

export interface URDFVisual {
  origin: URDFOrigin;
  geometry: string | null;
  material: { color: THREE.Color; opacity: number } | null;
}

export interface URDFInertial {
  origin: URDFOrigin;
  mass: number;
  inertia: {
    ixx: number;
    ixy: number;
    ixz: number;
    iyy: number;
    iyz: number;
    izz: number;
  };
}

export interface URDFLink {
  name: string;
  visual: URDFVisual | null;
  inertial: URDFInertial | null;
}

export interface URDFJoint {
  name: string;
  type: string;
  origin: URDFOrigin;
  parent: string | null;
  child: string | null;
  axis: THREE.Vector3;
  limit: {
    lower: number;
    upper: number;
    effort: number;
    velocity: number;
  } | null;
}

export class URDFParser {
  links = new Map<string, URDFLink>();
  joints = new Map<string, URDFJoint>();
  baseLink: string | null = null;

  parseURDF(urdfContent: string) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(urdfContent, "text/xml");
    const robot = xmlDoc.querySelector("robot");

    if (!robot) {
      throw new Error("No robot element found in URDF");
    }

    const linkElements = robot.querySelectorAll("link");
    linkElements.forEach((linkEl) => {
      const link = this.parseLink(linkEl);
      this.links.set(link.name, link);
      if (!this.baseLink) {
        this.baseLink = link.name;
      }
    });

    const jointElements = robot.querySelectorAll("joint");
    jointElements.forEach((jointEl) => {
      const joint = this.parseJoint(jointEl);
      this.joints.set(joint.name, joint);
    });
  }

  parseLink(linkEl: Element): URDFLink {
    const name = linkEl.getAttribute("name") ?? "";
    const visualEl = linkEl.querySelector("visual");
    const inertialEl = linkEl.querySelector("inertial");

    const link: URDFLink = {
      name,
      visual: null,
      inertial: null,
    };

    if (visualEl) {
      link.visual = this.parseVisual(visualEl);
    }

    if (inertialEl) {
      link.inertial = this.parseInertial(inertialEl);
    }

    return link;
  }

  parseVisual(visualEl: Element): URDFVisual {
    const originEl = visualEl.querySelector("origin");
    const geometryEl = visualEl.querySelector("geometry");
    const materialEl = visualEl.querySelector("material");

    const visual: URDFVisual = {
      origin: this.parseOrigin(originEl),
      geometry: null,
      material: null,
    };

    if (geometryEl) {
      const meshEl = geometryEl.querySelector("mesh");
      if (meshEl) {
        const filename = meshEl.getAttribute("filename");
        if (filename) {
          visual.geometry = filename.replace(
            "package://machine laser_single.sldasm/meshes/",
            "/VLS4.60/sldasm/meshes/"
          );
        }
      }
    }

    if (materialEl) {
      visual.material = this.parseMaterial(materialEl);
    }

    return visual;
  }

  parseOrigin(originEl: Element | null): URDFOrigin {
    if (!originEl) {
      return { position: new THREE.Vector3(), rotation: new THREE.Euler() };
    }

    const xyz = originEl.getAttribute("xyz") || "0 0 0";
    const rpy = originEl.getAttribute("rpy") || "0 0 0";

    const xyzParts = xyz.split(" ").map(Number);
    const rpyParts = rpy.split(" ").map(Number);

    return {
      position: new THREE.Vector3(xyzParts[0], xyzParts[1], xyzParts[2]),
      rotation: new THREE.Euler(rpyParts[0], rpyParts[1], rpyParts[2], "XYZ"),
    };
  }

  parseMaterial(materialEl: Element) {
    const colorEl = materialEl.querySelector("color");
    if (!colorEl) return null;

    const rgba = colorEl.getAttribute("rgba") || "1 1 1 1";
    const parts = rgba.split(" ").map(Number);

    return {
      color: new THREE.Color(parts[0], parts[1], parts[2]),
      opacity: parts[3] || 1.0,
    };
  }

  parseInertial(inertialEl: Element): URDFInertial {
    const originEl = inertialEl.querySelector("origin");
    const massEl = inertialEl.querySelector("mass");
    const inertiaEl = inertialEl.querySelector("inertia");

    return {
      origin: this.parseOrigin(originEl),
      mass: massEl ? Number(massEl.getAttribute("value")) : 0,
      inertia: {
        ixx: inertiaEl ? Number(inertiaEl.getAttribute("ixx")) : 0,
        ixy: inertiaEl ? Number(inertiaEl.getAttribute("ixy")) : 0,
        ixz: inertiaEl ? Number(inertiaEl.getAttribute("ixz")) : 0,
        iyy: inertiaEl ? Number(inertiaEl.getAttribute("iyy")) : 0,
        iyz: inertiaEl ? Number(inertiaEl.getAttribute("iyz")) : 0,
        izz: inertiaEl ? Number(inertiaEl.getAttribute("izz")) : 0,
      },
    };
  }

  parseJoint(jointEl: Element): URDFJoint {
    const name = jointEl.getAttribute("name") ?? "";
    const type = jointEl.getAttribute("type") ?? "";

    const originEl = jointEl.querySelector("origin");
    const parentEl = jointEl.querySelector("parent");
    const childEl = jointEl.querySelector("child");
    const axisEl = jointEl.querySelector("axis");
    const limitEl = jointEl.querySelector("limit");

    return {
      name,
      type,
      origin: this.parseOrigin(originEl),
      parent: parentEl ? parentEl.getAttribute("link") : null,
      child: childEl ? childEl.getAttribute("link") : null,
      axis: axisEl ? this.parseAxis(axisEl) : new THREE.Vector3(1, 0, 0),
      limit: limitEl ? this.parseLimit(limitEl) : null,
    };
  }

  parseAxis(axisEl: Element) {
    const xyz = axisEl.getAttribute("xyz") || "1 0 0";
    const parts = xyz.split(" ").map(Number);
    return new THREE.Vector3(parts[0], parts[1], parts[2]);
  }

  parseLimit(limitEl: Element) {
    return {
      lower: Number(limitEl.getAttribute("lower")) || 0,
      upper: Number(limitEl.getAttribute("upper")) || 0,
      effort: Number(limitEl.getAttribute("effort")) || 0,
      velocity: Number(limitEl.getAttribute("velocity")) || 0,
    };
  }
}
