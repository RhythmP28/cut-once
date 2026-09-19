using System.Collections.Generic;

namespace CutOnce.Core
{
    // Hand-mirrored from packages/schemas/src/factory.ts (Plan). Field names are the JSON names on purpose:
    // Newtonsoft maps them with no attributes, and a search for a server field name finds the C# side too.
    // Vectors stay as double[3] here. Core has no UnityEngine reference, so it also runs under `dotnet test`.

    public sealed class PlanDto
    {
        public string plan_id;
        public string project_id;
        public string name;
        public int revision;
        public string status;                      // draft | approved
        public FrameDto frame;
        public double[] overall_size;              // optional
        public List<string> layers = new List<string>();
        public List<PartDto> parts = new List<PartDto>();
        public List<MaterialDto> materials = new List<MaterialDto>();
        public List<BuildStepDto> steps = new List<BuildStepDto>();
        public List<TouchPointDto> touch_points = new List<TouchPointDto>();
    }

    public sealed class FrameDto { public string handedness, up, units, pose, origin; }

    public sealed class ShapeDto
    {
        public string type;                        // box | cylinder | polyline | mesh
        public double[] size;                      // box
        public string axis;                        // cylinder: x | y | z
        public double diameter;                    // cylinder, polyline
        public double length;                      // cylinder
        public List<double[]> points;              // polyline
        public string uri, node;                   // mesh
        public BoundsDto bounds;                   // mesh, optional
    }

    public sealed class BoundsDto { public double[] min, max; }

    public sealed class PartDto
    {
        public string part_id, name, kind, layer, parent_id, material_id, step_id, verify_hint;
        public List<string> aliases = new List<string>();
        public ShapeDto shape;
        public double[] position;
        public double[] rotation_quat;             // optional, [x, y, z, w] in the plan's right-handed frame
        public List<string> rests_on = new List<string>();
        public double install_minutes;
        public Dictionary<string, string> external_ids;   // optional; carries source / tolerance_m tags
    }

    public sealed class MaterialDto
    {
        public string material_id, name, spec, unit;
        public double quantity;
        public List<string> used_by = new List<string>();
    }

    public sealed class StepMaterialDto { public string material_id; public double qty; }

    public sealed class BuildStepDto
    {
        public string step_id, title, instruction, layer;
        public int index;
        public List<string> part_ids = new List<string>();
        public List<string> requires = new List<string>();
        public double est_minutes;
        public List<StepMaterialDto> materials = new List<StepMaterialDto>();
    }

    public sealed class TouchPointDto { public string point_id, name; public double[] position; }
}
