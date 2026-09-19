# Procedural generation of a detailed E7 architectural model (2D vector plans + floor heights → named-node GLB for Unity)

Scope note: these notes compare generation approaches for turning traced 2D footprints plus floor heights into walls with real openings, curtain walls, slabs, stairs, an atrium void and a sawtooth roof, exported as GLB with one stable named node per element. The work has to fit one Python developer on an Apple M3 Mac, under about 8 hours.

Where a finding says **"local test (this session)"**, I ran it on the developer's Mac on 2026-09-19 in a throwaway venv (Python 3.12, trimesh 5.1.0, manifold3d 3.5.3, shapely 2.1.2, ifcopenshell 0.8.5). Those numbers are measured, not taken from docs. The scripts are in the session scratchpad and are not part of the repo. Library versions and dates come from the PyPI JSON API and the GitHub API, queried on 2026-09-19.

## Objective: which approach, compared side by side

### Takeaway
The fastest safe route is to **stay in the existing Python pipeline**: shapely footprints, then trimesh extrusion, then manifold3d one-shot booleans for punched openings, then `trimesh.Scene` nodes named by `part_id`. It builds a whole 8-storey stand-in in about 0.25 s and keeps the Plan JSON contract unchanged. **IfcOpenShell is the best "upgrade" option** if BIM semantics are wanted for the Elasticsearch side. Its glTF serializer did emit IfcRoot.Name as node names in a local test, so `part_id` names can survive. Blender, CityEngine, Houdini, CityGML tools and the floorplan-to-3D repos are all slower to adopt, risky on macOS, or aimed at raster residential plans.

### Cited Findings
- trimesh 5.1.0, released 2026-08-31, MIT licence, Python ≥3.10 — [PyPI trimesh](https://pypi.org/project/trimesh/); repo pushed 2026-09-18, 3.7k stars — [GitHub mikedh/trimesh](https://github.com/mikedh/trimesh)
- manifold3d 3.5.3, released 2026-09-07, Apache-2.0, Python ≥3.9 — [PyPI manifold3d](https://pypi.org/project/manifold3d/), [GitHub elalish/manifold](https://github.com/elalish/manifold)
- shapely 2.1.2, released 2025-09-24, BSD-3-Clause — [PyPI shapely](https://pypi.org/project/shapely/)
- build123d 0.12.0, released 2026-09-18, Apache-2.0, Python 3.10–3.14 — [PyPI build123d](https://pypi.org/project/build123d/); CadQuery 2.8.0, released 2026-06-21, Apache-2.0, Python ≥3.11 — [PyPI cadquery](https://pypi.org/project/cadquery/)
- ifcopenshell 0.8.5, released 2026-04-13, Python 3.10–3.14, LGPL-3.0 (repo licence) — [PyPI ifcopenshell](https://pypi.org/project/ifcopenshell/), [GitHub IfcOpenShell](https://github.com/IfcOpenShell/IfcOpenShell). The latest GitHub tag is the Bonsai nightly `bonsai-0.9.0-alpha2609190120`, published 2026-09-19 — [GitHub releases](https://github.com/IfcOpenShell/IfcOpenShell/releases)
- bpy (Blender as a Python module) 5.2.2, released 2026-09-15, GPL-3.0, **requires Python 3.13 exactly** — [PyPI bpy](https://pypi.org/project/bpy/)
- PyVista 0.49.0 (2026-09-08, MIT) and Open3D 0.20.0 (2026-09-16, MIT) — [PyPI pyvista](https://pypi.org/project/pyvista/), [PyPI open3d](https://pypi.org/project/open3d/)
- Building Tools (Blender add-on): v1.0.13 (2025-05-16), MIT, repo pushed 2026-09-17, 1.5k stars — [GitHub ranjian0/building_tools](https://github.com/ranjian0/building_tools)
- glTFast (Unity importer) 6.20.0, released 2026-09-18 — [GitHub atteneder/glTFast](https://github.com/atteneder/glTFast); UnityGLTF 2.20.0, released 2026-07-31, MIT — [GitHub KhronosGroup/UnityGLTF](https://github.com/KhronosGroup/UnityGLTF)
- Local test (this session): a trimesh prototype of an 8-storey stand-in produced **41 named nodes, 19,488 triangles and a 0.2 MB GLB in 0.24 s build+export**, and the node names survived into the GLB (`L1_slab`, `L1_curtainwall_frame`, …). The prototype had a 60×40 m L-shaped footprint, an atrium void cut from the floor plates of levels 2–8, a perimeter curtain wall on a 1.5 m module with transoms, a core wall with 9 boolean window openings per floor, a stair per floor and a 10-tooth sawtooth roof. It used [trimesh.creation.extrude_polygon](https://trimesh.org/trimesh.creation.html) and [trimesh.boolean](https://trimesh.org/trimesh.boolean.html)

### Inferences
Comparison matrix, synthesised from the findings in all sections below. "Setup+learn" means realistic hours to a first detailed E7 GLB for a Python-comfortable developer who already has shapely/trimesh working.

| Approach | Licence / cost | Maturity (latest) | Interface | Parametric elements it gives you | GLB with named nodes? | Setup+learn for this task |
|---|---|---|---|---|---|---|
| **trimesh + shapely + manifold3d (current stack)** | MIT / BSD / Apache, free | trimesh 5.1.0 (Aug 2026), manifold3d 3.5.3 (Sep 2026) | Python | Anything you write: slab extrusions with holes (atrium), walls, boolean openings, mullion grids, stairs, extruded roof profiles | **Yes**: `scene.add_geometry(..., node_name=part_id)`; verified | **0–1 h setup; 4–6 h to write the element generators** |
| **IfcOpenShell API → glTF serializer / IfcConvert** | LGPL-3.0, free | 0.8.5 (Apr 2026), very active | Python (`ifcopenshell.api.*`) + CLI | IfcWall/IfcSlab via `add_wall_representation`/`add_slab_representation`; IfcOpeningElement voids + IfcWindow/IfcDoor fillings (boolean done by the kernel); psets; storeys | **Yes, with `use-element-names`** (local test); default names are `product-<guid>-body` | 1–2 h to learn the API; 5–7 h total. Riskier than trimesh because OCC boolean/tessellation errors are harder to debug |
| build123d / CadQuery (OCCT B-rep) | Apache-2.0, free | build123d 0.12.0 (Sep 2026), CadQuery 2.8.0 (Jun 2026) | Python | Exact solids, fillets, sweeps; walls with openings via B-rep booleans | Yes: `export_gltf` writes XCAF labels from `shape.label` (source code) | 2–3 h learning; B-rep booleans on hundreds of openings are slower than Manifold (not benchmarked here) |
| Blender (bpy / Geometry Nodes / Building Tools / Bonsai) | GPL, free | Blender 5.2; Building Tools 1.0.13 targets Blender 4.0 | Python (bpy) + GUI | Building Tools: floors, windows, doors, balconies, stairs, roofs. GN: arrays/instancing for mullions | Yes, object names → node names; custom props → `extras` | 2–4 h if new to bpy; Blender.app is missing on this Mac (the cask wrapper is dangling), so reinstall first |
| CityEngine CGA / PyPRT | ~US$1,898/yr subscription; PyPRT free for non-commercial use | CityEngine 2025.x; **no macOS since 2020.1**; PyPRT wheels Linux/Windows only | CGA + Python | Best-in-class facade grammars | Yes (CityEngine exports) | **Not viable on an M3 Mac in the time available** |
| Houdini (Apprentice/Indie) | Apprentice free but non-commercial, limited export; Indie ~US$299/yr | Current | VEX/Python/nodes | Very strong procedural facades | Indie yes; Apprentice cannot export standard formats | 8 h+ learning curve; licence friction |
| Unity-side (ProBuilder / BuildR / runtime generation) | ProBuilder free; BuildR paid Asset Store | ProBuilder repo active Sep 2026 | C# | BuildR: facades, interiors, runtime generation | n/a (native GameObjects) | Loses the Python Plan/GLB single source of truth; not recommended |
| CityGML/CityJSON (3dfier, cjio, citygml-tools) | GPL / MIT / Apache | 3dfier 1.5.0 (Sep 2026) | CLI/Python | LOD1–LOD2 blocks from 2D + lidar; LOD3 needs manual modelling | Via conversion only | Overkill |
| Floor-plan-image → 3D repos | Mixed / none | Mostly 2024 or earlier | Python/Unity | Raster residential walls; some openings | Varies | Not useful: they solve raster detection, and the team already has vectors |

- Recommended plan for about 8 h: (1) extend the current trimesh generator with per-element builders (slab-with-holes, wall-with-openings, curtain-wall frame + glass, stair, sawtooth roof): about 4–5 h. (2) Optionally, in parallel or afterwards, mirror each element into an IFC file with ifcopenshell (same `part_id` as IfcRoot.Name, a GlobalId stored in the Plan) only for the Elasticsearch knowledge side: about 2 h. That way the GLB stays trimesh-generated and deterministic, and IFC adds semantics without being on the critical path.

### Gaps
- No head-to-head benchmark of OCCT (build123d/CadQuery/IfcOpenShell) versus Manifold for hundreds of openings was run. Only Manifold and a 40-opening IFC wall were timed locally.
- Houdini on Apple Silicon support and exact current Apprentice export restrictions were taken from secondary sources (see the shape-grammar section).

## Python/code-first: trimesh + shapely + manifold3d, CadQuery/build123d, Open3D, PyVista, and the cost of boolean-cutting hundreds of windows

### Takeaway
Manifold (through trimesh) makes hundreds of openings effectively free: 528 windows cut from a 100 m × 8-storey wall in about 80 ms, watertight. There are two real pitfalls. First, trimesh hands Manifold **float32** vertices, so geometry at UTM-scale coordinates silently collapses to an empty mesh; build in a local origin. Second, use one difference call per wall, not per window, and prefer modelling voids as shapely polygon holes (atrium) rather than 3D booleans.

### Cited Findings
- trimesh supports boolean ops through Manifold3D or Blender. manifold3d is the preferred engine, and if neither is installed it raises "No boolean backend: `pip install manifold3d` or install `blender`" — [trimesh/boolean.py](https://github.com/mikedh/trimesh/blob/main/trimesh/boolean.py), [trimesh.boolean docs](https://trimesh.org/trimesh.boolean.html)
- In `boolean_manifold`, a difference over more than 2 meshes **first unions all the cutters with `reduce_cascade`, then subtracts once**. So `trimesh.boolean.difference([wall] + cutters)` is the efficient batch form — [trimesh/boolean.py](https://github.com/mikedh/trimesh/blob/main/trimesh/boolean.py)
- The same function converts vertices with `np.array(mesh.vertices, dtype=np.float32)` and faces with `np.uint32`. `check_volume=True` (the default) raises "Not all meshes are volumes!" unless every input is watertight — [trimesh/boolean.py](https://github.com/mikedh/trimesh/blob/main/trimesh/boolean.py)
- Manifold is an Apache-2.0 C++ kernel "where every mesh it produces is guaranteed to be manifold"; it is much faster than the older Blender backend — [trimesh PyPI](https://pypi.org/project/trimesh/), [trimesh.boolean docs](https://trimesh.org/trimesh.boolean.html)
- A vendor benchmark (MeshLib, so possibly biased) reports MeshLib about 3× faster than Manifold and about 150× faster than Blender-via-trimesh on a 2M-triangle union — [MeshLib 2026 benchmark](https://meshlib.io/blog/comparing-3d-boolean-libraries/)
- **Local test (this session), 1.2 × 1.8 m windows at a 1.5 m pitch in a 0.3 m wall, measured with [trimesh.boolean](https://trimesh.org/trimesh.boolean.html) + [manifold3d](https://pypi.org/project/manifold3d/):**
  - 30 m single-storey wall, 20 windows: 26 ms, 412 tris, watertight
  - 100 m single-storey wall, 66 windows: 73 ms, 1,332 tris, watertight
  - 100 m × 8-storey wall, **528 windows: 83 ms**, 10,572 tris, watertight
  - Native `Manifold.batch_boolean(..., OpType.Add)` then subtract: 78 ms. A naive Python loop of 528 sequential subtractions: 94 ms. Manifold evaluates lazily, so even the naive loop is fine at this scale.
- **Local test (this session): float32 pitfall.** The same wall and one window, translated to UTM-like coordinates (538000.37, 4812000.37), returned a **0-face (empty) mesh** from `trimesh.boolean.difference(..., engine="manifold")`. At a local origin it returned a correct 32-face mesh. Mechanism: the float32 cast in [trimesh/boolean.py](https://github.com/mikedh/trimesh/blob/main/trimesh/boolean.py)
- build123d's glTF/STEP exporter builds an OCCT XCAF document and writes each shape's `label` into `TDataStd_Name` (also on the referred shape) along with its colour. That is how assembly labels become named nodes — [build123d exporters3d.py](https://github.com/gumyr/build123d/blob/dev/src/build123d/exporters3d.py)
- PyVista's built-in booleans wrap VTK's `vtkBooleanOperationPolyDataFilter`, which "produces non-manifold or self-intersecting output on non-trivial inputs". The official `pyvista-manifold` plugin exists to route booleans through Manifold instead — [pyvista-manifold](https://github.com/pyvista/pyvista-manifold), [PyVista issue #4843](https://github.com/pyvista/pyvista/issues/4843), [PyVista discussion #2379](https://github.com/pyvista/pyvista/discussions/2379)
- Open3D's `write_triangle_mesh` takes a single `TriangleMesh`. Multi-mesh models are a separate `TriangleMeshModel` class, and the docs do not describe named multi-node glTF writing — [open3d.io.write_triangle_mesh](https://www.open3d.org/docs/release/python_api/open3d.io.write_triangle_mesh.html), [TriangleMeshModel](https://www.open3d.org/docs/release/python_api/open3d.visualization.rendering.TriangleMeshModel.html)
- Local test (this session): `trimesh.creation.extrude_polygon` triangulated shapely polygons with interior holes (floor plate minus atrium) with only trimesh, shapely, manifold3d and numpy installed — [trimesh.creation](https://trimesh.org/trimesh.creation.html)

### Inferences
- Pipeline rules that follow from the above:
  1. Keep all modelling in a local metric frame near the origin (for example, subtract the footprint centroid) and apply georeferencing or Unity placement afterwards.
  2. Model the atrium and shafts as **shapely holes** in the slab polygon (`floor.difference(atrium)`) before extrusion. That is exact and needs no 3D boolean.
  3. Cut punched windows and doors in solid walls with **one** `difference([wall]+cutters)` per wall segment. Make cutters thicker than the wall (for example 3× thickness) so there are no coplanar faces.
  4. For curtain walls, **don't boolean at all**: generate mullion/transom boxes and glass quads directly.
  5. Pass `check_volume=False` only after you know inputs are boxes or extrusions; `is_volume` checks are expensive.
- Open3D and PyVista add nothing for authoring here. They are analysis and visualisation libraries whose boolean or export paths are weaker than trimesh + Manifold.
- build123d/CadQuery would give exact B-rep and nicer mullion profiles, but add an OCCT dependency (a big wheel), tessellation-tolerance tuning and slower booleans. That isn't worth it with under 22 h to freeze.
- Triangle budgets: an 8-storey building with full curtain walls came out around 20k tris in the prototype, well within Quest 3 limits. The per-floor frame/glass split also gives separate materials, since glass needs a transparent hologram shader.

### Gaps
- The glTF (not STEP) node names from build123d were not verified by running code; the claim rests on the source code.
- Whether a newer trimesh exposes a float64 path to Manifold was not checked. manifold3d itself has float32 `vert_properties` in its `Mesh` type (seen in the trimesh call site).

## IFC route: IfcOpenShell API authoring, IfcConvert to GLB, Bonsai, plan-to-IFC scripts, and BIM semantics for Elasticsearch

### Takeaway
IfcOpenShell can author exactly the needed classes from 2D data in plain Python: walls, slabs, IfcOpeningElement voids with IfcWindow/IfcDoor fillings, storeys and psets. Its C++ glTF serializer (the one IfcConvert uses) **does** honour `use-element-names` for GLB in 0.8.5 according to a local test, even though the docs list that flag only for OBJ/DAE/STEP/SVG. Node names can therefore equal `part_id`. The GLB is flat (no storey hierarchy) and carries no properties or extras, so semantics would have to reach Elasticsearch from the IFC file itself.

### Cited Findings
- Opening workflow: create `IfcOpeningElement`, give it geometry, then `ifcopenshell.api.feature.add_feature(file, feature=opening, element=wall)` to void the wall and `add_filling(file, opening=opening, element=door)` to fill it. Geometry helpers include `geometry.add_wall_representation(context, length, height, thickness)`, `geometry.add_slab_representation(...)`, `assign_representation` and `edit_object_placement(matrix=...)` — [ifcopenshell.api.feature docs](https://docs.ifcopenshell.org/autoapi/ifcopenshell/api/feature/index.html)
- The wall stays a plain prism in IFC. "The opening element will automatically perform a geometric boolean operation to cut out the wall's geometry" at tessellation time — [ifcopenshell.api.feature docs](https://docs.ifcopenshell.org/autoapi/ifcopenshell/api/feature/index.html), [OSArch discussion](https://community.osarch.org/discussion/1757/ifcopenshell-python-change-wall-and-window-geometries)
- A step-by-step tutorial (IfcOpenHouse) builds a whole house with the IfcOpenShell Python API — [OSArch IfcOpenHouse](https://community.osarch.org/discussion/1471/ifcopenhouse-step-by-step-tutorial-with-the-ifcopenshell-python-api)
- IfcConvert outputs include OBJ, DAE, **GLB/glTF**, STEP, IGES, XML, JSON, SVG, HDF5, TTL/WKT and IFC. The docs list `--use-element-names`, `--use-element-guids` and `--use-element-step-ids` as applying to OBJ/DAE/STEP/SVG. `--y-up` is OBJ-only. `--ecef` writes glTF in ECEF (needs PROJ). `-j/--threads` parallelises — [IfcConvert usage](https://docs.ifcopenshell.org/ifcconvert/usage.html)
- The default glTF node names are `product-<hex GUID>-body`: the prefix exists because some formats reject leading digits, and `-body` is the representation context. `--use-element-guids` puts raw GlobalIds in the output, which "should work" for glTF — [IfcOpenShell discussion #5430](https://github.com/IfcOpenShell/IfcOpenShell/discussions/5430)
- In the source (v0.8.0), glTF nodes are named with `node["name"] = object_id(o)` and meshes with the geometry id. Materials come from IFC styles, with `doubleSided: true` and PBR baseColor/roughness — [GltfSerializer.cpp](https://github.com/IfcOpenShell/IfcOpenShell/blob/v0.8.0/src/serializers/GltfSerializer.cpp)
- An old issue reports that `--use-element-hierarchy` omitted the IfcProject node and ignored `--use-element-names/guids` for site/building/storey nodes — [IfcOpenShell issue #397](https://github.com/IfcOpenShell/IfcOpenShell/issues/397)
- **Local test (this session), ifcopenshell 0.8.5:**
  - Authored an IFC4 file (project → site → building → storey "L3", one 60 m wall with 40 opening+window pairs, one slab, one `Pset_WallCommon`) in **306 ms**.
  - Serialized it to GLB with `ifcopenshell.geom.serializers.gltf`:
    - Default: nodes named `product-83f530a0-…-body`.
    - **`serializer_settings.set("use-element-names", True)`: nodes named `L3_wall_north`, `L3_win_000` … `L3_slab`.**
    - `use-element-guids`: 22-character GlobalIds such as `23zJ2WKLrD5hL7th67l75U`.
  - Serialization took 175–325 ms (up to 828 ms in another run).
  - The wall mesh came out at 812 triangles, so all 40 openings were cut.
  - Openings appear as their own nodes unless excluded; passing `exclude=m.by_type("IfcOpeningElement")` to the geometry iterator removed them.
  - All nodes were scene roots (flat), no node `extras` were written, and `use-element-hierarchy` was "Setting not available" through the Python settings objects.
  - Sources: [IfcOpenShell](https://github.com/IfcOpenShell/IfcOpenShell), [ifcopenshell PyPI](https://pypi.org/project/ifcopenshell/)
- Bonsai (formerly BlenderBIM) is a free, open-source native IFC authoring platform inside Blender built on IfcOpenShell. It is distributed on the Blender Extensions platform — [Bonsai docs](https://docs.ifcopenshell.org/bonsai.html), [Blender Extensions: Bonsai](https://extensions.blender.org/add-ons/bonsai/), [bonsaibim.org](https://bonsaibim.org/)
- IfcCurtainWall is a building element whose parts are typically IfcMember (mullions/transoms) and IfcPlate (glass), all subclasses of IfcBuildingElement — [IfcOpenShell class docs: IfcCurtainWall](https://ifcopenshell.github.io/docs/rst_files/class_ifc4x2_1_1_ifc_curtain_wall.html), [IfcBuildingElement](https://ifcopenshell.github.io/docs/rst_files/class_ifc4_1_1_ifc_building_element.html)
- Bonsai maintains bidirectional mappings between IFC GlobalIds and Blender objects — [DeepWiki: Bonsai integration](https://deepwiki.com/IfcOpenShell/IfcOpenShell/4-blender-integration-(bonsai)) (secondary, auto-generated summary)

### Inferences
- Semantic payoff for the Elasticsearch/knowledge side: every element gets a class (IfcWall/IfcWindow/IfcCurtainWall/IfcStair/IfcSlab), a GlobalId, spatial containment (storey), aggregation (curtain wall → members/plates) and property sets. It is straightforward to walk the IFC with `ifcopenshell.util.element.get_psets` and index one document per element keyed by the same `part_id`. That supports answers to "which walls on L3 are external?" or "what fills opening X?".
- Recommended naming contract: set `IfcRoot.Name = part_id`, keep the GlobalId in the Plan JSON, serialize with `use-element-names`, and exclude IfcOpeningElement/IfcSpace. The GLB node names then match the existing 4D sequence. Because the GLB is flat, the `rests_on` and storey relations must continue to live in the Plan JSON.
- Risk: the geometry kernel (OpenCASCADE, or CGAL in newer builds) can fail on degenerate openings, and diagnosing that costs time. With a 22 h freeze, IFC is safer as a **parallel semantic export**, not the GLB source of truth, unless the developer already knows IfcOpenShell.
- `add_wall_representation` produces straight rectangular walls, so polyline or curved footprints need a wall per segment. Slabs take an arbitrary polyline via `add_slab_representation(polyline=...)`.

### Gaps
- No maintained "2D vector floor plan → IFC" GitHub script was found in the time available; this was not searched exhaustively. OSArch threads cover hand-written ifcopenshell scripts instead.
- Whether the IfcConvert **CLI** binary (as opposed to the Python serializer) honours `--use-element-names` for .glb was not run. It uses the same serializer class, so it probably does, but that is unverified.
- The CLI flags for stair authoring (IfcStair/IfcStairFlight parametric representation) were not checked; building stairs as extruded profiles or boxes is the safe assumption.

## Blender route: bpy scripting, Geometry Nodes, Archipack / Building Tools / Bonsai / Archimesh, headless Blender on Mac, glTF export with named objects

### Takeaway
Blender works well for render quality (the pre-rendered video) and its glTF exporter keeps object names and exports custom properties as `extras`. As the *generator*, though, it adds a second runtime and scripting model. On this Mac, `/opt/homebrew/bin/blender` points at a missing `/Applications/Blender.app`, so Blender must be reinstalled. Building Tools is the only maintained open-source building add-on found, and it targets Blender 4.0, not 5.x. Archipack's open-source repo stopped at Blender 2.79.

### Cited Findings
- The Blender glTF exporter supports "Extras (custom properties)". With **Include → Custom Properties** enabled, custom properties "are stored in the `extras` field on the corresponding object in the glTF file". Include filters: Selected Objects, Visible Objects, Renderable Objects, Active Collection (+ nested), Active Scene. Instances can be exported with `EXT_mesh_gpu_instancing` ("GPU Instances") — [glTF-Blender-IO manual source](https://github.com/KhronosGroup/glTF-Blender-IO/blob/main/docs/blender_docs/scene_gltf2.rst)
- `bpy` 5.2.2 is on PyPI (2026-09-15), GPL-3.0, and requires Python 3.13 exactly. It allows headless Blender from a normal Python process — [PyPI bpy](https://pypi.org/project/bpy/)
- Local observation (this session): `/opt/homebrew/bin/blender` is a Homebrew cask wrapper for Blender 5.2.0 that execs `/Applications/Blender.app/Contents/MacOS/Blender`, which does not exist ("No such file or directory"). A `brew reinstall --cask blender` (or `pip install bpy` under Python 3.13) is needed before any Blender route — [Homebrew blender cask](https://formulae.brew.sh/cask/blender)
- Building Tools (MIT, v1.0.13, "Blender 4.0") creates "Floorplans, Floors, Doors, Windows, Multigroup (door-window combinations), Roof, Stairs, Balcony" — [GitHub ranjian0/building_tools](https://github.com/ranjian0/building_tools)
- The open-source Archipack repo is "Archipack for blender 2.79", GPL-3.0, last pushed 2020-03-29 — [GitHub s-leger/archipack](https://github.com/s-leger/archipack). A third-party repo title asks "why archipack 2.6 doesn't work in my blender 4.0 and 4.3", which suggests compatibility trouble with newer Blender — [GitHub search result](https://github.com/barran453/why-archipack-2.6-doesnt-work-in-my-blender-4.0-and-4.3) (anecdotal)
- Bonsai is installable from the Blender Extensions platform and authors native IFC inside Blender — [Blender Extensions: Bonsai](https://extensions.blender.org/add-ons/bonsai/)
- The KhronosGroup glTF-Blender-IO repo was pushed on 2026-09-19 (actively maintained) — [GitHub glTF-Blender-IO](https://github.com/KhronosGroup/glTF-Blender-IO)

### Inferences
- The best use of Blender here is **downstream**: import the trimesh/IFC GLB into Blender for the pre-rendered video (materials, lighting, camera, keyframed reveals by object name). Generation should stay upstream.
- Geometry Nodes could instance mullions along curtain-wall edges cheaply. Driving GN from Python and baking to named objects is extra learning with no gain over trimesh boxes.
- Building Tools' operators are GUI-oriented (face selection → add window). Driving them headlessly from 2D footprints means reverse-engineering the operator props, which is risky in under 8 h.
- For the 4D sequence, keep object names equal to `part_id`. The exporter writes Blender object names as node names (standard behaviour). Custom properties such as `rests_on` or `step` could ride along as `extras`, but glTFast's extras support is limited (see the Unity section).

### Gaps
- Archimesh's status in Blender 5.x (it was a bundled add-on and moved to the extensions platform) was not verified.
- A manual page statement that node names equal object names was not retrieved (the manual URL returned 404). It is standard exporter behaviour, but the claim is uncited.
- Headless-Blender timing for generating about 1,000 objects was not measured, because Blender isn't installed.

## Shape grammars and facade generation: CGA / CityEngine, open-source alternatives, Houdini, and procedural or inverse-procedural facade research

### Takeaway
CGA/CityEngine is the gold standard, but it is **not available on macOS** (last Mac build 2020.1), costs about US$1.9k/yr, and PyPRT ships only Linux/Windows wheels. Houdini Indie is about US$299/yr with a <US$100k revenue cap, and Apprentice can't export usable formats. For one known building (E7), a hand-written "mini-grammar" in Python is faster: floor → bays at 1.5 m → spandrel/vision/mullion. Research on inverse procedural modelling from photos is interesting for the pitch but isn't deployable in 8 h.

### Cited Findings
- CityEngine pricing: a single-use perpetual licence is US$3,796 and an annual subscription US$1,898 (per a state price list surfaced via [TrustRadius](https://www.trustradius.com/products/arcgis-cityengine/pricing) and the [WA DES Esri price list](https://apps.des.wa.gov/contracting/09121_ESRI_Pricelist_11_24.pdf)). Esri is ending maintenance quotes for perpetual licences on 2026-11-30 — [Esri support](https://support.esri.com/en-us/knowledge-base/product-sales-update-arcgis-cityengine-000035055)
- CityEngine 2025.x runs on Windows and Linux only. Esri discontinued macOS after **CityEngine 2020.1** — [CityEngine system requirements](https://doc.arcgis.com/en/cityengine/latest/get-started/cityengine-system-requirements.htm), [Esri announcement](https://community.esri.com/t5/arcgis-cityengine-documents/announcement-deprecation-of-macos-version-of/ta-p/1038521)
- PyPRT (Python bindings for CityEngine's Procedural Runtime) is "free for personal, educational, and non-commercial use"; its source (without the SDK) is Apache-2.0. Packages exist "for Python 3.10, 3.11, 3.12 and 3.13 on Linux and Windows" (no macOS). Rule packages (RPK) are authored in CityEngine — [PyPRT README](https://github.com/Esri/pyprt/blob/main/README.md), [PyPI pyprt](https://pypi.org/project/pyprt/)
- Houdini Indie: US$299/yr per workstation as of September 2026 (secondary source), restricted to entities with <US$100K revenue — [SuperRendersFarm](https://superrendersfarm.com/article/how-much-does-houdini-cost), [SideFX Indie restrictions FAQ](https://www.sidefx.com/faq/question/indie-restrictions/). Apprentice renders are watermarked, scenes save in a non-commercial format, and Indie (not Apprentice) supports FBX/Alembic/USD export — [SuperRendersFarm](https://superrendersfarm.com/article/how-much-does-houdini-cost), [SideFX Indie FAQ](https://www.sidefx.com/faq/indie-new/)
- Research on inverse procedural modelling of facades:
  - "Inverse Procedural Modeling of Facade Layouts" (split-grammar inference from segmented facades) — [arXiv 1308.0419](https://arxiv.org/abs/1308.0419)
  - FaçAID, a transformer that infers grammar production rules from a segmented facade (SIGGRAPH Asia 2024) — [arXiv 2406.01829](https://arxiv.org/html/2406.01829)
  - Pro-DG, procedural diffusion guidance for facade generation — [arXiv 2504.01571](https://arxiv.org/abs/2504.01571)
  - "Synthesizing 3D Abstractions by Inverting Procedural Buildings with Transformers" — [arXiv 2501.17044](https://arxiv.org/html/2501.17044)
  - Single-view 3D reconstruction via inverse procedural modelling — [arXiv 2310.13373](https://arxiv.org/pdf/2310.13373)
  - Structurally informed facade parsing from imperfect images — [arXiv 2604.09260](https://arxiv.org/html/2604.09260)
- Other Blender procedural-building work: a master's-thesis Blender add-on for parametric building/floor-plan generation — [GitHub wojtryb/Procedural-Building-Generator](https://github.com/wojtryb/Procedural-Building-Generator)

### Inferences
- A minimal Python "split grammar" covers E7's facades. For each footprint edge and floor: split horizontally into spandrel (slab edge + ~0.9 m) / vision glass / head, split vertically into bays of about 1.5 m, then emit mullion, transom, glass and spandrel-panel parts. This is CGA's `split(x){~1.5: Bay}*` idea in about 50 lines, with deterministic `part_id`s (for example `L3_N_cw_bay07_glass`).
- Inverse procedural modelling from photos (FaçAID and similar) could, in principle, infer E7's bay rhythm from facade photos. None of these papers ships a pip-installable tool that would fit the time budget, so the idea is pitch material only.

### Gaps
- SceneCity (Blender city add-on, paid) was not researched; it targets city-scale road/building layout, not single detailed buildings.
- Houdini on macOS Apple Silicon, and the exact Apprentice export-format list, were not verified from SideFX primary pages in this session.
- Whether Esri offers a free student or hackathon CityEngine licence was not found.

## Unity side: ProBuilder, procedural building assets (BuildR), runtime generation versus importing a GLB

### Takeaway
Import the pre-generated GLB with glTFast or UnityGLTF, where node names become GameObject names, and drive the 4D reveal by name from the Plan JSON. Runtime generation in C# (ProBuilder or BuildR) would split the source of truth away from the Python Plan pipeline and add Quest-side CPU cost for no visual gain.

### Cited Findings
- In glTFast, "GltfImport is fully responsible for GameObject names". The Node Name Method option is "always OriginalUnique at design-time imports". `GameObjectInstantiator.SetNodeName` falls back to the first mesh name if a node has no name — [glTFast changelog](https://docs.unity3d.com/Packages/com.unity.cloud.gltfast@6.15/changelog/CHANGELOG.html), [GameObjectInstantiator API](https://docs.unity3d.com/Packages/com.unity.cloud.gltfast@5.2/api/GLTFast.GameObjectInstantiator.html), [GameObjectInstantiator.cs](https://github.com/atteneder/glTFast/blob/main/Runtime/Scripts/GameObjectInstantiator.cs)
- Node `extras` handling in glTFast was tracked as an enhancement request (issue #90), not a core feature — [glTFast issue #90](https://github.com/atteneder/glTFast/issues/90)
- glTFast 6.20.0 was released 2026-09-18 — [GitHub atteneder/glTFast](https://github.com/atteneder/glTFast). UnityGLTF 2.20.0 (MIT) was released 2026-07-31 — [GitHub KhronosGroup/UnityGLTF](https://github.com/KhronosGroup/UnityGLTF)
- ProBuilder's repository was active on 2026-09-14 — [GitHub Unity-Technologies/com.unity.probuilder](https://github.com/Unity-Technologies/com.unity.probuilder)
- BuildR (Asset Store, paid; BuildR 3 by Jasper Stocker) generates buildings "within the Unity editor and at runtime", including explorable interiors, with multithreaded generation — [Unity Discussions: BuildR 3](https://discussions.unity.com/t/released-buildr-3-procedural-building-and-city-generator/791614), [Asset Store BuildR list](https://assetstore.unity.com/lists/buildr-2966)

### Inferences
- Because glTFast guarantees unique original names, `part_id`s must be unique across the file. Duplicates would get suffixes and break the lookup. Keep per-element metadata (`step`, `rests_on`, IFC class, GlobalId) in the Plan JSON, not in glTF `extras`, since glTFast extras support is not reliable.
- For the hologram look, split glass from frames into separate nodes or materials so a Fresnel/transparent shader can be applied per material. Merge small parts per floor where the 4D sequence doesn't need individual reveals, to keep draw calls down on Quest 3.
- BuildR's price and whether it can follow an exact footprint weren't checked. It is irrelevant anyway, since the goal is fidelity to E7, not a generic building.

### Gaps
- Current BuildR price and Unity 6 compatibility were not found.
- ProBuilder's runtime CSG/boolean support in the current version was not verified.

## CityGML LOD2/LOD3 tooling (3dfier, citygml-tools, CityJSON): relevant or overkill?

### Takeaway
It's overkill. These tools produce block or roof-level (LOD1/LOD2) city models from GIS footprints and lidar, or convert between city-model formats. LOD3 facades with openings aren't generated automatically by them, and none of them helps with named-node GLB for a single building.

### Cited Findings
- 3dfier ("The open-source tool for creating 3D models"), GPL-3.0, v1.5.0 released 2026-09-08. It lifts 2D GIS polygons to 3D using elevation/lidar — [GitHub tudelft3d/3dfier](https://github.com/tudelft3d/3dfier)
- cjio ("Python CLI to process and manipulate CityJSON files"), MIT, v0.10.1 (2025-05-09) — [GitHub cityjson/cjio](https://github.com/cityjson/cjio)
- citygml-tools ("Collection of tools for processing CityGML files"), Apache-2.0, v2.5.0 (2026-04-19) — [GitHub citygml4j/citygml-tools](https://github.com/citygml4j/citygml-tools)

### Inferences
- The only plausible use is georeferenced context massing for campus neighbours in the video, and existing OSM/municipal massing would be quicker for that. For E7 itself, IFC is the richer semantic container and GLB the delivery format.

### Gaps
- Didn't check whether cjio's glTF export keeps CityObject IDs as node names; not needed given the recommendation.

## Modelling a convincing but cheap curtain wall and a sawtooth / north-light roof: typical dimensions

### Takeaway
Model curtain walls as generated boxes, never booleans:
- vertical mullions about 50–100 mm wide and 80–150 mm deep on a module of about 1.5 m
- horizontal transoms at sill (~0.9 m above slab) and head/slab edge
- one thin glass quad or box per bay, with an opaque spandrel band at each slab edge

Model the sawtooth roof as a 2D section profile (steep glazed face, shallow opaque slope) extruded along the building, one tooth per structural bay. Both elements are cheap in triangles and read well as a hologram.

### Cited Findings
- Typical stick-system mullion width is 50–100 mm, and mullion depth is "realistically between 80–120 mm". Unitized systems commonly use modules such as 1.5 m × 3 m, units are typically one storey tall (about 9–14 ft), and intermediate mullion centres range roughly 12–72 in. These figures come from a search-result summary drawing on [ARCHLine.XP curtain wall comparison](https://help.archlinexp.com/hc/en-us/articles/38905846816273-Comparison-of-curtain-wall-types) (page returned 403 on direct fetch, so it's unverified) and US patents ([US 10914066](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/10914066)); treat them as indicative
- A commercial mullion-transom system (Aluprof MB-SR60N, 60 mm face width per its name) offers transom depths from 49.5 to 249.5 mm — [Aluprof MB-SR60N](https://aluprof.com/en/product/mb-sr60n-brmb-sr60n-hi)
- North-light truss profile: an asymmetric section with one slope at ≥17° to horizontal and the glazed slope at about 60° to vertical, typical industrial spans 20–30 m — [XTD Steel north light truss](https://xtdsteel.com/north-light-truss-roof-system/) (vendor page, low authority). Sawtooth definition: alternating steep (often glazed, pole-facing) and shallow opaque faces with ridges parallel along the building — [RoofingCompare](https://www.roofingcompare.com/styles/sawtooth.html), [Wikipedia: Daylighting](https://en.wikipedia.org/wiki/Daylighting_(architecture))
- Local test (this session): a sawtooth roof built as 10 teeth (6 m pitch, 2.5 m rise, 0.3 m eave, vertical glazed face) by extruding a 2D shapely profile 25 m and rotating it into place took negligible time and added one named node (`ROOF_sawtooth`). The perimeter curtain wall (mullions every ~1.5 m + 2 transoms + glass per edge) for 8 floors was part of the 19,488-triangle total — [trimesh.creation.extrude_polygon](https://trimesh.org/trimesh.creation.html)

### Inferences
- Recipe per floor and per footprint edge:
  - `n = round(L/1.5)` bays
  - mullion boxes 0.07 × 0.15 m × (floor-to-floor − slab)
  - transoms at slab+0.9 m and at the head
  - glass as a 20 mm box inset about 50 mm from the mullion face
  - spandrel as an opaque band of about 0.9–1.2 m covering the slab edge
- Merge mullions and transoms into one `Lx_<facade>_cw_frame` node and glass into `Lx_<facade>_cw_glass`, unless the 4D sequence needs per-bay reveals.
- Use real E7 values from the drawings where available: the section gives floor-to-floor heights, and elevations give the bay rhythm. The 1.5 m module is a placeholder.
- Sawtooth: take tooth pitch from the drawings (structural bay). The glazed face should point roughly north for daylighting. Add glazing on the steep face as a separate glass node so the hologram shader highlights it.

### Gaps
- No authoritative (manufacturer or standards) source was retrieved for mullion *spacing* norms. The 1.5 m module is common practice but only weakly cited here.
- No E7-specific facade or roof dimensions were researched here (out of scope; another researcher covers the E7 drawings).

## Known repos that go from floor plan to 3D building with openings, end to end, and their quality

### Takeaway
All the end-to-end repos found start from **raster** plan images (OpenCV, Mask R-CNN, YOLO/VLM) and target single-storey residential layouts. Most are unmaintained or unlicensed. The team already has vector footprints, so these repos solve the wrong problem. At most they are references for how to structure wall-opening extrusion.

### Cited Findings
- **grebtsew/FloorplanToBlender3d**: GPL-3.0, 623 stars, last pushed 2024-10-09, no releases. It turns floorplan images into Blender walls, floors and rooms via "simple imaging" (OpenCV), and supports multi-plan "stacking" through its own parsing language. It requires Blender >2.93, and "floorplan images needs to be quite small for detections to work". Door/window opening cutting isn't explicitly documented — [GitHub grebtsew/FloorplanToBlender3d](https://github.com/grebtsew/FloorplanToBlender3d)
- **FloorPlanTo3D** (Unity client + Mask R-CNN API): `fadyazizz/FloorPlanTo3D-unityClient` has 83 stars, **no licence**, last pushed 2024-02-19; `fadyazizz/FloorPlanTo3D-API` has 27 stars, no licence, last pushed 2024-10-26. Forks claim "Mask R-CNN + Unity" navigable houses — [GitHub FloorPlanTo3D-unityClient](https://github.com/fadyazizz/FloorPlanTo3D-unityClient), [GitHub FloorPlanTo3D-API](https://github.com/fadyazizz/FloorPlanTo3D-API), [GitHub Anamika-JH/FloorPlanTo3D](https://github.com/Anamika-JH/FloorPlanTo3D)
- **nathanclearman/archbuildai**: MIT, 0 stars, pushed 2026-09-15. It describes "floor plan image → editable 3D model in Blender" with walls, door and window openings, floors, ceilings and named rooms, using local YOLO plus Qwen2.5-VL — [GitHub archbuildai](https://github.com/nathanclearman/archbuildai)
- **PlanTo3D** (priyanshsoni96-blip): its description claims PDF/PNG plan → .glb with walls, rooms, doors, windows and stairs via a CubiCasa5K U-Net plus trimesh/Open3D meshing. The GitHub API returned 404 for the repo on 2026-09-19 (deleted, renamed or private) — [search listing](https://github.com/priyanshsoni96-blip/PlanTo3D)
- **akramguediri/FloorPlan3DConverter**: Blender script that extrudes walls, applies materials and exports FBX — [GitHub](https://github.com/akramguediri/FloorPlan3DConverter). **hq9000/py_blender_room**: Python framework for building rooms with walls and windows via bpy — [GitHub](https://github.com/hq9000/py_blender_room)

### Inferences
- Quality: none of these handles curtain walls, atria, sawtooth roofs, multi-storey stacking with real floor heights, or stable per-element naming for a 4D sequence. Their value is limited to code patterns (wall-segment extrusion, opening placement).
- The unlicensed FloorPlanTo3D repos are "all rights reserved" by default, so code can't be copied into the project.

### Gaps
- None of these repos was run, so output quality is judged from READMEs and metadata only.
- A dedicated vector (DXF/SVG/GeoJSON) → IFC or → GLB-with-openings open-source tool was not found. One may exist under names not searched.
