"""Author a tiny IFC (storey, wall + opening + window, slab) with ifcopenshell.api,
then serialize to GLB with the same C++ glTF serializer IfcConvert uses, and print node names."""
import time
import numpy as np
import ifcopenshell, ifcopenshell.api, ifcopenshell.geom
import ifcopenshell.util.element
import ifcopenshell.api.project, ifcopenshell.api.root, ifcopenshell.api.unit, ifcopenshell.api.context, ifcopenshell.api.aggregate, ifcopenshell.api.geometry, ifcopenshell.api.spatial, ifcopenshell.api.feature, ifcopenshell.api.pset

api = ifcopenshell.api.run
t0 = time.perf_counter()
m = ifcopenshell.api.project.create_file(version="IFC4")
proj = ifcopenshell.api.root.create_entity(m, ifc_class="IfcProject", name="E7")
ifcopenshell.api.unit.assign_unit(m)
model3d = ifcopenshell.api.context.add_context(m, context_type="Model")
body = ifcopenshell.api.context.add_context(m, context_type="Model", context_identifier="Body", target_view="MODEL_VIEW", parent=model3d)
site = ifcopenshell.api.root.create_entity(m, ifc_class="IfcSite", name="Site")
bldg = ifcopenshell.api.root.create_entity(m, ifc_class="IfcBuilding", name="E7")
st = ifcopenshell.api.root.create_entity(m, ifc_class="IfcBuildingStorey", name="L3")
ifcopenshell.api.aggregate.assign_object(m, products=[site], relating_object=proj)
ifcopenshell.api.aggregate.assign_object(m, products=[bldg], relating_object=site)
ifcopenshell.api.aggregate.assign_object(m, products=[st], relating_object=bldg)

N = 40
wall = ifcopenshell.api.root.create_entity(m, ifc_class="IfcWall", name="L3_wall_north")
rep = ifcopenshell.api.geometry.add_wall_representation(m, context=body, length=N * 1.5, height=4.0, thickness=0.3)
ifcopenshell.api.geometry.assign_representation(m, product=wall, representation=rep)
ifcopenshell.api.geometry.edit_object_placement(m, product=wall)
ifcopenshell.api.spatial.assign_container(m, products=[wall], relating_structure=st)
for i in range(N):
    op = ifcopenshell.api.root.create_entity(m, ifc_class="IfcOpeningElement", name=f"op{i}")
    r = ifcopenshell.api.geometry.add_wall_representation(m, context=body, length=1.2, height=1.8, thickness=0.6)
    ifcopenshell.api.geometry.assign_representation(m, product=op, representation=r)
    M = np.identity(4); M[:, 3] = [0.15 + i * 1.5, -0.15, 0.9, 1]
    ifcopenshell.api.geometry.edit_object_placement(m, product=op, matrix=M)
    ifcopenshell.api.feature.add_feature(m, feature=op, element=wall)
    win = ifcopenshell.api.root.create_entity(m, ifc_class="IfcWindow", name=f"L3_win_{i:03d}")
    r = ifcopenshell.api.geometry.add_wall_representation(m, context=body, length=1.2, height=1.8, thickness=0.05)
    ifcopenshell.api.geometry.assign_representation(m, product=win, representation=r)
    M = np.identity(4); M[:, 3] = [0.15 + i * 1.5, 0.125, 0.9, 1]
    ifcopenshell.api.geometry.edit_object_placement(m, product=win, matrix=M)
    ifcopenshell.api.feature.add_filling(m, opening=op, element=win)
    ifcopenshell.api.spatial.assign_container(m, products=[win], relating_structure=st)
slab = ifcopenshell.api.root.create_entity(m, ifc_class="IfcSlab", name="L3_slab")
r = ifcopenshell.api.geometry.add_slab_representation(m, context=body, depth=0.3, polyline=[(0, 0), (60, 0), (60, 20), (0, 20)])
ifcopenshell.api.geometry.assign_representation(m, product=slab, representation=r)
ifcopenshell.api.geometry.edit_object_placement(m, product=slab)
ifcopenshell.api.spatial.assign_container(m, products=[slab], relating_structure=st)
pset = ifcopenshell.api.pset.add_pset(m, product=wall, name="Pset_WallCommon")
ifcopenshell.api.pset.edit_pset(m, pset=pset, properties={"IsExternal": True, "FireRating": "1HR"})
m.write("e7_test.ifc")
print(f"authored IFC with {N} windows in {(time.perf_counter()-t0)*1000:.0f} ms")

for label, extra in [("default", {}), ("use-element-names", {"use-element-names": True}), ("use-element-guids", {"use-element-guids": True})]:
    s = ifcopenshell.geom.settings()
    ss = ifcopenshell.geom.serializer_settings()
    for k, v in extra.items():
        try:
            ss.set(k, v)
        except Exception as e:
            print("  cannot set", k, e)
    fn = f"out_{label}.glb"
    t = time.perf_counter()
    ser = ifcopenshell.geom.serializers.gltf(fn, s, ss)
    ser.setFile(m)
    ser.writeHeader()
    it = ifcopenshell.geom.iterator(s, m)
    if it.initialize():
        while True:
            ser.write(it.get())
            if not it.next():
                break
    ser.finalize()
    del ser
    import pygltflib
    g = pygltflib.GLTF2().load(fn)
    names = [n.name for n in g.nodes]
    print(f"[{label}] {len(names)} nodes in {(time.perf_counter()-t)*1000:.0f} ms; sample: {names[:4]} ... {names[-3:]}")
    print("   extras on first node:", g.nodes[0].extras)
