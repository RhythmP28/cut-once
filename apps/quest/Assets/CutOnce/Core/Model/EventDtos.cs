using System.Collections.Generic;
using Newtonsoft.Json;

namespace CutOnce.Core
{
    // Hand-mirrored from packages/schemas/src/factory.ts (BuildEvent, PartStatus, BuildState, WsMessage).
    // The server treats "optional" and "nullable" differently: an optional field must be ABSENT, never null.
    // CoreJson drops nulls by default; the few nullable fields below opt back in with NullValueHandling.Include.

    public sealed class BuildEventDto
    {
        public string event_id, assembly_id;
        [JsonProperty(NullValueHandling = NullValueHandling.Include)] public int? version;   // null until the server numbers it
        public string timestamp, client_timestamp;
        public string kind;                         // part_state | verification | annotation | alignment
        public string part_id, previous_state, new_state;
        public string source;                       // manual | voice | camera_verification | system | seed
        public double confidence;
        public string actor, step_id, verification_id, turn_id, verdict, note;
    }

    public sealed class VerifiedDto { public string verdict; public double confidence; }

    public sealed class PartStatusDto
    {
        public string state;                        // missing | built | wrong
        public int since_version;
        [JsonProperty(NullValueHandling = NullValueHandling.Include)] public string last_event_id;
        [JsonProperty(NullValueHandling = NullValueHandling.Include)] public VerifiedDto verified;
    }

    public sealed class ProgressDto
    {
        public int built, total, pct;
        public Dictionary<string, int[]> by_layer = new Dictionary<string, int[]>();   // layer → [built, total]
        public double minutes_left;
    }

    public sealed class OutOfSequenceDto { public string part_id, kind; }               // kind: hard | soft

    public sealed class BuildStateDto
    {
        public string assembly_id, plan_id;
        public int plan_revision, version;
        [JsonProperty(NullValueHandling = NullValueHandling.Include)] public string as_of;
        public Dictionary<string, PartStatusDto> parts = new Dictionary<string, PartStatusDto>();
        public ProgressDto progress = new ProgressDto();
        [JsonProperty(NullValueHandling = NullValueHandling.Include)] public string current_step_id;
        public List<string> available_part_ids = new List<string>();
        public List<string> blocked_part_ids = new List<string>();
        public List<OutOfSequenceDto> out_of_sequence = new List<OutOfSequenceDto>();
    }

    public sealed class AssemblyDto
    {
        public string assembly_id, plan_id, name, seed, created_at, status;
        public int plan_revision;
    }

    public sealed class EventsPageDto { public List<BuildEventDto> events = new List<BuildEventDto>(); public int head; }

    public sealed class AppendResultDto { public int? version; public int head; public BuildEventDto @event; }

    /// <summary>One message from /v1/stream. Only the fields of the message's own type are set.</summary>
    public sealed class WsMessageDto
    {
        public string type;                         // event_appended | assembly_changed | plan_ready | director_command | build_inventory | build_ideas | …
        public string assembly_id, plan_id;
        public BuildEventDto @event;
        public int head, revision;
        public AssemblyDto assembly;
        public DirectorCommandDto command;
        public InventoryDto inventory;              // build_inventory
        public List<BuildIdeaDto> ideas;            // build_ideas
        public string session_id, audio_url, message;
        public bool final;
    }

    public sealed class DirectorCommandDto { public string type, seed, plan_id, part_id, new_state, demo_state, flag; public bool value; }
}
