import {BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3} from "three";
import {describe, expect, test} from "bun:test";

import {
  buildMergedStaticParts,
  isSharedStaticGeometry,
} from "~/game/staticModelBatching";

describe("buildMergedStaticParts", () => {
  test("merges parts sharing a material signature and bakes their transforms", () => {
    const root = new Group();
    const material = new MeshStandardMaterial({color: "#ffffff"});
    const left = new Mesh(new BoxGeometry(1, 1, 1), material);
    left.position.set(-2, 0, 0);
    const right = new Mesh(new BoxGeometry(1, 1, 1), material);
    right.position.set(2, 0, 0);
    root.add(left, right);

    const parts = buildMergedStaticParts(root);
    expect(parts).toHaveLength(1);
    expect(parts[0]?.material).toBe(material);
    // Two unit boxes span four units of world width once merged.
    expect(parts[0]?.geometry.boundingBox?.getSize(new Vector3()).x).toBe(5);
  });

  test("splits buckets per material and honors the exclude callback", () => {
    const root = new Group();
    const casing = new MeshStandardMaterial({color: "#111111"});
    const rear = new MeshStandardMaterial({color: "#222222"});
    const screen = new MeshStandardMaterial({color: "#333333"});
    root.add(
      new Mesh(new BoxGeometry(1, 1, 1), casing),
      new Mesh(new BoxGeometry(1, 1, 1), casing),
      new Mesh(new BoxGeometry(1, 1, 1), rear),
      new Mesh(new BoxGeometry(1, 1, 1), screen),
    );

    const parts = buildMergedStaticParts(
      root,
      (mesh) => mesh.material === screen,
    );
    expect(parts.map((part) => part.material)).toEqual([casing, rear]);
  });

  test("skips transparent materials and flags merged geometry as shared", () => {
    const root = new Group();
    const solid = new MeshStandardMaterial({color: "#ffffff"});
    const ghost = new MeshStandardMaterial({
      color: "#ffffff",
      transparent: true,
    });
    root.add(
      new Mesh(new BoxGeometry(1, 1, 1), solid),
      new Mesh(new BoxGeometry(1, 1, 1), ghost),
    );

    const parts = buildMergedStaticParts(root);
    expect(parts).toHaveLength(1);
    expect(isSharedStaticGeometry(parts[0]!.geometry)).toBe(true);
  });

  test("leaves source meshes untouched", () => {
    const root = new Group();
    const material = new MeshStandardMaterial({color: "#ffffff"});
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), material);
    root.add(mesh);

    const parts = buildMergedStaticParts(root);
    expect(mesh.parent).toBe(root);
    expect(parts[0]?.geometry).not.toBe(mesh.geometry);
  });
});
