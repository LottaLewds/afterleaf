import {
  BoxGeometry,
  Mesh,
  MeshBasicMaterial,
  Path,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  type MeshStandardMaterial,
} from "three";
import type {Group} from "three";
import {createWallpaperBoxGeometry} from "~/game/wallpaperMaterials";
import {createCeilingBoxGeometry} from "~/game/ceilingMaterials";
import {createUpholsteryBoxGeometry} from "~/game/upholsteryMaterials";
import {createWoodBoxGeometry} from "~/game/woodMaterials";
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
  if (material.userData.boxUvMode === "wallpaper")
    geometry = createWallpaperBoxGeometry(size, position);
  else if (material.userData.boxUvMode === "upholstery")
    geometry = createUpholsteryBoxGeometry(size, position);
  else if (material.userData.boxUvMode === "ceiling")
    geometry = createCeilingBoxGeometry(size, position);
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

/** Cloned-material tiled floor surface on the upper storey. */
export const createTiledFloorSurface = (
  parent: Group,
  bounds: HorizontalBounds,
  floorMaterial: MeshStandardMaterial,
  holes: readonly HorizontalBounds[] = [],
  y = SHOP_UPPER_FLOOR_Y + 0.002,
) => {
  const material = floorMaterial.clone();
  const floor = createHorizontalShape(parent, bounds, holes, y, material);
  return floor;
};
