import {DEV} from "solid-js";
import {
  BatchedMesh,
  BufferAttribute,
  BufferGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Material,
  type Object3D,
  SkinnedMesh,
  Texture,
} from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type MergedStaticParts = readonly {
  geometry: BufferGeometry;
  material: Material;
}[];

export type MergedStaticResult = {
  /** One entry per material signature, ready to attach as plain Meshes. */
  parts: MergedStaticParts;
  /** Source meshes folded into the parts; safe to remove from the tree. */
  consumed: readonly Mesh[];
};

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
): MergedStaticResult => {
  root.updateMatrixWorld(true);
  const rootInverse = new Matrix4().copy(root.matrixWorld).invert();

  type Bucket = {
    geometries: BufferGeometry[];
    material: Material;
    meshes: Mesh[];
  };
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
      bucket = {geometries: [], material, meshes: []};
      buckets.set(key, bucket);
    }
    bucket.meshes.push(object);
    const baked = geometry.clone();
    baked.applyMatrix4(
      new Matrix4().multiplyMatrices(rootInverse, object.matrixWorld),
    );
    bucket.geometries.push(baked);
  });

  const parts: {geometry: BufferGeometry; material: Material}[] = [];
  const consumed: Mesh[] = [];
  for (const bucket of buckets.values()) {
    const merged = mergeGeometries(bucket.geometries, false);
    for (const baked of bucket.geometries) baked.dispose();
    // A failed merge leaves this bucket's meshes untouched in the tree.
    if (!merged) continue;
    merged.userData[SHARED_STATIC_GEOMETRY] = true;
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    parts.push({geometry: merged, material: bucket.material});
    consumed.push(...bucket.meshes);
  }
  return {consumed, parts};
};

// Two exclusion tiers:
//   HARD - runtime-mutated materials (screens, displays) or interactive
//         systems; never swept into batches.
//   SOFT - movable-later fixtures (shelving); their contents ARE batched,
//         but scoped inside the fixture so it stays one movable unit.
const INTERIOR_BATCH_HARD =
  /television|screen|arcade|art-?frame|face-?out|display|snap|helper/iu;
const INTERIOR_BATCH_SOFT = /shelf|gondola|fixture|cave/iu;

const interiorMaterialSignature = (material: Material): string => {
  if (
    !(material instanceof MeshStandardMaterial) &&
    !(material instanceof MeshBasicMaterial)
  )
    return `${material.type}|${material.uuid}`;
  const parts = [
    material.type,
    `#${material.color.getHexString()}`,
    material.map ? material.map.uuid : "-",
    material.side,
    material.transparent ? material.opacity : 1,
  ];
  if (material instanceof MeshStandardMaterial)
    parts.push(
      String(material.roughness),
      String(material.metalness),
      `#${material.emissive.getHexString()}`,
      String(material.emissiveIntensity),
    );
  return parts.join("|");
};

export const batchStaticInteriorMeshes = (parent: Group) => {
  parent.updateMatrixWorld(true);
  const parentInverse = new Matrix4().copy(parent.matrixWorld).invert();

  /**
   * Untextured color-only materials bake their color into vertex colors so
   * one finish-class material serves every tint of that class.
   */
  const isBakeableColorMaterial = (
    material: Material,
  ): material is MeshStandardMaterial | MeshBasicMaterial => {
    if (
      !(material instanceof MeshStandardMaterial) &&
      !(material instanceof MeshBasicMaterial)
    )
      return false;
    if (material.map || material.vertexColors) return false;
    for (const value of Object.values(material))
      if (value instanceof Texture) return false;
    if (material instanceof MeshStandardMaterial)
      return (
        material.emissive.getHexString() === "000000" &&
        material.emissiveIntensity === 1
      );
    return true;
  };

  /** Shared vertexColors materials, one per finish class. */
  const finishMaterials = new Map<string, Material>();
  const finishMaterialFor = (finishKey: string, source: Material) => {
    let material = finishMaterials.get(finishKey);
    if (!material) {
      material =
        source instanceof MeshStandardMaterial
          ? new MeshStandardMaterial({
              color: "#ffffff",
              flatShading: source.flatShading,
              metalness: source.metalness,
              roughness: source.roughness,
              side: source.side,
              vertexColors: true,
            })
          : new MeshBasicMaterial({
              color: "#ffffff",
              side: source.side,
              vertexColors: true,
            });
      finishMaterials.set(finishKey, material);
    }
    return material;
  };

  /** Buckets keyed by container node: global for unscoped content. */
  const bucketsByContainer = new Map<
    Object3D,
    Map<string, {material: Material; meshes: Mesh[]}>
  >();
  const bucketFor = (container: Object3D) => {
    let buckets = bucketsByContainer.get(container);
    if (!buckets) {
      buckets = new Map();
      bucketsByContainer.set(container, buckets);
    }
    return buckets;
  };

  const addMeshToBucket = (
    object: Object3D,
    effectiveContainer: Object3D,
    excludedFromBatch: boolean,
  ) => {
    if (
      excludedFromBatch ||
      !(object instanceof Mesh) ||
      object instanceof BatchedMesh ||
      INTERIOR_BATCH_HARD.test(object.name)
    )
      return;
    const material = object.material;
    if (
      Array.isArray(material) ||
      material.transparent ||
      // colorWrite/depthWrite-off meshes are raycast-only overlays
      // (poster surfaces); sweeping them into a batch would either paint
      // the shared finish material over walls or blank out a whole
      // bucket, and hiding them breaks placement raycasts.
      !material.colorWrite ||
      !material.depthWrite ||
      !object.geometry.getAttribute("position")
    )
      return;
    const indexed = object.geometry.getIndex() ? "indexed" : "unindexed";
    let signature: string;
    let bucketMaterial = material;
    if (isBakeableColorMaterial(material)) {
      const attributesKey = Object.keys(object.geometry.attributes)
        .sort()
        .join("+");
      // MeshBasicMaterial has no flatShading; the `in` guard keeps
      // the finish key honest for both material classes.
      const flatShading = "flatShading" in material && material.flatShading;
      signature = [
        "finish",
        material.type,
        String(material.side),
        String(flatShading),
        ...(material instanceof MeshStandardMaterial
          ? [String(material.roughness), String(material.metalness)]
          : []),
        attributesKey,
        indexed,
      ].join("|");
      bucketMaterial = finishMaterialFor(signature, material);
      // Bake once per mesh; clones keep shared source geometries
      // untouched when siblings carry different tints.
      const baked = object.geometry.clone();
      const vertexCount = baked.getAttribute("position").count;
      const colors = new Float32Array(vertexCount * 3);
      const {b, g, r} = material.color;
      for (let index = 0; index < vertexCount; index += 1) {
        colors[index * 3] = r;
        colors[index * 3 + 1] = g;
        colors[index * 3 + 2] = b;
      }
      baked.setAttribute("color", new BufferAttribute(colors, 3));
      object.geometry = baked;
    } else {
      // Flags deliberately excluded: per-row renderOrder/shadow flags
      // would otherwise split identical fixtures into singleton buckets.
      // Opaque draws are depth-sorted by the GPU regardless.
      signature = [interiorMaterialSignature(bucketMaterial), indexed].join(
        ":",
      );
    }
    const buckets = bucketFor(effectiveContainer);
    let bucket = buckets.get(signature);
    if (!bucket) {
      // The batch renders with the bucket material - the shared
      // finish material for baked buckets, otherwise the first
      // member's own material.
      bucket = {material: bucketMaterial, meshes: []};
      buckets.set(signature, bucket);
    }
    bucket.meshes.push(object);
  };

  const visit = (
    object: Object3D,
    scopeContainer: Object3D | null,
    excludedFromBatch = false,
  ): void => {
    if (!object.visible) return;
    const nextExcludedFromBatch =
      excludedFromBatch || object.userData.excludeFromStaticBatch === true;
    // Topmost soft match owns the scope; everything under it batches
    // into the container just above that match so the fixture stays
    // movable as a unit.
    const scope =
      scopeContainer ?? (INTERIOR_BATCH_SOFT.test(object.name) ? object : null);
    const container = scope === null ? parent : (scope.parent ?? parent);
    const effectiveContainer =
      scope === null ? parent : container === parent ? parent : container;

    addMeshToBucket(object, effectiveContainer, nextExcludedFromBatch);

    for (const child of object.children)
      visit(
        child,
        scope ?? (effectiveContainer === parent ? null : scope),
        nextExcludedFromBatch,
      );
  };
  for (const child of [...parent.children]) visit(child, null);

  let batchIndex = 0;
  for (const [container, buckets] of bucketsByContainer) {
    const containerInverse =
      container === parent
        ? parentInverse
        : new Matrix4().copy(container.matrixWorld).invert();
    for (const {material, meshes} of buckets.values()) {
      if (meshes.length < 2) continue;
      const vertexCount = meshes.reduce(
        (total, mesh) =>
          total + (mesh.geometry.getAttribute("position")?.count ?? 0),
        0,
      );
      const indexCount = meshes.reduce(
        (total, mesh) => total + (mesh.geometry.getIndex()?.count ?? 0),
        0,
      );
      let batch;
      try {
        batch = new BatchedMesh(
          meshes.length,
          vertexCount,
          indexCount,
          material,
        );
      } catch (error) {
        if (DEV)
          console.error(
            "[afterleaf] BatchedMesh creation failed:",
            error,
            "meshes:",
            meshes.length,
            "verts:",
            vertexCount,
          );
        continue;
      }
      batch.name = `static-interior-batch-${batchIndex}`;
      batchIndex += 1;
      batch.castShadow = meshes.some((mesh) => mesh.castShadow);
      batch.receiveShadow = meshes.some((mesh) => mesh.receiveShadow);
      batch.sortObjects = false;
      for (const mesh of meshes) {
        mesh.updateWorldMatrix(true, false);
        const relative = new Matrix4().multiplyMatrices(
          containerInverse,
          mesh.matrixWorld,
        );
        const geometryId = batch.addGeometry(mesh.geometry);
        const instanceId = batch.addInstance(geometryId);
        batch.setMatrixAt(instanceId, relative);
        mesh.visible = false;
      }
      batch.computeBoundingBox();
      batch.computeBoundingSphere();
      container.add(batch);
    }
  }
  if (DEV)
    console.log(
      `[afterleaf] interior batching: ${batchIndex} batches from ${bucketsByContainer.size} container(s)`,
    );
};
