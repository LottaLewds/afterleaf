/**
 * Per-object draw-call census for the running shop scene. Walks the live
 * three.js graph through the performance debug handle and aggregates visible
 * meshes by their top-level ancestor (direct child of the scene root), which
 * maps to one prop/system per bucket in practice. Instanced batches count as
 * one call each, matching renderer.info semantics.
 *
 * Usage:
 *   bun run cdp:census:wsl
 */
import {CdpSession} from "./client";

const session = await CdpSession.connect();
try {
  await session.request("Emulation.setFocusEmulationEnabled", {enabled: true});
  const result = await session.evaluate(`
    (() => {
      const debug = window.__AFTERLEAF_PERFORMANCE_DEBUG__;
      if (!debug) throw new Error("Afterleaf performance handle unavailable");
      const scene = debug.scene;

      // Visible-only traversal: three.js traverse() ignores visibility.
      const visit = (object, visibleSoFar, onObject) => {
        const visible = visibleSoFar && object.visible !== false;
        if (!visible) return;
        onObject(object);
        for (const child of object.children) visit(child, true, onObject);
      };

      const materialStats = new Map();
      const colorHistogram = new Map();
      const finishNameSamples = new Map();
      const geometryIds = new Set();
      const buckets = new Map();
      let totalCalls = 0;
      let totalTriangles = 0;
      let totalMeshes = 0;
      let instancedBatches = 0;

      const ensureBucket = (root) => {
        const key =
          root.name || root.type + "@" + root.id;
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = {calls: 0, meshes: 0, triangles: 0, materials: new Set()};
          buckets.set(key, bucket);
        }
        return bucket;
      };

      const handleObject = (object) => {
        // Bucket every object under its top-level ancestor so groups and
        // bare meshes both land somewhere sensible.
        let root = object;
        while (root.parent && root.parent !== scene) root = root.parent;
        const bucket = ensureBucket(root);

        if (object.isMesh) {
          totalMeshes += 1;
          totalCalls += 1;
          bucket.calls += 1;
          bucket.meshes += 1;
          if (object.isInstancedMesh) {
            instancedBatches += 1;
            const count = object.geometry?.index
              ? object.geometry.index.count / 3
              : (object.geometry?.attributes?.position?.count ?? 0) / 3;
            const instances = object.count ?? 1;
            totalTriangles += count * instances;
            bucket.triangles += count * instances;
          } else {
            const count = object.geometry?.index
              ? object.geometry.index.count / 3
              : (object.geometry?.attributes?.position?.count ?? 0) / 3;
            totalTriangles += count;
            bucket.triangles += count;
            if (object.geometry) geometryIds.add(object.geometry.uuid);
          }
          const material = object.material;
          const list = Array.isArray(material) ? material : [material];
          for (const entry of list) {
            if (!entry) continue;
            bucket.materials.add(entry.uuid);
            const existing = materialStats.get(entry.uuid);
            if (existing) {
              existing.meshes += 1;
            } else {
              materialStats.set(entry.uuid, {
                meshes: 1,
                name: entry.name || "(unnamed)",
                type: entry.type,
              });
            }
            // Finish-class fingerprint: how much would vertex-color baking
            // collapse this content?
            const finish =
              entry.type +
              "|r" + Number(entry.roughness ?? 0).toFixed(2) +
              "|m" + Number(entry.metalness ?? 0).toFixed(2) +
              "|map:" + (entry.map ? "yes" : "no");
            const entryColor =
              entry.color ? "#" + entry.color.getHexString() : "-";
            const finishKey = finish + "|" + entryColor;
            colorHistogram.set(finishKey, (colorHistogram.get(finishKey) ?? 0) + 1);
            const names = finishNameSamples.get(finishKey);
            if (names) {
              if (names.length < 5 && !names.includes(object.name))
                names.push(object.name);
            } else finishNameSamples.set(finishKey, [object.name]);
          }
        }
      };

      visit(scene, true, handleObject);

      const ranked = [...buckets.entries()]
        .map(([name, data]) => ({
          calls: data.calls,
          materials: data.materials.size,
          meshes: data.meshes,
          name,
          triangles: Math.round(data.triangles),
        }))
        .sort((left, right) => right.calls - left.calls);

      return {
        buckets: ranked,
        colorHistogram: [...colorHistogram.entries()]
          .sort((left, right) => right[1] - left[1])
          .slice(0, 20)
          .map(([finish, count]) => ({count, finish})),
        distinctFinishColors: colorHistogram.size,
        finishNames: Object.fromEntries(finishNameSamples),
        currentFrameCalls: debug.renderer.info.render.calls,
        instancedBatches,
        materialCount: materialStats.size,
        materials: [...materialStats.values()]
          .sort((left, right) => right.meshes - left.meshes)
          .slice(0, 15),
        totalCalls,
        totalGeometries: geometryIds.size,
        totalMeshes,
        totalTriangles: Math.round(totalTriangles),
      };
    })()
  `);
  console.log(JSON.stringify(result, null, 2));
} finally {
  session.close();
}
