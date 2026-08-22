import {
  BufferGeometry,
  type Material,
  Matrix4,
  Mesh,
  type Object3D,
  SkinnedMesh,
} from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type MergedStaticParts = readonly {
  geometry: BufferGeometry;
  material: Material;
}[];

/**
 * Marks canonical static merges shared by every copy of a model template.
 * Individual props must not dispose these resources on teardown; the
 * template cache owns their lifecycle.
 */
const SHARED_STATIC_GEOMETRY = "afterleafSharedStaticGeometry";

export const isSharedStaticGeometry = (geometry: BufferGeometry): boolean =>
  geometry.userData[SHARED_STATIC_GEOMETRY] === true;

/**
 * Bakes every eligible descendant mesh of a model into one geometry per
 * material signature, transformed relative to the model root. Copies of the
 * same model then render each signature as a single draw call while keeping
 * a plain, individually raycastable Mesh per copy. The source meshes stay
 * untouched - callers decide whether to remove them from the working copy.
 *
 * Excluded from merging: transparent materials (render ordering), skinned
 * or morph-targeted meshes (deformation), and anything the exclude callback
 * rejects (dynamic surfaces such as television screens).
 */
export const buildMergedStaticParts = (
  root: Object3D,
  exclude?: (mesh: Mesh) => boolean,
): MergedStaticParts => {
  root.updateMatrixWorld(true);
  const rootInverse = new Matrix4().copy(root.matrixWorld).invert();

  type Bucket = {geometries: BufferGeometry[]; material: Material};
  const buckets = new Map<string, Bucket>();

  root.traverse((object) => {
    if (!(object instanceof Mesh) || object instanceof SkinnedMesh) return;
    if (exclude?.(object)) return;
    const material = object.material;
    if (Array.isArray(material) || material.transparent) return;
    const geometry = object.geometry;
    if (!geometry.getAttribute("position")) return;
    const key = [
      material.uuid,
      geometry.index ? "indexed" : "unindexed",
      Object.keys(geometry.attributes).sort().join("+"),
      geometry.morphAttributes.position ? "morph" : "plain",
    ].join("|");
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {geometries: [], material};
      buckets.set(key, bucket);
    }
    const baked = geometry.clone();
    baked.applyMatrix4(
      new Matrix4().multiplyMatrices(rootInverse, object.matrixWorld),
    );
    bucket.geometries.push(baked);
  });

  const parts: {geometry: BufferGeometry; material: Material}[] = [];
  for (const bucket of buckets.values()) {
    const merged = mergeGeometries(bucket.geometries, false);
    for (const baked of bucket.geometries) baked.dispose();
    if (!merged) continue;
    merged.userData[SHARED_STATIC_GEOMETRY] = true;
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    parts.push({geometry: merged, material: bucket.material});
  }
  return parts;
};
