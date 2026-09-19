using System.Collections.Generic;
using System.Linq;

namespace CutOnce.Core
{
    public sealed class MaterialLine
    {
        public string MaterialId, Name, Unit;
        public double Required, Used;
        public double Remaining => Required - Used;
    }

    /// <summary>
    /// Litematica's material list: what the whole build needs, what the finished steps have used, what is left.
    /// A step's materials count as used once every part of that step is built.
    /// </summary>
    public static class MaterialList
    {
        public static List<MaterialLine> For(PlanDto plan, BuildStateDto state)
        {
            var done = Reducer.DoneSteps(plan, state.parts);
            var lines = new Dictionary<string, MaterialLine>();
            foreach (var m in plan.materials)
                lines[m.material_id] = new MaterialLine { MaterialId = m.material_id, Name = m.name, Unit = m.unit };
            foreach (var step in plan.steps)
                foreach (var use in step.materials)
                {
                    if (!lines.TryGetValue(use.material_id, out var line)) continue;   // the validator reports unknown materials; don't crash the HUD
                    line.Required += use.qty;
                    if (done.Contains(step.step_id)) line.Used += use.qty;
                }
            return plan.materials.Select(m => lines[m.material_id]).Where(l => l.Required > 0).ToList();
        }
    }
}
