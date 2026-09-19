using System.Threading.Tasks;
using CutOnce.Core;

namespace CutOnce.Net
{
    public enum AppendStatus { Accepted, Refused, Unreachable }

    public sealed class AppendOutcome
    {
        public AppendStatus Status;
        public BuildEventDto Event;      // the server's numbered copy, when Accepted
        public string Reason;            // the server's error code or the transport error
    }

    /// <summary>
    /// The headset's view of the REST API (blueprint §14). Every call answers instead of throwing: a dropped
    /// connection in the middle of a demo must degrade to offline mode, not to an exception in a coroutine.
    /// </summary>
    public sealed class ApiClient
    {
        readonly IHttpTransport _http;
        readonly ServerConfig _config;

        public ApiClient(IHttpTransport http, ServerConfig config) { _http = http; _config = config; }

        sealed class ErrorBody { public ErrorDetail error; }
        sealed class ErrorDetail { public string code, message; }

        Task<HttpResult> Send(string method, string path, string body = null, int timeoutSeconds = 8)
        {
            var request = new HttpRequest { Method = method, Url = _config.BaseUrl + path, Body = body, TimeoutSeconds = timeoutSeconds };
            request.Headers["authorization"] = "Bearer " + _config.api_token;
            if (body != null) request.Headers["content-type"] = "application/json";
            return _http.SendAsync(request);
        }

        static T ParseOrNull<T>(HttpResult r) where T : class
        {
            if (!r.Ok || string.IsNullOrEmpty(r.Body)) return null;
            try { return CoreJson.Parse<T>(r.Body); } catch (Newtonsoft.Json.JsonException) { return null; }
        }

        static string ErrorCode(HttpResult r)
        {
            try { return CoreJson.Parse<ErrorBody>(r.Body ?? "")?.error?.code ?? $"http_{r.Status}"; }
            catch (Newtonsoft.Json.JsonException) { return $"http_{r.Status}"; }
        }

        public async Task<bool> IsReachable() => (await Send("GET", "/health")).Ok;

        /// <summary>The run the Director page last started, or null (no run yet, or the server cannot be reached).</summary>
        public async Task<AssemblyDto> GetCurrentAssembly() => ParseOrNull<AssemblyDto>(await Send("GET", "/v1/assemblies/current"));

        /// <summary>Returns the raw JSON too, so the caller can cache exactly what the server sent.</summary>
        public async Task<(PlanDto plan, string json)> GetPlan(string planId, int revision)
        {
            var r = await Send("GET", $"/v1/plans/{planId}?revision={revision}");
            var plan = ParseOrNull<PlanDto>(r);
            return (plan, plan == null ? null : r.Body);
        }

        /// <summary>A file that belongs to a plan (its model, by the name the parts' shape.uri gives), or null.</summary>
        public async Task<byte[]> GetAsset(string planId, string name)
        {
            var r = await Send("GET", $"/v1/plans/{planId}/assets/{System.Uri.EscapeDataString(name)}");
            return r.Ok && r.Data != null && r.Data.Length > 0 ? r.Data : null;
        }

        public async Task<EventsPageDto> GetEvents(string assemblyId, int after = 0) =>
            ParseOrNull<EventsPageDto>(await Send("GET", $"/v1/assemblies/{assemblyId}/events?after={after}"));

        /// <summary>
        /// Appends one event. The server is idempotent by event_id (a replay answers 200 with the original), so
        /// sending the same event again after a lost response is always safe.
        /// </summary>
        public async Task<AppendOutcome> AppendEvent(string assemblyId, BuildEventDto e)
        {
            var r = await Send("POST", $"/v1/assemblies/{assemblyId}/events", CoreJson.Write(e));
            var body = ParseOrNull<AppendResultDto>(r);
            if (body?.@event != null) return new AppendOutcome { Status = AppendStatus.Accepted, Event = body.@event };
            // Only the server's two "this event makes no sense" answers may discard a tap: 409 no_op and 422 (unknown part,
            // invalid event). Everything else (no network, 5xx, a wrong token, a run the server has lost) keeps it queued.
            if (r.Status == 409 || r.Status == 422) return new AppendOutcome { Status = AppendStatus.Refused, Reason = ErrorCode(r) };
            return new AppendOutcome { Status = AppendStatus.Unreachable, Reason = r.Reached ? ErrorCode(r) : r.Error ?? "unreachable" };
        }

        /// <summary>
        /// One build-mode scan (about half a megabyte of JSON), so it is written off the main thread (AGENTS rule 9); Unity's
        /// context brings the await back for the request itself. Null when the server did not take it.
        /// </summary>
        public async Task<ScanAcceptedDto> PostBuildScan(BuildScanUploadDto scan)
        {
            string json = await Task.Run(() => CoreJson.Write(scan));
            return ParseOrNull<ScanAcceptedDto>(await Send("POST", "/v1/build/scans", json, 20));
        }

        /// <summary>Starts a run of a checked design. The run itself arrives on the stream (assembly_changed).</summary>
        public async Task<IdeaStartedDto> StartBuildIdea(string ideaId) =>
            ParseOrNull<IdeaStartedDto>(await Send("POST", $"/v1/build/ideas/{System.Uri.EscapeDataString(ideaId)}/start", "{}", 15));

        /// <summary>Speaks a sentence in the copilot's voice; play the returned audio_url with the copilot's player.</summary>
        public async Task<SayDto> BuildSay(string text) =>
            ParseOrNull<SayDto>(await Send("POST", "/v1/build/say", CoreJson.Write(new SayRequestDto { text = text }), 10));
    }
}
