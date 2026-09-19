using System.Collections.Generic;
using System.Linq;

namespace CutOnce.Core
{
    public enum BaseVisual { BUILT_LIVE, BUILT_REPLAY, CURRENT_STEP, MISSING, FUTURE, WRONG }
    public enum VisualModifier { SELECTED, HIGHLIGHTED }

    public sealed class PartVisual
    {
        public BaseVisual Base;
        public List<VisualModifier> Modifiers = new List<VisualModifier>();
    }

    /// <summary>
    /// The only code that decides how a part looks (blueprint §8); twin of resolveVisuals in visual.ts.
    /// WRONG beats built beats current step beats available beats blocked.
    /// </summary>
    public static class VisualStateResolver
    {
        public static Dictionary<string, PartVisual> Resolve(PlanDto plan, BuildStateDto state, string selected = null,
                                                             IEnumerable<string> highlighted = null, bool replay = false)
        {
            var current = new HashSet<string>(plan.steps.FirstOrDefault(s => s.step_id == state.current_step_id)?.part_ids ?? new List<string>());
            var available = new HashSet<string>(state.available_part_ids);
            var lit = new HashSet<string>(highlighted ?? Enumerable.Empty<string>());
            var result = new Dictionary<string, PartVisual>();
            foreach (var part in plan.parts)
            {
                string s = state.parts.TryGetValue(part.part_id, out var status) ? status.state : "missing";
                var visual = new PartVisual
                {
                    Base = s == "wrong" ? BaseVisual.WRONG
                         : s == "built" ? (replay ? BaseVisual.BUILT_REPLAY : BaseVisual.BUILT_LIVE)
                         : current.Contains(part.part_id) ? BaseVisual.CURRENT_STEP
                         : available.Contains(part.part_id) ? BaseVisual.MISSING
                         : BaseVisual.FUTURE,
                };
                if (selected == part.part_id) visual.Modifiers.Add(VisualModifier.SELECTED);
                if (lit.Contains(part.part_id)) visual.Modifiers.Add(VisualModifier.HIGHLIGHTED);
                result[part.part_id] = visual;
            }
            return result;
        }
    }
}
