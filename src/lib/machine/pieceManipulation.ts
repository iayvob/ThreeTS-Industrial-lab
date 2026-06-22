import * as THREE from "three";

export class PieceManipulationSystem {
  scene: THREE.Scene;
  camera: THREE.Camera;
  raycaster: THREE.Raycaster;
  pieces = new Map<
    string,
    {
      mesh: THREE.Mesh;
      initialPos: THREE.Vector3;
      originalPos: THREE.Vector3;
      isOriginal: boolean;
      isSelected: boolean;
      color?: number;
    }
  >();
  selectedPiece: THREE.Mesh | null = null;
  draggedPiece: THREE.Mesh | null = null;
  isDragging = false;
  dragOffset = new THREE.Vector3();
  groundPlane: THREE.Mesh | null = null;
  gridHelper: THREE.GridHelper | null = null;

  // Event handler references for cleanup
  private _onMouseDown: ((_event: MouseEvent) => void) | null = null;
  private _onMouseMove: ((_event: MouseEvent) => void) | null = null;
  private _onMouseUp: (() => void) | null = null;
  private _onDoubleClick: ((_event: MouseEvent) => void) | null = null;
  private _onKeyDown: ((_event: KeyboardEvent) => void) | null = null;

  PIECES = [
    { id: "piece_1", x: 100, y: 100, width: 80, height: 50, color: 0x8b45a },
    { id: "piece_2", x: 250, y: 100, width: 100, height: 60, color: 0x4caf50 },
    { id: "piece_3", x: 400, y: 100, width: 120, height: 70, color: 0xd4a5250 },
    { id: "piece_4", x: 600, y: 100, width: 150, height: 80, color: 0x9932b0 },
    { id: "piece_5", x: 150, y: 200, width: 60, height: 60, color: 0xcc6633 },
  ];

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    this.scene = scene;
    this.camera = camera;
    this.raycaster = new THREE.Raycaster();

    this.setupGroundPlane();
    this.setupInteraction();
  }

  setupGroundPlane() {
    const groundGeometry = new THREE.PlaneGeometry(2000, 1500);
    const groundMaterial = new THREE.MeshPhongMaterial({
      color: 0xcccccc,
      side: THREE.DoubleSide,
    });

    this.groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
    this.groundPlane.rotation.x = -Math.PI / 2;
    this.groundPlane.position.z = -50;
    this.scene.add(this.groundPlane);

    this.gridHelper = new THREE.GridHelper(2000, 1500, 10, 10);
    this.gridHelper.position.z = -49;
    this.scene.add(this.gridHelper);
  }

  createPiece(pieceData: {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    depth?: number;
    color: number;
  }) {
    const geometry = new THREE.BoxGeometry(pieceData.width, pieceData.height, pieceData.depth || 20);
    const material = new THREE.MeshPhongMaterial({
      color: pieceData.color,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(pieceData.x, pieceData.y, -25);
    mesh.userData.isPiece = true;
    mesh.userData.pieceId = pieceData.id;

    this.pieces.set(pieceData.id, {
      mesh,
      initialPos: new THREE.Vector3(pieceData.x, pieceData.y, 0),
      originalPos: new THREE.Vector3(pieceData.x, pieceData.y, 0),
      isOriginal: false,
      isSelected: false,
      color: pieceData.color,
    });

    this.scene.add(mesh);
    return mesh;
  }

  createPredefinedPieces() {
    this.PIECES.forEach((piece) => {
      this.createPiece(piece);
    });
  }

  setupInteraction() {
    const mouse = new THREE.Vector2();
    const updateMouse = (event: MouseEvent) => {
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    };

    this._onMouseDown = (event: MouseEvent) => {
      event.preventDefault();

      updateMouse(event);
      this.raycaster.setFromCamera(mouse, this.camera);

      const intersects = this.raycaster.intersectObjects(this.getPieceMeshes());

      if (intersects.length > 0) {
        const intersection = intersects[0];

        if (intersection.object.userData.isPiece) {
          this.selectPiece(intersection.object as THREE.Mesh);
          this.isDragging = true;
          this.draggedPiece = intersection.object as THREE.Mesh;

          const intersectPoint = intersection.point;
          this.dragOffset.copy(intersectPoint).sub(this.draggedPiece.position);

          document.body.style.cursor = "grabbing";
        }
      }
    };

    this._onMouseMove = (event: MouseEvent) => {
      if (this.isDragging && this.draggedPiece) {
        updateMouse(event);
        this.raycaster.setFromCamera(mouse, this.camera);
        const intersects = this.raycaster.intersectObject(this.groundPlane as THREE.Object3D);

        if (intersects.length > 0) {
          const intersectPoint = intersects[0].point;

          this.draggedPiece.position.x = intersectPoint.x - this.dragOffset.x;
          this.draggedPiece.position.y = intersectPoint.y - this.dragOffset.y;

          this.updatePieceVisuals();
        }
      }
    };

    this._onMouseUp = () => {
      if (this.isDragging) {
        this.isDragging = false;
        if (this.draggedPiece) {
          this.snapToGrid(this.draggedPiece);
        }
        this.draggedPiece = null;

        document.body.style.cursor = "default";
        this.updatePieceVisuals();
      }
    };

    this._onDoubleClick = (event: MouseEvent) => {
      event.preventDefault();

      updateMouse(event);
      this.raycaster.setFromCamera(mouse, this.camera);

      const intersects = this.raycaster.intersectObjects(this.getPieceMeshes());

      if (intersects.length > 0) {
        const intersection = intersects[0];

        if (intersection.object.userData.isPiece) {
          this.rotatePiece(intersection.object as THREE.Mesh, Math.PI / 12, "z");
        }
      }
    };

    this._onKeyDown = (event: KeyboardEvent) => {
      if (!this.selectedPiece) return;

      switch (event.key) {
        case "ArrowLeft":
          this.movePiece(this.selectedPiece, -10, 0);
          break;
        case "ArrowRight":
          this.movePiece(this.selectedPiece, 10, 0);
          break;
        case "ArrowUp":
          this.movePiece(this.selectedPiece, 0, -10);
          break;
        case "ArrowDown":
          this.movePiece(this.selectedPiece, 0, 10);
          break;
        case "r":
          this.rotatePiece(this.selectedPiece, Math.PI / 12, "z");
          break;
        case "R":
          this.rotatePiece(this.selectedPiece, -Math.PI / 12, "z");
          break;
        default:
          break;
      }
    };

    document.addEventListener("mousedown", this._onMouseDown);
    document.addEventListener("mousemove", this._onMouseMove);
    document.addEventListener("mouseup", this._onMouseUp);
    document.addEventListener("dblclick", this._onDoubleClick);
    document.addEventListener("keydown", this._onKeyDown);
  }

  getPieceMeshes() {
    const meshes: THREE.Mesh[] = [];
    this.pieces.forEach((piece) => {
      meshes.push(piece.mesh);
    });
    return meshes;
  }

  selectPiece(mesh: THREE.Mesh) {
    if (this.selectedPiece) {
      (this.selectedPiece.material as THREE.MeshPhongMaterial).emissive.setHex(0x000000);
      this.selectedPiece = null;
    }

    this.selectedPiece = mesh;
    (mesh.material as THREE.MeshPhongMaterial).emissive.setHex(0x00ff00);
  }

  rotatePiece(mesh: THREE.Mesh, angle: number, axis: "x" | "y" | "z") {
    const currentRotation = mesh.rotation[axis];
    mesh.rotation[axis] = currentRotation + angle;
    this.updatePieceVisuals();
  }

  movePiece(mesh: THREE.Mesh, deltaX: number, deltaY: number) {
    mesh.position.x += deltaX;
    mesh.position.y += deltaY;
    this.updatePieceVisuals();
  }

  snapToGrid(mesh: THREE.Mesh) {
    const gridSize = 50;
    mesh.position.x = Math.round(mesh.position.x / gridSize) * gridSize;
    mesh.position.y = Math.round(mesh.position.y / gridSize) * gridSize;
    this.updatePieceVisuals();
  }

  updatePieceVisuals() {
    this.pieces.forEach((piece, id) => {
      const mesh = piece.mesh;
      const isSelected = mesh === this.selectedPiece;

      if (isSelected) {
        (mesh.material as THREE.MeshPhongMaterial).emissive.setHex(0xff6600);
      } else {
        const pieceData = this.pieces.get(id);
        const color = pieceData?.color ?? 0x000000;
        (mesh.material as THREE.MeshPhongMaterial).emissive.setHex(color);
      }

      piece.isSelected = isSelected;
    });
  }

  dispose() {
    // Remove event listeners
    if (this._onMouseDown) document.removeEventListener("mousedown", this._onMouseDown);
    if (this._onMouseMove) document.removeEventListener("mousemove", this._onMouseMove);
    if (this._onMouseUp) document.removeEventListener("mouseup", this._onMouseUp);
    if (this._onDoubleClick) document.removeEventListener("dblclick", this._onDoubleClick);
    if (this._onKeyDown) document.removeEventListener("keydown", this._onKeyDown);

    // Dispose ground plane and grid
    if (this.groundPlane) {
      this.scene.remove(this.groundPlane);
      this.groundPlane.geometry.dispose();
      (this.groundPlane.material as THREE.Material).dispose();
      this.groundPlane = null;
    }
    if (this.gridHelper) {
      this.scene.remove(this.gridHelper);
      this.gridHelper.dispose();
      this.gridHelper = null;
    }

    // Dispose pieces
    this.pieces.forEach((piece) => {
      this.scene.remove(piece.mesh);
      piece.mesh.geometry.dispose();
      if (Array.isArray(piece.mesh.material)) {
          piece.mesh.material.forEach(m => m.dispose());
      } else {
          piece.mesh.material.dispose();
      }
    });
    this.pieces.clear();
  }
}
