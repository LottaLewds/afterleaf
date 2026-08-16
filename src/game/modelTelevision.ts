import {Mesh, Vector3, type Object3D} from "three";

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
