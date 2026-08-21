import {BufferGeometry, Mesh, Vector3, type Object3D} from "three";

export const getInitialModelAnimationIndex = (
  animations: readonly {name: string}[],
  animationClip?: string | null,
) => {
  if (animationClip === null) return -1;
  if (animationClip === undefined) return 0;
  const savedIndex = animations.findIndex(
    (clip) => clip.name === animationClip,
  );
  return Math.max(0, savedIndex);
};

export const findModelTelevisionScreen = (
  root: Object3D,
  screenNodeName: string,
) => {
  const screenRoot = root.getObjectByName(screenNodeName);
  let screen: Mesh | undefined;
  screenRoot?.traverse((object) => {
    if (!screen && object instanceof Mesh) screen = object;
  });
  return screen;
};

export const getModelTelevisionScreenAspect = (screen: Mesh) => {
  screen.geometry.computeBoundingBox();
  const bounds = screen.geometry.boundingBox;
  if (!bounds) return;

  screen.updateWorldMatrix(true, false);
  const scale = screen.getWorldScale(new Vector3());
  const width = (bounds.max.x - bounds.min.x) * Math.abs(scale.x);
  const height = (bounds.max.y - bounds.min.y) * Math.abs(scale.y);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= Number.EPSILON ||
    height <= Number.EPSILON
  )
    return;
  return width / height;
};

/**
 * Remaps a model screen's UVs to fill the full 0..1 range so screen content
 * textures render edge to edge. Clones the geometry; the previous geometry is
 * returned so callers can dispose it when they own its lifecycle.
 */
export const normalizeModelScreenUvs = (
  screen: Mesh,
): BufferGeometry | undefined => {
  const sourceUvs = screen.geometry.getAttribute("uv");
  if (!sourceUvs || sourceUvs.count === 0) return;
  let minU = Number.POSITIVE_INFINITY;
  let minV = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < sourceUvs.count; index += 1) {
    const u = sourceUvs.getX(index);
    const v = sourceUvs.getY(index);
    minU = Math.min(minU, u);
    minV = Math.min(minV, v);
    maxU = Math.max(maxU, u);
    maxV = Math.max(maxV, v);
  }
  const width = maxU - minU;
  const height = maxV - minV;
  if (width <= Number.EPSILON || height <= Number.EPSILON) return;

  const geometry = screen.geometry.clone();
  const uvs = geometry.getAttribute("uv");
  if (!uvs) {
    geometry.dispose();
    return;
  }
  for (let index = 0; index < uvs.count; index += 1)
    uvs.setXY(
      index,
      (uvs.getX(index) - minU) / width,
      (uvs.getY(index) - minV) / height,
    );
  uvs.needsUpdate = true;
  const sourceGeometry = screen.geometry;
  screen.geometry = geometry;
  return sourceGeometry;
};
