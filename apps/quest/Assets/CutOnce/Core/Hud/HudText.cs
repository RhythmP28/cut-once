using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace CutOnce.Core
{
    /// <summary>
    /// Every sentence the HUD shows, as pure functions of plan and state. Keeping the wording here (not in the
    /// MonoBehaviour) means it is tested, and that the web Director page and the headset can be compared line by line.
    /// </summary>
    public static class HudText
    {
        static string N(double v) => v.ToString("0.#", CultureInfo.InvariantCulture);

        /// <summary>The copilot's answer card: the answer, then the drawing it came from (the "source card").</summary>
        public static string AnswerCard(string answer, string sourceTitle, string sheetId, int page)
        {
            if (string.IsNullOrEmpty(sourceTitle) && string.IsNullOrEmpty(sheetId)) return answer ?? "";
            string sheet = string.IsNullOrEmpty(sheetId) ? "" : $"sheet {(sheetId.StartsWith("sheet_") ? sheetId.Substring(6) : sheetId).ToUpperInvariant()} · ";
            string title = string.IsNullOrEmpty(sourceTitle) ? "" : sourceTitle + " · ";
            return $"{answer}\nSource: {title}{sheet}page {page}";
        }

        public static string Progress(BuildStateDto s) => $"{s.progress.built} / {s.progress.total} · {s.progress.pct}%";

        public static string TimeLeft(BuildStateDto s) => s.progress.built == s.progress.total ? "Build complete" : $"About {N(s.progress.minutes_left)} min left";

        public static BuildStepDto CurrentStep(PlanDto plan, BuildStateDto s) => plan.steps.FirstOrDefault(x => x.step_id == s.current_step_id);

        public static string StepTitle(PlanDto plan, BuildStateDto s)
        {
            var step = CurrentStep(plan, s);
            return step == null ? "All steps done" : $"Step {step.index} of {plan.steps.Count} · {step.title}";
        }

        /// <summary>The coaching line: what to do now and what to pick up for it.</summary>
        public static string StepBody(PlanDto plan, BuildStateDto s)
        {
            var step = CurrentStep(plan, s);
            if (step == null) return "Every part is in place.";
            var names = plan.materials.ToDictionary(m => m.material_id, m => m.name);
            var needs = step.materials.Select(m => $"{N(m.qty)} × {(names.TryGetValue(m.material_id, out var n) ? n : m.material_id)}").ToList();
            return needs.Count == 0 ? step.instruction : $"{step.instruction}\nYou need: {string.Join(", ", needs)}";
        }

        public static string Materials(IEnumerable<MaterialLine> lines, int max = 5)
        {
            var left = lines.Where(l => l.Remaining > 0).ToList();
            if (left.Count == 0) return "Materials: all used";
            var shown = left.Take(max).Select(l => $"{N(l.Remaining)} {l.Unit}  {l.Name}");
            return "Still to use\n" + string.Join("\n", shown) + (left.Count > max ? $"\n… and {left.Count - max} more" : "");
        }

        public static string PartCard(PlanDto plan, PartDto part, PartStatusDto status, BuildStateDto state)
        {
            if (part == null) return "";
            string size = part.shape.type == "box" ? $"{Mm(part.shape.size[0])} × {Mm(part.shape.size[1])} × {Mm(part.shape.size[2])} mm"
                        : part.shape.type == "cylinder" ? $"Ø{Mm(part.shape.diameter)} × {Mm(part.shape.length)} mm"
                        : part.shape.type == "polyline" ? $"Ø{Mm(part.shape.diameter)} mm route" : "model";
            string material = plan.materials.FirstOrDefault(m => m.material_id == part.material_id)?.name ?? part.material_id;
            string st = status?.state ?? "missing";
            string blocked = st == "missing" && state.blocked_part_ids.Contains(part.part_id)
                ? "\nWaits for: " + string.Join(", ", part.rests_on.Where(id => state.parts.TryGetValue(id, out var r) && r.state != "built")
                                                          .Select(id => plan.parts.FirstOrDefault(p => p.part_id == id)?.name ?? id))
                : "";
            return $"{part.name} · {st}\n{size} · {material}\n{PartAccuracy.Of(part).Label}{blocked}\nB: {(st == "built" ? "undo" : "mark built")} · hold B: wrong";
        }

        static string Mm(double metres) => (metres * 1000).ToString("0", CultureInfo.InvariantCulture);

        /// <summary>One line for the toast and the history list.</summary>
        public static string EventLine(PlanDto plan, BuildEventDto e, BuildStateDto after)
        {
            if (e.kind != "part_state" || e.part_id == null) return e.kind == "verification" ? $"Camera check: {e.verdict}" : e.kind;
            string name = plan.parts.FirstOrDefault(p => p.part_id == e.part_id)?.name ?? e.part_id;
            string version = e.version.HasValue ? $"V{e.version}" : "saving…";
            string warn = after.out_of_sequence.FirstOrDefault(o => o.part_id == e.part_id)?.kind;
            string tail = warn == "hard" ? " · nothing under it yet" : warn == "soft" ? " · out of order" : "";
            return $"{version} · {name} {e.new_state} · {e.source}{tail}";
        }

        public static List<string> History(PlanDto plan, IEnumerable<BuildEventDto> events, BuildStateDto state, int max = 4) =>
            Reducer.OrderEvents(events).Where(e => e.kind == "part_state").Reverse().Take(max).Select(e => EventLine(plan, e, state)).ToList();
    }
}
