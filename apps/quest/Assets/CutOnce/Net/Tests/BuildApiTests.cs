using System.Threading.Tasks;
using CutOnce.Core;
using NUnit.Framework;

namespace CutOnce.Net.Tests
{
    /// <summary>The three build-mode calls against the routes services/api/src/build/routes.ts serves: path, body, timeout, answer.</summary>
    public class BuildApiTests
    {
        sealed class OneAnswer : IHttpTransport
        {
            public HttpRequest Seen; public int Status = 200; public string Body;
            public Task<HttpResult> SendAsync(HttpRequest request) { Seen = request; return Task.FromResult(new HttpResult { Status = Status, Body = Body }); }
        }

        static ApiClient Client(OneAnswer http) => new ApiClient(http, new ServerConfig { server_url = "http://fake:8080/", api_token = "t" });

        [Test]
        public async Task AScanIsPostedWithTimeForHalfAMegabyteAndTheSessionComesBack()
        {
            var http = new OneAnswer { Status = 202, Body = "{\"scan_id\":\"scan_1\",\"session_id\":\"bsess_1\"}" };
            var scan = new BuildScanUploadDto { device_id = "quest", grid = new BuildGridDto { cols = 8, rows = 6 }, hit = "1", points_mm = new[] { -250, 740, 1500 } };

            var accepted = await Client(http).PostBuildScan(scan);

            Assert.That(http.Seen.Method + " " + http.Seen.Url, Is.EqualTo("POST http://fake:8080/v1/build/scans"));
            Assert.That(http.Seen.TimeoutSeconds, Is.EqualTo(20), "half a megabyte over venue Wi-Fi needs longer than the default 8 s");
            Assert.That(http.Seen.Headers["authorization"], Is.EqualTo("Bearer t"));
            Assert.That(http.Seen.Headers["content-type"], Is.EqualTo("application/json"));
            Assert.That(http.Seen.Body, Does.Contain("\"points_mm\":[-250,740,1500]"));
            Assert.That(new[] { accepted.scan_id, accepted.session_id }, Is.EqualTo(new[] { "scan_1", "bsess_1" }));
        }

        [Test]
        public async Task AScanTheServerRefusesAnswersNull()
        {
            var http = new OneAnswer { Status = 400, Body = "{\"error\":{\"code\":\"bad_request\",\"message\":\"points_mm has the wrong length\"}}" };
            Assert.That(await Client(http).PostBuildScan(new BuildScanUploadDto { device_id = "quest" }), Is.Null);
        }

        [Test]
        public async Task StartingAnIdeaPostsToItsEscapedIdAndReturnsTheRun()
        {
            var http = new OneAnswer { Body = "{\"assembly_id\":\"asm_1\",\"plan_id\":\"plan_build_1\",\"revision\":1}" };
            var outcome = await Client(http).StartBuildIdea("idea 1/x");
            Assert.That(http.Seen.Method + " " + http.Seen.Url, Is.EqualTo("POST http://fake:8080/v1/build/ideas/idea%201%2Fx/start"));
            Assert.That(http.Seen.Body, Is.EqualTo("{}"));
            Assert.That(new object[] { outcome.Started.plan_id, outcome.Started.assembly_id, outcome.Gone }, Is.EqualTo(new object[] { "plan_build_1", "asm_1", false }));
        }

        [Test]
        public async Task AStartSaysWhenTheIdeaIsGoneSoItsPreviewCanBeDropped()
        {
            // 404: the idea is not in the server's current session (a restart, or New session / Replay on the Director page).
            // Trying again can never work, unlike a 500 or no network, so the two must be told apart.
            var http = new OneAnswer { Status = 404, Body = "{\"error\":{\"code\":\"not_found\",\"message\":\"build idea idea_1\"}}" };
            var gone = await Client(http).StartBuildIdea("idea_1");
            Assert.That(new object[] { gone.Started, gone.Gone }, Is.EqualTo(new object[] { null, true }));

            http.Status = 500; http.Body = "{}";
            var failed = await Client(http).StartBuildIdea("idea_1");
            Assert.That(new object[] { failed.Started, failed.Gone }, Is.EqualTo(new object[] { null, false }));

            http.Status = 0; http.Body = null;
            Assert.That((await Client(http).StartBuildIdea("idea_1")).Gone, Is.False, "no network is not \"gone\"");
        }

        [Test]
        public async Task SayingAStepSendsTheTextAndReturnsTheAudioOrNullWhenTheVoiceIsOff()
        {
            var http = new OneAnswer { Body = "{\"turn_id\":\"turn_1\",\"audio_url\":\"/v1/copilot/audio/turn_1\"}" };
            var said = await Client(http).BuildSay("Stand the tall can upright.");
            Assert.That(http.Seen.Method + " " + http.Seen.Url, Is.EqualTo("POST http://fake:8080/v1/build/say"));
            Assert.That(http.Seen.Body, Is.EqualTo("{\"text\":\"Stand the tall can upright.\"}"));
            Assert.That(said.audio_url, Is.EqualTo("/v1/copilot/audio/turn_1"));

            http.Status = 503; http.Body = "{\"error\":{\"code\":\"tts_unavailable\",\"message\":\"the copilot's voice is not running\"}}";
            Assert.That(await Client(http).BuildSay("again"), Is.Null);
        }
    }
}
