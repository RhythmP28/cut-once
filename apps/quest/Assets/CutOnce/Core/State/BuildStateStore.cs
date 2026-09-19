using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace CutOnce.Core
{
    /// <summary>
    /// The only holder of events on the headset. State is always Reducer.Fold(events): nothing else is kept.
    /// A local tap becomes a provisional event (version null) that shows at once; the server's numbered copy
    /// replaces it when it arrives, by event id, from either the POST response or the stream. Main thread only.
    /// </summary>
    public sealed class BuildStateStore
    {
        readonly List<BuildEventDto> _events = new List<BuildEventDto>();

        public PlanDto Plan { get; private set; }
        public string AssemblyId { get; private set; }
        public BuildStateDto Current { get; private set; }
        /// <summary>The highest server version held. Ask the server for events after this to catch up.</summary>
        public int Head => _events.Where(e => e.version.HasValue).Select(e => e.version.Value).DefaultIfEmpty(0).Max();
        public IReadOnlyList<BuildEventDto> Events => _events;
        public IEnumerable<BuildEventDto> Provisional => _events.Where(e => !e.version.HasValue);
        public bool IsLoaded => Plan != null;

        public event Action Changed;

        public void Reset(PlanDto plan, string assemblyId, IEnumerable<BuildEventDto> events)
        {
            Plan = plan ?? throw new ArgumentNullException(nameof(plan));
            AssemblyId = assemblyId ?? throw new ArgumentNullException(nameof(assemblyId));
            _events.Clear();
            foreach (var e in events ?? Enumerable.Empty<BuildEventDto>()) Upsert(e);
            Refold();
        }

        /// <summary>State as it was at a server version (the history scrub). Provisional events are left out.</summary>
        public BuildStateDto At(int version) => Reducer.Fold(Plan, AssemblyId, _events, version);

        /// <summary>
        /// A change made on this headset. Returns the provisional event to send, or null when there is nothing to
        /// do (unknown part, or the part is already in that state: the server would answer 409 no_op).
        /// </summary>
        public BuildEventDto Propose(string partId, string newState, string source = "manual", string actor = "operator", DateTime? nowUtc = null)
        {
            if (!IsLoaded || partId == null || !Current.parts.TryGetValue(partId, out var status) || status.state == newState) return null;
            var now = nowUtc ?? DateTime.UtcNow;
            string ts = now.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
            var e = new BuildEventDto
            {
                event_id = "evt_" + Ulid.New(now), assembly_id = AssemblyId, version = null, timestamp = ts, client_timestamp = ts,
                kind = "part_state", part_id = partId, previous_state = status.state, new_state = newState,
                source = source, confidence = 1, actor = actor, step_id = Plan.parts.First(p => p.part_id == partId).step_id,
            };
            _events.Add(e);
            Refold();
            return e;
        }

        /// <summary>An event the server has numbered. Safe to call twice for the same event. Returns whether anything changed.</summary>
        public bool ApplyServer(BuildEventDto e)
        {
            if (!IsLoaded || e == null || e.assembly_id != AssemblyId) return false;
            if (!Upsert(e)) return false;
            Refold();
            return true;
        }

        /// <summary>The server refused a provisional event (no_op, unknown part): forget it.</summary>
        public void DropProvisional(string eventId)
        {
            if (_events.RemoveAll(e => e.event_id == eventId && !e.version.HasValue) > 0) Refold();
        }

        bool Upsert(BuildEventDto e)
        {
            int i = _events.FindIndex(x => x.event_id == e.event_id);
            if (i < 0) { _events.Add(e); return true; }
            if (_events[i].version.HasValue || !e.version.HasValue) return false;   // already numbered, or nothing new
            _events[i] = e;
            return true;
        }

        void Refold()
        {
            Current = Reducer.Fold(Plan, AssemblyId, _events);
            Changed?.Invoke();
        }
    }
}
