import {
  CanvasTexture,
  FrontSide,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from "three";
import {disposeObject} from "~/game/threeDisposal";
import {
  FACE_DISPLAY_COLUMN_SPACING,
  FACE_DISPLAY_COLUMNS,
  RARE_ROOM_DOOR_CENTER_X,
} from "~/game/shopLayout";

export type ShopSignKind = "aisle" | "shelf";

export type ShopSignEditRequest = {
  id: string;
  kind: ShopSignKind;
  label: string;
  subtitle: string;
  title: string;
};

type ShopSignSlot = ShopSignEditRequest & {
  backgroundColor: string;
  column?: number;
  group: Group;
  height: number;
  sign: Group | undefined;
  target: Mesh<PlaneGeometry, MeshBasicMaterial>;
  width: number;
};

export const shopSignKey = (kind: ShopSignKind, id: string) => `${kind}:${id}`;

/**
 * Builds one canvas-textured double-sided sign face. Signs are replaced when
 * users customize their content; the visual subtree is marked to stay out of
 * static batching so an old canvas texture cannot survive beside its
 * replacement.
 */
export const createSignVisual = (
  title: string,
  subtitle: string,
  width: number,
  height: number,
  textColor: string,
  backgroundColor: string,
  maxTextureAnisotropy: number,
) => {
  const sign = new Group();
  // Signs are replaced when users customize their content. Keeping the
  // visual subtree out of static batching prevents the old canvas texture
  // from surviving in a permanent batch beside the replacement sign.
  sign.userData.excludeFromStaticBatch = true;
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = Math.max(128, Math.round(canvas.width * (height / width)));
  const context = canvas.getContext("2d");
  if (!context) {
    const geometry = new PlaneGeometry(width, height);
    const front = new Mesh(
      geometry,
      new MeshBasicMaterial({color: backgroundColor, side: FrontSide}),
    );
    const back = new Mesh(geometry, front.material.clone());
    back.rotation.y = Math.PI;
    sign.add(front, back);
    return sign;
  }

  context.fillStyle = backgroundColor;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = textColor;
  context.globalAlpha = 0.28;
  context.lineWidth = 5;
  const inset = Math.max(12, Math.round(canvas.height * 0.065));
  context.strokeRect(
    inset,
    inset,
    canvas.width - inset * 2,
    canvas.height - inset * 2,
  );
  context.globalAlpha = 1;
  context.fillStyle = textColor;
  context.font = `700 ${Math.round(canvas.height * 0.28)}px "Yu Gothic", "Hiragino Kaku Gothic ProN", sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(title, canvas.width / 2, canvas.height * 0.42);
  context.globalAlpha = 0.72;
  context.font = `600 ${Math.round(canvas.height * 0.12)}px Inter, "Yu Gothic", sans-serif`;
  context.letterSpacing = `${Math.max(1, canvas.height * 0.012)}px`;
  context.fillText(subtitle, canvas.width / 2, canvas.height * 0.72);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.anisotropy = Math.min(4, maxTextureAnisotropy);
  const material = new MeshBasicMaterial({
    map: texture,
    side: FrontSide,
    toneMapped: false,
  });
  const geometry = new PlaneGeometry(width, height);
  const front = new Mesh(geometry, material);
  const back = new Mesh(geometry, material.clone());
  front.position.z = 0.001;
  back.position.z = -0.001;
  back.rotation.y = Math.PI;
  sign.add(front, back);
  return sign;
};

export class ShopSignSystem {
  readonly #slots = new Map<string, ShopSignSlot>();
  readonly #targetMeshes: Mesh[] = [];
  readonly #previewTargetMeshes: Mesh[] = [];
  readonly #maxTextureAnisotropy: number;
  readonly #onEditRequest: ((request: ShopSignEditRequest) => void) | undefined;
  readonly #releasePointerLockFn: () => void;
  #targetedKey: string | undefined;
  #previewKey: string | undefined;

  constructor(options: {
    maxTextureAnisotropy: number;
    onEditRequest?: ((request: ShopSignEditRequest) => void) | undefined;
    releasePointerLock: () => void;
  }) {
    this.#maxTextureAnisotropy = options.maxTextureAnisotropy;
    this.#onEditRequest = options.onEditRequest;
    this.#releasePointerLockFn = options.releasePointerLock;
  }

  /** Every registered slot; callers must not mutate the map. */
  get slots(): ReadonlyMap<string, ShopSignSlot> {
    return this.#slots;
  }

  /** Live raycast target arrays; treat as read-only outside the system. */
  get targetMeshes(): Mesh[] {
    return this.#targetMeshes;
  }

  get previewTargetMeshes(): Mesh[] {
    return this.#previewTargetMeshes;
  }

  get targetedKey(): string | undefined {
    return this.#targetedKey;
  }
  set targetedKey(key: string | undefined) {
    this.#targetedKey = key;
  }

  get previewKey(): string | undefined {
    return this.#previewKey;
  }
  set previewKey(key: string | undefined) {
    this.#previewKey = key;
  }

  /** Registers an externally built hidden preview proxy (shelf faces). */
  registerPreviewTarget(mesh: Mesh): void {
    this.#previewTargetMeshes.push(mesh);
  }

  has(key: string): boolean {
    return this.#slots.has(key);
  }

  slotLabel(key: string): string | undefined {
    return this.#slots.get(key)?.label;
  }

  createShelfSignSlots(parent: Group) {
    const targetGeometry = new PlaneGeometry(1.02, 0.52);
    for (let column = 0; column < FACE_DISPLAY_COLUMNS; column += 1) {
      const group = new Group();
      group.position.set(
        -2 +
          (column - (FACE_DISPLAY_COLUMNS - 1) / 2) *
            FACE_DISPLAY_COLUMN_SPACING,
        4.18,
        -9.82,
      );
      const target = new Mesh(
        targetGeometry,
        new MeshBasicMaterial({
          color: "#d9b96f",
          depthTest: false,
          depthWrite: false,
          opacity: 0.1,
          side: FrontSide,
          transparent: true,
        }),
      );
      target.name = `shelf-sign-target-${column}`;
      // Hidden raycast proxy; #updateSignTargetVisuals reveals it on demand.
      target.visible = false;
      const id = String(column);
      const key = shopSignKey("shelf", id);
      target.userData.signKey = key;
      group.add(target);
      parent.add(group);
      this.#targetMeshes.push(target);
      this.#slots.set(key, {
        backgroundColor: column === 0 ? "#b83931" : "#354843",
        column,
        group,
        height: 0.46,
        id,
        kind: "shelf",
        label: `DISPLAY ${String(column + 1).padStart(2, "0")}`,
        sign: undefined,
        subtitle: "",
        target,
        title: "",
        width: 1.02,
      });
    }
    this.setShelfSign(0, "NEW ARRIVALS", "DISPLAY 01");
  }

  createSpineShelfSignSlot(
    parent: Group,
    label: string,
    x: number,
    z: number,
    width: number,
    rotationY: number,
    elevation = 0,
  ) {
    const column = [...this.#slots.values()].filter(
      (slot) => slot.kind === "shelf",
    ).length;
    const group = new Group();
    group.position.set(x, elevation + 4.2, z);
    group.rotation.y = rotationY;
    const target = new Mesh(
      new PlaneGeometry(width, 0.5),
      new MeshBasicMaterial({
        color: "#d9b96f",
        depthTest: false,
        depthWrite: false,
        opacity: 0.1,
        side: FrontSide,
        transparent: true,
      }),
    );
    target.name = `spine-shelf-sign-target-${column}`;
    // Hidden raycast proxy; #updateSignTargetVisuals reveals it on demand.
    target.visible = false;
    const id = String(column);
    const key = shopSignKey("shelf", id);
    target.userData.signKey = key;
    group.add(target);
    parent.add(group);
    this.#targetMeshes.push(target);
    this.#slots.set(key, {
      backgroundColor: "#354843",
      column,
      group,
      height: 0.46,
      id,
      kind: "shelf",
      label,
      sign: undefined,
      subtitle: "",
      target,
      title: "",
      width,
    });
    return key;
  }

  createAisleSignSlot(
    parent: Group,
    id: string,
    x: number,
    title: string,
    subtitle: string,
  ) {
    const key = shopSignKey("aisle", id);
    const group = new Group();
    group.position.set(x, 4.35, 0.7);
    group.rotation.y = x < 0 ? 0.08 : -0.08;
    const target = new Mesh(
      new PlaneGeometry(2.6, 0.72),
      new MeshBasicMaterial({
        color: "#d9b96f",
        depthTest: false,
        depthWrite: false,
        opacity: 0.1,
        side: FrontSide,
        transparent: true,
      }),
    );
    target.name = `aisle-sign-target-${id}`;
    // Hidden raycast proxy; #updateSignTargetVisuals reveals it on demand.
    target.visible = false;
    target.userData.signKey = key;
    group.add(target);
    parent.add(group);
    this.#targetMeshes.push(target);
    this.#slots.set(key, {
      backgroundColor: "#242e2b",
      group,
      height: 0.72,
      id,
      kind: "aisle",
      label: `AISLE ${id === "gondola-1" ? "01" : "02"}`,
      sign: undefined,
      subtitle: "",
      target,
      title: "",
      width: 2.6,
    });
    this.setSign(key, title, subtitle);
  }

  createRoomSignSlot(
    parent: Group,
    id: string,
    label: string,
    title: string,
    subtitle: string,
    position: readonly [x: number, y: number, z: number],
    rotationY: number,
  ) {
    const key = shopSignKey("aisle", id);
    const group = new Group();
    group.position.set(...position);
    group.rotation.y = rotationY;
    const target = new Mesh(
      new PlaneGeometry(2.8, 0.64),
      new MeshBasicMaterial({
        color: "#d9b96f",
        depthTest: false,
        depthWrite: false,
        opacity: 0.1,
        side: FrontSide,
        transparent: true,
      }),
    );
    target.name = `${id}-sign-target`;
    // Hidden raycast proxy; #updateSignTargetVisuals reveals it on demand.
    target.visible = false;
    target.userData.signKey = key;
    group.add(target);
    parent.add(group);
    this.#targetMeshes.push(target);
    this.#slots.set(key, {
      backgroundColor: id === "moonlight-theatre" ? "#25213c" : "#24353d",
      group,
      height: 0.64,
      id,
      kind: "aisle",
      label,
      sign: undefined,
      subtitle: "",
      target,
      title: "",
      width: 2.8,
    });
    this.setSign(key, title, subtitle);
  }

  createRareRoomSignSlot(parent: Group) {
    const id = "special-collection";
    const key = shopSignKey("aisle", id);
    const group = new Group();
    group.position.set(RARE_ROOM_DOOR_CENTER_X, 3.55, -1.88);
    const target = new Mesh(
      new PlaneGeometry(2.65, 0.58),
      new MeshBasicMaterial({
        color: "#d9b96f",
        depthTest: false,
        depthWrite: false,
        opacity: 0.1,
        side: FrontSide,
        transparent: true,
      }),
    );
    target.name = "special-collection-sign-target";
    // Invisible raycast proxy; reveal it only while the sign is targeted.
    target.visible = false;
    target.userData.signKey = key;
    group.add(target);
    parent.add(group);
    this.#targetMeshes.push(target);
    this.#slots.set(key, {
      backgroundColor: "#3e251e",
      group,
      height: 0.58,
      id,
      kind: "aisle",
      label: "SPECIAL COLLECTION",
      sign: undefined,
      subtitle: "",
      target,
      title: "",
      width: 2.65,
    });
  }

  setSign(key: string, title: string, subtitle: string) {
    const slot = this.#slots.get(key);
    if (!slot) return;
    if (slot.sign) {
      slot.group.remove(slot.sign);
      disposeObject(slot.sign);
      slot.sign = undefined;
    }
    slot.title = title.trim().slice(0, 48);
    slot.subtitle = subtitle.trim().slice(0, 72);
    if (!slot.title) {
      slot.subtitle = "";
      slot.target.visible = false;
      slot.target.material.opacity = 0;
      return;
    }
    const sign = createSignVisual(
      slot.title,
      slot.subtitle,
      slot.width,
      slot.height,
      "#efe5cc",
      slot.backgroundColor,
      this.#maxTextureAnisotropy,
    );
    sign.position.z = -0.012;
    slot.sign = sign;
    slot.target.visible = false;
    slot.target.material.opacity = 0;
    slot.group.add(sign);
  }

  setShelfSign(column: number, title: string, subtitle?: string) {
    const key = shopSignKey("shelf", String(column));
    const slot = this.#slots.get(key);
    this.setSign(key, title, subtitle ?? slot?.label ?? "");
  }

  updateTargetVisuals() {
    for (const [key, slot] of this.#slots) {
      const targeted = key === this.#targetedKey;
      const shelfPreview = key === this.#previewKey && slot.sign === undefined;
      slot.target.visible = targeted || shelfPreview;
      slot.target.material.opacity = targeted ? 0.32 : shelfPreview ? 0.2 : 0;
    }
  }

  clearShelfSignPreview() {
    if (this.#previewKey === undefined) return;
    this.#previewKey = undefined;
    this.updateTargetVisuals();
  }

  requestEdit() {
    const key = this.#targetedKey;
    if (!key || !this.#onEditRequest) return;
    const signSlot = this.#slots.get(key);
    if (!signSlot) return;
    this.#releasePointerLockFn();
    this.#onEditRequest({
      id: signSlot.id,
      kind: signSlot.kind,
      label: signSlot.label,
      subtitle: signSlot.subtitle,
      title: signSlot.title,
    });
  }
}
