using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using CutOnce.Core;

namespace CutOnce.Net.Tests
{
    /// <summary>A stand-in for services/api that follows the same rules: numbering, idempotency by event id, 409 on no-ops.</summary>
    sealed class FakeServer : IHttpTransport
    {
        public const string Aid = "asm_fake_run";
        public readonly string PlanJson;
        public readonly PlanDto Plan;
        public readonly List<BuildEventDto> Events = new List<BuildEventDto>();
        public readonly List<string> Requests = new List<string>();
        public bool Down;
        public int ForceStatus;                 // e.g. 401 to simulate a wrong token

        public FakeServer()
        {
            PlanJson = File.ReadAllText(Path.Combine(RepoRoot(), "data", "fixtures", "plan_desk_archetype.json"));
            Plan = CoreJson.Parse<PlanDto>(PlanJson);
        }

        public static string RepoRoot()
        {
            foreach (var start in new[] { Directory.GetCurrentDirectory(), AppDomain.CurrentDomain.BaseDirectory })
                for (var dir = new DirectoryInfo(start); dir != null; dir = dir.Parent)
                    if (File.Exists(Path.Combine(dir.FullName, "pnpm-workspace.yaml"))) return dir.FullName;
            throw new DirectoryNotFoundException("repo root not found");
        }

        public BuildEventDto Append(string partId, string newState)
        {
            var state = Reducer.Fold(Plan, Aid, Events);
            var e = new BuildEventDto { event_id = "evt_" + Ulid.New(), assembly_id = Aid, version = Events.Count + 1, timestamp = "2026-09-19T12:00:00.000Z",
                client_timestamp = "2026-09-19T12:00:00.000Z", kind = "part_state", part_id = partId, previous_state = state.parts[partId].state,
                new_state = newState, source = "manual", confidence = 1, actor = "web" };
            Events.Add(e);
            return e;
        }

        public Task<HttpResult> SendAsync(HttpRequest request)
        {
            string path = new Uri(request.Url).PathAndQuery;
            Requests.Add(request.Method + " " + path);
            if (Down) return Task.FromResult(new HttpResult { Status = 0, Error = "no route to host" });
            if (ForceStatus != 0) return Task.FromResult(new HttpResult { Status = ForceStatus, Body = "{\"error\":{\"code\":\"unauthorized\",\"message\":\"bad token\"}}" });
            if (!request.Headers.TryGetValue("authorization", out var auth) || !auth.StartsWith("Bearer ")) return Json(401, new { error = new { code = "unauthorized", message = "" } });

            if (path == "/health") return Json(200, new { ok = true });
            if (path == "/v1/assemblies/current")
                return Json(200, new AssemblyDto { assembly_id = Aid, plan_id = Plan.plan_id, plan_revision = Plan.revision, name = "Fake", seed = "empty", status = "active", created_at = "2026-09-19T12:00:00.000Z" });
            if (path.StartsWith("/v1/plans/")) return Task.FromResult(new HttpResult { Status = 200, Body = PlanJson });
            if (request.Method == "GET" && path.StartsWith($"/v1/assemblies/{Aid}/events"))
            {
                int after = int.Parse(path.Split(new[] { "after=" }, StringSplitOptions.None).Last());
                return Json(200, new EventsPageDto { events = Events.Where(e => e.version > after).ToList(), head = Events.Count });
            }
            if (request.Method == "POST" && path == $"/v1/assemblies/{Aid}/events")
            {
                var incoming = CoreJson.Parse<BuildEventDto>(request.Body);
                var seen = Events.FirstOrDefault(e => e.event_id == incoming.event_id);
                if (seen != null) return Json(200, new AppendResultDto { version = seen.version, head = Events.Count, @event = seen });
                var state = Reducer.Fold(Plan, Aid, Events);
                if (!state.parts.TryGetValue(incoming.part_id ?? "", out var status)) return Json(422, new { error = new { code = "unknown_part", message = "" } });
                if (status.state == incoming.new_state) return Json(409, new { error = new { code = "no_op", message = "" } });
                incoming.version = Events.Count + 1;
                Events.Add(incoming);
                return Json(201, new AppendResultDto { version = incoming.version, head = Events.Count, @event = incoming });
            }
            return Json(404, new { error = new { code = "not_found", message = path } });
        }

        static Task<HttpResult> Json(int status, object body) => Task.FromResult(new HttpResult { Status = status, Body = CoreJson.Write(body) });
    }
}
