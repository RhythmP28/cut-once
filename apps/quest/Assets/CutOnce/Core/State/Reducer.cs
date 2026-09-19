using System;
using System.Collections.Generic;
using System.Linq;

namespace CutOnce.Core
{
    /// <summary>
    /// The C# twin of packages/project-model/src/fold.ts. Build state is never stored: it is always a replay of
    /// the event log. The two implementations are held together by the shared fixtures in
    /// data/fixtures/events_to_state (ReducerFixtureTests); change either one and that test says so.
    /// </summary>
    public static class Reducer
    {
        /// <summary>Events in the order they apply: by server version, then provisional (version null) in arrival order.</summary>
        public static List<BuildEventDto> OrderEvents(IEnumerable<BuildEventDto> events)
        {
            var all = events.ToList();
            var ordered = all.Where(e => e.version.HasValue).OrderBy(e => e.version.Value).ToList();   // OrderBy is stable
            ordered.AddRange(all.Where(e => !e.version.HasValue));
            return ordered;
        }

        /// <summary>
        /// A step is done when all its parts are built. A milestone (a step with no parts) has no event that
        /// completes it, so it is never done: once everything before it is built it stays the current step.
        /// </summary>
        public static HashSet<string> DoneSteps(PlanDto plan, IReadOnlyDictionary<string, PartStatusDto> parts)
        {
            var done = new HashSet<string>();
            foreach (var s in plan.steps)
                if (s.part_ids.Count > 0 && s.part_ids.All(id => parts.TryGetValue(id, out var st) && st.state == "built"))
                    done.Add(s.step_id);
            return done;
        }

        /// <summary><paramref name="upTo"/> rewinds history: only events with version ≤ upTo apply, and provisional ones are left out.</summary>
        public static BuildStateDto Fold(PlanDto plan, string assemblyId, IEnumerable<BuildEventDto> events, int? upTo = null)
        {
            var parts = new Dictionary<string, PartStatusDto>();
            foreach (var p in plan.parts) parts[p.part_id] = new PartStatusDto { state = "missing", since_version = 0 };
            var partById = plan.parts.ToDictionary(p => p.part_id);
            var stepById = plan.steps.ToDictionary(s => s.step_id);
            var sequence = new List<OutOfSequenceDto>();   // insertion-ordered, like the JS Map it mirrors

            int version = 0;
            string asOf = null;

            foreach (var e in OrderEvents(events))
            {
                if (upTo.HasValue && (!e.version.HasValue || e.version.Value > upTo.Value)) continue;
                version = e.version ?? version + 1;
                asOf = e.timestamp;

                if (string.IsNullOrEmpty(e.part_id)) continue;
                if (!parts.TryGetValue(e.part_id, out var cur)) continue;   // a part this plan revision does not have

                if (e.kind == "verification")
                {
                    if (!string.IsNullOrEmpty(e.verdict)) cur.verified = new VerifiedDto { verdict = e.verdict, confidence = e.confidence };
                    continue;
                }
                if (e.kind != "part_state" || string.IsNullOrEmpty(e.new_state)) continue;
                if (e.new_state == cur.state) continue;   // same-state events are no-ops (the API rejects them with 409)
                // A stale previous_state is still applied: the physical world wins over what a client believed.

                if (e.new_state == "built")
                {
                    var part = partById[e.part_id];
                    bool unsupported = part.rests_on.Any(id => !parts.TryGetValue(id, out var s) || s.state != "built");
                    if (unsupported) SetSequence(sequence, e.part_id, "hard");
                    else
                    {
                        var done = DoneSteps(plan, parts);
                        int myIndex = stepById.TryGetValue(part.step_id ?? "", out var mine) ? mine.index : int.MaxValue;
                        bool skipped = plan.steps.Any(s => s.index < myIndex && s.part_ids.Count > 0 && !done.Contains(s.step_id));
                        if (skipped) SetSequence(sequence, e.part_id, "soft");
                    }
                }
                else sequence.RemoveAll(x => x.part_id == e.part_id);

                parts[e.part_id] = new PartStatusDto { state = e.new_state, since_version = version, last_event_id = e.event_id };
            }

            return Derive(plan, assemblyId, parts, version, asOf, sequence);
        }

        public static BuildStateDto Derive(PlanDto plan, string assemblyId, Dictionary<string, PartStatusDto> parts, int version, string asOf,
                                           List<OutOfSequenceDto> sequence = null)
        {
            var done = DoneSteps(plan, parts);
            var steps = plan.steps.OrderBy(s => s.index).ToList();
            var current = steps.FirstOrDefault(s => !done.Contains(s.step_id) && s.requires.All(done.Contains));

            var state = new BuildStateDto
            {
                assembly_id = assemblyId, plan_id = plan.plan_id, plan_revision = plan.revision, version = version, as_of = asOf,
                parts = parts, current_step_id = current?.step_id, out_of_sequence = sequence ?? new List<OutOfSequenceDto>(),
            };

            int built = 0;
            foreach (var p in plan.parts)
            {
                string s = parts[p.part_id].state;
                if (!state.progress.by_layer.TryGetValue(p.layer, out var layer)) state.progress.by_layer[p.layer] = layer = new int[2];
                layer[1] += 1;
                if (s == "built") { built += 1; layer[0] += 1; continue; }
                if (s != "missing") continue;
                bool supported = p.rests_on.All(id => parts.TryGetValue(id, out var r) && r.state == "built");
                (supported ? state.available_part_ids : state.blocked_part_ids).Add(p.part_id);
            }

            int total = plan.parts.Count;
            state.progress.built = built;
            state.progress.total = total;
            state.progress.pct = total == 0 ? 0 : (int)Math.Floor(100.0 * built / total + 0.5);   // JS Math.round: halves go up
            state.progress.minutes_left = steps.Where(s => !done.Contains(s.step_id)).Sum(s => s.est_minutes);
            return state;
        }

        // A JS Map keeps a key's first position when its value is overwritten; so does this.
        static void SetSequence(List<OutOfSequenceDto> sequence, string partId, string kind)
        {
            var existing = sequence.FirstOrDefault(x => x.part_id == partId);
            if (existing != null) existing.kind = kind; else sequence.Add(new OutOfSequenceDto { part_id = partId, kind = kind });
        }
    }
}
