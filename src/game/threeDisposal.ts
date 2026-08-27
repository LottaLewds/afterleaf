import {BatchedMesh, BufferGeometry, Mesh, Object3D, Texture, type Material} from "three";

export const disposeMaterial = (material: Material, textures: Set<Texture>) => {
  for (const value of Object.values(material)) {
    if (value instanceof Texture) textures.add(value);
  }
  material.dispose();
};

export const disposeObject = (root: Object3D) => {
  const batchedMeshes = new Set<BatchedMesh>();
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();

  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    if (object instanceof BatchedMesh) batchedMeshes.add(object);
    else geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of objectMaterials) materials.add(material);
  });

  for (const geometry of geometries) geometry.dispose();
  for (const batchedMesh of batchedMeshes) batchedMesh.dispose();
  for (const material of materials) disposeMaterial(material, textures);
  for (const texture of textures) texture.dispose();
};
