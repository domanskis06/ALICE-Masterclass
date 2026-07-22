"""
Build a lightweight L3 yoke stand-in.

Replaces Mesh_1/2/3 with one octagon tube + ring flanges. Outer envelope
matches the CAD max radius (vertices on the CAD circle × RADIAL_SCALE);
wall thickness matches CAD by growing the bore inward.

Mesh_0 becomes a thin octagon liner flush with the yoke bore (almost no
gap) so end-on views do not show a dark ring between circle and octagon.

Writes L3_pp.glb (Particle Propagation stand-in) from L3.glb (CAD / VA asset).
"""
from __future__ import annotations

import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

ASSET_DIR = (
    "/home/szymon/Desktop/new_alice/alice_szymon/alice-masterclass-js/"
    "src/assets/models/alice components"
)
INPUT = os.path.join(ASSET_DIR, "L3.glb")
OUTPUT = os.path.join(ASSET_DIR, "L3_pp.glb")

SIDES = 8
RIB_COUNT = 64
RIB_WIDTH_FRAC = 0.38
RIB_DEPTH_FRAC = 0.22
# Mild outer shrink vs dipo (same as the "good size" revision).
RADIAL_SCALE = 0.97
# Near-zero air gap Mesh_0 → yoke bore (cm). Circular liner left dark
# corner pockets vs the octagon; flush octagon liner removes that ring.
LINER_GAP_CM = 0.3
# CAD Mesh_0 radial thickness was ~5 cm.
LINER_THICKNESS_CM = 5.0


def log(msg: str) -> None:
    print(f"[l3-unify] {msg}", flush=True)


def world_verts(obj: bpy.types.Object) -> list[Vector]:
    return [obj.matrix_world @ v.co for v in obj.data.vertices]


def sector_stats(objs: list[bpy.types.Object]) -> tuple[float, float, float, float]:
    rs: list[float] = []
    ys: list[float] = []
    for o in objs:
        for w in world_verts(o):
            rs.append(math.hypot(w.x, w.z))
            ys.append(w.y)
    return min(rs), max(rs), min(ys), max(ys)


def get_or_copy_material(source_objs: list[bpy.types.Object]) -> bpy.types.Material:
    for o in source_objs:
        for slot in o.material_slots:
            if slot.material:
                return slot.material.copy()
    mat = bpy.data.materials.new(name="L3_Red")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (1.0, 0.0527, 0.0693, 1.0)
        bsdf.inputs["Metallic"].default_value = 0.5
        bsdf.inputs["Roughness"].default_value = 0.55
    return mat


def octagon_xy(apothem: float, z: float, bm: bmesh.types.BMesh) -> list[bmesh.types.BMVert]:
    half = math.pi / SIDES
    r_vertex = apothem / math.cos(half)
    verts: list[bmesh.types.BMVert] = []
    for i in range(SIDES):
        ang = i * (2 * math.pi / SIDES) + half
        verts.append(bm.verts.new((r_vertex * math.cos(ang), r_vertex * math.sin(ang), z)))
    return verts


def build_octagon_yoke(
    r_inner: float,
    r_outer: float,
    y_min: float,
    y_max: float,
    material: bpy.types.Material,
) -> tuple[bpy.types.Object, float]:
    """
    Octagon tube along +Y.

    Outer vertices stay on the CAD circle (× RADIAL_SCALE) — same max reach
    as the good-size revision. Wall grows inward to ≈ CAD shell thickness.
    Returns (yoke_object, inner_apothem) so Mesh_0 can be fitted to the bore.
    """
    length = y_max - y_min
    y_center = 0.5 * (y_min + y_max)

    half = math.pi / SIDES
    # Outer envelope = previous good size (vertices ≈ CAD outer × scale).
    outer_apothem = r_outer * math.cos(half) * RADIAL_SCALE
    cad_wall = r_outer - r_inner
    wall = cad_wall * RADIAL_SCALE
    # Thicken inward only — do not push past the CAD outer circle.
    inner_apothem = outer_apothem - wall

    rib_depth = wall * RIB_DEPTH_FRAC
    log(
        f"yoke wall={wall:.1f}cm (CAD wall={cad_wall:.1f}) "
        f"inner={inner_apothem:.1f} outer={outer_apothem:.1f} "
        f"(outer vertex≈{outer_apothem / math.cos(half):.1f})"
    )

    samples_per_rib = 4
    v_rings = RIB_COUNT * samples_per_rib + 1

    bm = bmesh.new()
    outs: list[list[bmesh.types.BMVert]] = []
    inns: list[list[bmesh.types.BMVert]] = []

    for iv in range(v_rings):
        t = iv / (v_rings - 1)
        z = -0.5 * length + t * length
        phase = (t * RIB_COUNT) % 1.0
        in_rib = abs(phase - 0.5) <= (RIB_WIDTH_FRAC * 0.5)
        outer_a = outer_apothem + (rib_depth if in_rib else 0.0)
        outs.append(octagon_xy(outer_a, z, bm))
        inns.append(octagon_xy(inner_apothem, z, bm))

    bm.verts.ensure_lookup_table()

    def bridge_rings(
        a: list[bmesh.types.BMVert], b: list[bmesh.types.BMVert], flip: bool = False
    ) -> None:
        n = len(a)
        for i in range(n):
            j = (i + 1) % n
            if flip:
                bm.faces.new((a[i], a[j], b[j], b[i]))
            else:
                bm.faces.new((a[i], b[i], b[j], a[j]))

    for i in range(len(outs) - 1):
        bridge_rings(outs[i], outs[i + 1], flip=False)
    for i in range(len(inns) - 1):
        bridge_rings(inns[i], inns[i + 1], flip=True)
    bridge_rings(outs[0], inns[0], flip=True)
    bridge_rings(outs[-1], inns[-1], flip=False)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    mesh = bpy.data.meshes.new("L3_Yoke_Octagon")
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    obj = bpy.data.objects.new("Mesh_1", mesh)
    bpy.context.scene.collection.objects.link(obj)

    obj.matrix_world = (
        Matrix.Translation((0.0, y_center, 0.0))
        @ Matrix.Rotation(-math.pi / 2, 4, "X")
    )
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.select_set(False)

    if obj.data.materials:
        obj.data.materials[0] = material
    else:
        obj.data.materials.append(material)

    for poly in obj.data.polygons:
        poly.use_smooth = False
    obj.data.update()

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)

    return obj, inner_apothem


def build_octagon_liner(
    bore_apothem: float,
    y_min: float,
    y_max: float,
    material: bpy.types.Material,
) -> bpy.types.Object:
    """Thin octagon shell flush with the yoke bore (same frame as the yoke)."""
    gap = min(LINER_GAP_CM, max(0.0, bore_apothem - LINER_THICKNESS_CM - 1.0))
    outer_apothem = bore_apothem - gap
    inner_apothem = max(1.0, outer_apothem - LINER_THICKNESS_CM)
    length = y_max - y_min
    y_center = 0.5 * (y_min + y_max)
    log(
        f"Mesh_0 octagon liner outer={outer_apothem:.1f} inner={inner_apothem:.1f} "
        f"gap→bore={gap:.1f}"
    )

    bm = bmesh.new()
    # Two rings (front/back) are enough for a smooth tube.
    outs: list[list[bmesh.types.BMVert]] = []
    inns: list[list[bmesh.types.BMVert]] = []
    for z in (-0.5 * length, 0.5 * length):
        outs.append(octagon_xy(outer_apothem, z, bm))
        inns.append(octagon_xy(inner_apothem, z, bm))
    bm.verts.ensure_lookup_table()

    def bridge(
        a: list[bmesh.types.BMVert], b: list[bmesh.types.BMVert], flip: bool = False
    ) -> None:
        n = len(a)
        for i in range(n):
            j = (i + 1) % n
            if flip:
                bm.faces.new((a[i], a[j], b[j], b[i]))
            else:
                bm.faces.new((a[i], b[i], b[j], a[j]))

    bridge(outs[0], outs[1], flip=False)
    bridge(inns[0], inns[1], flip=True)
    bridge(outs[0], inns[0], flip=True)
    bridge(outs[1], inns[1], flip=False)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    mesh = bpy.data.meshes.new("L3_Liner_Octagon")
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    obj = bpy.data.objects.new("Mesh_0", mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.matrix_world = (
        Matrix.Translation((0.0, y_center, 0.0))
        @ Matrix.Rotation(-math.pi / 2, 4, "X")
    )
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.select_set(False)

    if obj.data.materials:
        obj.data.materials[0] = material
    else:
        obj.data.materials.append(material)
    for poly in obj.data.polygons:
        poly.use_smooth = False
    obj.data.update()

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)
    return obj


def main() -> int:
    if not os.path.isfile(INPUT):
        log(f"missing input: {INPUT}")
        return 1

    log(f"input={INPUT}")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=INPUT)

    all_meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    sectors = [
        o
        for o in all_meshes
        if o.name.split(".")[0] in ("Mesh_1", "Mesh_2", "Mesh_3")
    ]
    mesh0_list = [o for o in all_meshes if o.name.split(".")[0] == "Mesh_0"]

    log(f"imported meshes={len(all_meshes)} sectors={len(sectors)} mesh0={len(mesh0_list)}")
    if not sectors:
        log("no Mesh_1/2/3 sectors found")
        return 1

    r_inner, r_outer, y_min, y_max = sector_stats(sectors)
    r_liner = 0.0
    if mesh0_list:
        _a, r_liner, _b, _c = sector_stats(mesh0_list)
        log(
            f"CAD gap liner→yoke≈{r_inner - r_liner:.1f}cm "
            f"(liner={r_liner:.1f}, yoke_inner={r_inner:.1f}, yoke_outer={r_outer:.1f})"
        )

    material = get_or_copy_material(sectors + mesh0_list)

    bpy.ops.object.select_all(action="DESELECT")
    for o in sectors:
        o.select_set(True)
    bpy.ops.object.delete()

    barrel, inner_apothem = build_octagon_yoke(
        r_inner, r_outer, y_min, y_max, material
    )
    log(f"built {barrel.name} tris≈{len(barrel.data.polygons)}")

    # Drop CAD circular liner — it left a dark ring in the octagon corners.
    bpy.ops.object.select_all(action="DESELECT")
    for o in mesh0_list:
        o.select_set(True)
    if mesh0_list:
        bpy.ops.object.delete()
    liner = build_octagon_liner(inner_apothem, y_min, y_max, material)
    log(f"built {liner.name} tris≈{len(liner.data.polygons)}")

    for o in list(bpy.context.scene.objects):
        if o.type != "MESH":
            bpy.data.objects.remove(o, do_unlink=True)

    kept = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    log(f"exporting {len(kept)} meshes → {OUTPUT}")
    for o in kept:
        log(f"  {o.name}: tris={len(o.data.polygons)}")

    bpy.ops.object.select_all(action="DESELECT")
    for o in kept:
        o.select_set(True)

    bpy.ops.export_scene.gltf(
        filepath=OUTPUT,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=True,
        export_materials="EXPORT",
        export_yup=True,
    )

    log(f"done size={os.path.getsize(OUTPUT)} bytes")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        log(f"FAILED: {exc}")
        raise
