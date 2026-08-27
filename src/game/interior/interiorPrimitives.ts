import {
  BoxGeometry,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  Path,
  PlaneGeometry,
  Quaternion,
  Shape,
  ShapeGeometry,
  Vector3,
  type MeshStandardMaterial,
} from "three";
import type {Group} from "three";
import {createWallpaperBoxGeometry} from "~/game/wallpaperMaterials";
import {createCeilingBoxGeometry} from "~/game/ceilingMaterials";
import {createUpholsteryBoxGeometry} from "~/game/upholsteryMaterials";
import {createWoodBoxGeometry} from "~/game/woodMaterials";
import {
  MAX_POSTER_HEIGHT,
  MIN_POSTER_HEIGHT,
  POSTER_SURFACE_MARGIN,
  POSTER_SURFACE_OFFSET,
} from "~/game/wallDecorTuning";
import {SHOP_UPPER_FLOOR_Y} from "~/game/shopExpansionLayout";

/** Shared signature for the interior box builder used across shop builders. */
export type AddBox = (
  parent: Group,
  size: readonly [number, number, number],
  position: readonly [number, number, number],
  material: MeshStandardMaterial,
  castShadow?: boolean,
) => Mesh;

/**
 * A poster raycast target registered on a wall. Surfaces own no visuals of
 * their own (`colorWrite: false`); they exist so placed posters can resolve
 * which wall was aimed at.
 */
export type PosterSurface = {
  height: number;
  target: Mesh<PlaneGeometry, MeshBasicMaterial>;
  width: number;
};

/** Builds a box mesh with material-appropriate UV mapping and adds it. */
export const addInteriorBox = (
  parent: Group,
  size: readonly [number, number, number],
  position: readonly [number, number, number],
  material: MeshStandardMaterial,
  castShadow: boolean,
  posterRaycastMeshes: Mesh[],
) => {
  let geometry: BoxGeometry;
  if (material.userData.boxUvMode === "wallpaper") geometry = createWallpaperBoxGeometry(size, position);
  else if (material.userData.boxUvMode === "upholstery") geometry = createUpholsteryBoxGeometry(size, position);
  else if (material.userData.boxUvMode === "ceiling") geometry = createCeilingBoxGeometry(size, position);
  else if (material.map) geometry = createWoodBoxGeometry(size, position);
  else geometry = new BoxGeometry(...size);
  const mesh = new Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  posterRaycastMeshes.push(mesh);
  return mesh;
};

/** Registers an invisible wall patch that posters can be aimed at. */
export const createPosterSurface = (
  parent: Group,
  id: string,
  width: number,
  height: number,
  position: readonly [number, number, number],
  rotationY: number,
  posterRaycastMeshes: Mesh[],
  posterSurfaces: Map<string, PosterSurface>,
) => {
  const target = new Mesh(
    new PlaneGeometry(width, height),
    new MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
    }),
  );
  target.name = `poster-surface-${id}`;
  target.position.set(...position);
  target.rotation.y = rotationY;
  target.userData.posterSurfaceId = id;
  parent.add(target);
  posterRaycastMeshes.push(target);
  posterSurfaces.set(id, {height, target, width});
};

export type HorizontalBounds = {
  maxX: number;
  maxZ: number;
  minX: number;
  minZ: number;
};

/** Builds an XZ-plane shape mesh (with optional rectangular holes). */
export const createHorizontalShape = (
  parent: Group,
  bounds: HorizontalBounds,
  holes: readonly HorizontalBounds[],
  y: number,
  material: MeshStandardMaterial,
) => {
  const localMinY = -bounds.maxZ;
  const localMaxY = -bounds.minZ;
  const shape = new Shape();
  shape.moveTo(bounds.minX, localMinY);
  shape.lineTo(bounds.minX, localMaxY);
  shape.lineTo(bounds.maxX, localMaxY);
  shape.lineTo(bounds.maxX, localMinY);
  shape.closePath();
  for (const holeBounds of holes) {
    const localHoleMinY = -holeBounds.maxZ;
    const localHoleMaxY = -holeBounds.minZ;
    const hole = new Path();
    hole.moveTo(holeBounds.minX, localHoleMinY);
    hole.lineTo(holeBounds.maxX, localHoleMinY);
    hole.lineTo(holeBounds.maxX, localHoleMaxY);
    hole.lineTo(holeBounds.minX, localHoleMaxY);
    hole.closePath();
    shape.holes.push(hole);
  }
  const mesh = new Mesh(new ShapeGeometry(shape), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
};

/** Adds a tiled floor surface using the caller's shared material. */
export const createTiledFloorSurface = (
  parent: Group,
  bounds: HorizontalBounds,
  floorMaterial: MeshStandardMaterial,
  holes: readonly HorizontalBounds[] = [],
  y = SHOP_UPPER_FLOOR_Y + 0.002,
) => {
  return createHorizontalShape(parent, bounds, holes, y, floorMaterial);
};

/**
 * Resolves both poster and digital-frame placement against the same wall snap.
 * Scratch-free wall placement resolution shared by posters and art frames.
 */
export const resolveWallPlacement = (
  surface: PosterSurface,
  worldPoint: Vector3,
  aspectRatio: number,
  desiredHeight: number,
  rotation: number,
  outPosition: Vector3,
  outRotation: Quaternion,
  localPoint: Vector3,
  border = 0,
  gridSnap = true,
): number | undefined => {
  const framedAspectRatio = aspectRatio + border;
  const framedHeight = 1 + border;
  const cosine = Math.abs(Math.cos(rotation));
  const sine = Math.abs(Math.sin(rotation));
  const boundingWidthPerHeight = cosine * framedAspectRatio + sine * framedHeight;
  const boundingHeightPerHeight = sine * framedAspectRatio + cosine * framedHeight;
  const maximumHeight = Math.min(
    MAX_POSTER_HEIGHT,
    (surface.height - POSTER_SURFACE_MARGIN) / boundingHeightPerHeight,
    (surface.width - POSTER_SURFACE_MARGIN) / boundingWidthPerHeight,
  );
  if (maximumHeight < MIN_POSTER_HEIGHT) return undefined;
  const height = MathUtils.clamp(desiredHeight, MIN_POSTER_HEIGHT, maximumHeight);
  const halfWidth = (boundingWidthPerHeight * height) / 2;
  const halfHeight = (boundingHeightPerHeight * height) / 2;
  const point = localPoint.copy(worldPoint);
  surface.target.worldToLocal(point);
  point.x = MathUtils.clamp(
    point.x,
    -surface.width / 2 + halfWidth + POSTER_SURFACE_MARGIN / 2,
    surface.width / 2 - halfWidth - POSTER_SURFACE_MARGIN / 2,
  );
  if (gridSnap)
    point.x = MathUtils.clamp(
      Math.round(point.x / 0.25) * 0.25,
      -surface.width / 2 + halfWidth + POSTER_SURFACE_MARGIN / 2,
      surface.width / 2 - halfWidth - POSTER_SURFACE_MARGIN / 2,
    );
  point.y = MathUtils.clamp(
    point.y,
    -surface.height / 2 + halfHeight + POSTER_SURFACE_MARGIN / 2,
    surface.height / 2 - halfHeight - POSTER_SURFACE_MARGIN / 2,
  );
  if (gridSnap)
    point.y = MathUtils.clamp(
      Math.round(point.y / 0.25) * 0.25,
      -surface.height / 2 + halfHeight + POSTER_SURFACE_MARGIN / 2,
      surface.height / 2 - halfHeight - POSTER_SURFACE_MARGIN / 2,
    );
  point.z = POSTER_SURFACE_OFFSET + (border > 0 ? 0.025 : 0);
  surface.target.localToWorld(outPosition.copy(point));
  surface.target.getWorldQuaternion(outRotation);
  return height;
};
