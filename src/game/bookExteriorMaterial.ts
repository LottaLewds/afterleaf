import {BatchedMesh, Color, type Matrix4, MeshStandardMaterial, Texture} from "three";

export type BookExteriorUniforms = {
  backMap: {value: Texture | null};
  backMapEnabled: {value: boolean};
  backTint: {value: Color};
  coverMap: {value: Texture | null};
  edgeTint: {value: Color};
  pageTint: {value: Color};
  spineMap: {value: Texture | null};
  spineMapEnabled: {value: boolean};
  spineNormalSign: {value: number};
  spineTint: {value: Color};
};

export type BookAtlasTextures = {
  back: Texture;
  front: Texture;
  spine: Texture;
};

export type BookAtlasBatch = {
  material: MeshStandardMaterial;
  mesh: BatchedMesh;
};

export type BookAtlasPlacement = {
  batch: BookAtlasBatch;
  instanceId: number;
  lastMatrix: Matrix4;
  visible: boolean;
  /** True while the standalone mesh is detached from the scene graph. */
  detached: boolean;
};

export const createBookExteriorMaterial = (
  accent: Color,
  spineNormalSign: -1 | 1,
  atlasUvs = false,
  // Vertex-driven mode reads per-instance accent and spine sign from
  // geometry attributes instead of uniforms, so books sharing one set of
  // atlas textures merge into a single BatchedMesh draw call.
  vertexDriven = false,
) => {
  const tint = (multiplier: number) =>
    vertexDriven ? new Color("#ffffff") : accent.clone().multiplyScalar(multiplier);
  const uniforms: BookExteriorUniforms = {
    backMap: {value: null},
    backMapEnabled: {value: false},
    backTint: {value: tint(0.76)},
    coverMap: {value: null},
    edgeTint: {value: tint(0.62)},
    pageTint: {value: new Color("#d8cfba")},
    spineMap: {value: null},
    spineMapEnabled: {value: false},
    spineNormalSign: {value: spineNormalSign},
    spineTint: {value: tint(0.62)},
  };
  const material = new MeshStandardMaterial({
    color: "#ffffff",
    emissive: "#000000",
    roughness: 0.68,
  });
  material.customProgramCacheKey = () =>
    `afterleaf-book-exterior-${vertexDriven ? "v5-merged" : atlasUvs ? "v4-atlas" : "v4-standalone"}`;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
${vertexDriven ? "" : "uniform float spineNormalSign;\n"}${
          atlasUvs ? "attribute vec2 bookSpineUv;\nvarying vec2 vBookSpineUv;\n" : ""
        }${
          vertexDriven
            ? "attribute vec3 bookAccent;\nattribute float bookSpineSign;\nvarying vec3 vBookAccent;\nvarying float vBookSign;\n"
            : ""
        }varying vec2 vBookUv;
varying float vBookFace;`,
      )
      .replace(
        "#include <beginnormal_vertex>",
        `#include <beginnormal_vertex>
vBookUv = uv;
${atlasUvs ? "vBookSpineUv = bookSpineUv;" : ""}
if (objectNormal.z > 0.5) vBookFace = 1.0;
else if (objectNormal.z < -0.5) vBookFace = 2.0;
else if (objectNormal.x * ${vertexDriven ? "bookSpineSign" : "spineNormalSign"} > 0.5) vBookFace = 3.0;
else if (abs(objectNormal.y) > 0.5) vBookFace = 4.0;
else vBookFace = 5.0;
${vertexDriven ? "vBookAccent = bookAccent;\nvBookSign = bookSpineSign;" : ""}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform sampler2D backMap;
uniform bool backMapEnabled;
${vertexDriven ? "varying vec3 vBookAccent;" : "uniform vec3 backTint;"}
uniform sampler2D coverMap;
${vertexDriven ? "" : "uniform vec3 edgeTint;\n"}uniform vec3 pageTint;
uniform sampler2D spineMap;
uniform bool spineMapEnabled;
${vertexDriven ? "" : "uniform vec3 spineTint;\n"}varying vec2 vBookUv;
${atlasUvs ? "varying vec2 vBookSpineUv;" : ""}
varying float vBookFace;`,
      )
      .replace(
        "#include <map_fragment>",
        `vec4 bookSurface;
if (vBookFace < 1.5) bookSurface = texture2D(coverMap, vBookUv);
else if (vBookFace < 2.5 && backMapEnabled)
  bookSurface = texture2D(backMap, vBookUv);
else if (vBookFace < 2.5) bookSurface = vec4(${vertexDriven ? "vBookAccent * 0.76" : "backTint"}, 1.0);
else if (vBookFace < 3.5 && spineMapEnabled)
  bookSurface = texture2D(spineMap, ${atlasUvs ? "vBookSpineUv" : "vBookUv"});
else if (vBookFace < 3.5) bookSurface = vec4(${vertexDriven ? "vBookAccent * 0.62" : "spineTint"}, 1.0);
else if (vBookFace < 4.5) bookSurface = vec4(pageTint, 1.0);
else bookSurface = vec4(${vertexDriven ? "vBookAccent * 0.62" : "edgeTint"}, 1.0);
diffuseColor *= bookSurface;`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `if (vBookFace < 1.5)
  totalEmissiveRadiance *= texture2D(coverMap, vBookUv).rgb;
else if (vBookFace < 2.5 && backMapEnabled)
  totalEmissiveRadiance *= texture2D(backMap, vBookUv).rgb;
else if (vBookFace > 3.5) totalEmissiveRadiance = vec3(0.0);`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `float roughnessFactor;
if (vBookFace < 1.5) roughnessFactor = 0.58;
else if (vBookFace < 2.5) roughnessFactor = 0.74;
else if (vBookFace < 3.5) roughnessFactor = 0.68;
else if (vBookFace < 4.5) roughnessFactor = 0.92;
else roughnessFactor = 0.62;`,
      );
  };
  return {material, uniforms};
};
