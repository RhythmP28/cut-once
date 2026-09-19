using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using CutOnce.Core;
using NUnit.Framework;

namespace CutOnce.Net.Tests
{
    public class SyncEngineTests
    {
        FakeServer _server; BuildStateStore _store; Journal _journal; SyncEngine _sync; string _dir;

        [SetUp]
        public void SetUp()
        {
            _dir = Path.Combine(Path.GetTempPath(), "cutonce-journal-" + Guid.NewGuid().ToString("N"));
            _server = new FakeServer();
            NewSession();
        }

        [TearDown] public void TearDown() { if (Directory.Exists(_dir)) Directory.Delete(_dir, true); }

        /// <summary>A fresh app start against the same server and the same journal folder.</summary>
        void NewSession()
        {
            _store = new BuildStateStore(); _journal = new Journal(_dir);
            _sync = new SyncEngine(new ApiClient(_server, new ServerConfig { server_url = "http://fake:8080/", api_token = "t" }), _store, _journal, () => _server.PlanJson);
        }

        [Test]
        public async Task StartLoadsTheServersRunAndItsHistory()
        {
            _server.Append("part_tabletop", "built");
            int loaded = 0; _sync.RunLoaded += () => loaded++;

            await _sync.Start();

            Assert.That(_sync.Online, Is.True);
            Assert.That(_store.AssemblyId, Is.EqualTo(FakeServer.Aid));
            Assert.That(_store.Current.parts["part_tabletop"].state, Is.EqualTo("built"));
            Assert.That(loaded, Is.EqualTo(1));
            Assert.That(_sync.StatusLine, Is.EqualTo("Live"));
        }

        [Test]
        public async Task ATapIsNumberedByTheServerAndTheStreamsEchoChangesNothing()
        {
            await _sync.Start();
            var e = _sync.Mark("part_tabletop", "built");
            await _sync.Flush();

            Assert.That(_store.Provisional.Any(), Is.False);
            Assert.That(_store.Head, Is.EqualTo(1));

            int changes = 0; _store.Changed += () => changes++;
            _sync.Handle(new WsMessageDto { type = "event_appended", assembly_id = FakeServer.Aid, @event = _server.Events[0], head = 1 });
            Assert.That(changes, Is.EqualTo(0));
            Assert.That(_server.Events.Single().event_id, Is.EqualTo(e.event_id));
        }

        [Test]
        public async Task TapsMadeWithNoNetworkWaitSurviveARestartAndArriveInOrder()
        {
            await _sync.Start();
            _server.Down = true;
            _sync.Mark("part_tabletop", "built");
            _sync.Mark("part_left_front_leg", "built");
            await _sync.Flush();
            Assert.That(_sync.Online, Is.False);
            Assert.That(_sync.StatusLine, Is.EqualTo("Offline · 2 waiting"));
            Assert.That(_store.Current.progress.built, Is.EqualTo(2), "the hologram must not wait for the network");

            NewSession();                       // the app is killed and started again, still offline
            await _sync.Start();
            Assert.That(_store.Current.progress.built, Is.EqualTo(2));
            Assert.That(_sync.Waiting, Is.EqualTo(2));

            _server.Down = false;               // the network comes back
            await _sync.CatchUp();
            Assert.That(_sync.Waiting, Is.EqualTo(0));
            Assert.That(_server.Events.Select(x => x.part_id), Is.EqualTo(new[] { "part_tabletop", "part_left_front_leg" }));
        }

        [Test]
        public async Task ANoOpIsDroppedButAWrongTokenKeepsTheTap()
        {
            await _sync.Start();
            _server.Append("part_tabletop", "built");            // someone else built it first; this headset has not heard yet
            _sync.Mark("part_tabletop", "built");
            await _sync.Flush();
            Assert.That(_sync.Waiting, Is.EqualTo(0), "409 no_op: nothing to deliver");

            _server.ForceStatus = 401;
            _sync.Mark("part_left_front_leg", "built");
            await _sync.Flush();
            Assert.That(_sync.Waiting, Is.EqualTo(1), "a wrong token is a setup problem, not a reason to lose the tap");
        }

        [Test]
        public async Task WithNoServerAndNoJournalTheBundledPlanStillWorks()
        {
            _server.Down = true;
            await _sync.Start();
            Assert.That(_store.AssemblyId, Is.EqualTo(SyncEngine.LocalRunId));
            Assert.That(_sync.Mark("part_tabletop", "built"), Is.Not.Null);
            await _sync.Flush();
            Assert.That(_server.Requests.Any(r => r.StartsWith("POST")), Is.False, "a local run has nowhere to send events");
        }

        [Test]
        public async Task AGapInTheStreamFetchesWhatWasMissed()
        {
            await _sync.Start();
            _server.Append("part_tabletop", "built");             // v1: this headset never hears about it
            var second = _server.Append("part_left_front_leg", "built");
            _sync.Handle(new WsMessageDto { type = "event_appended", assembly_id = FakeServer.Aid, @event = second, head = 2 });
            await Task.Yield();
            Assert.That(_store.Head, Is.EqualTo(2));
            Assert.That(_store.Current.parts["part_tabletop"].state, Is.EqualTo("built"));
        }

        [Test]
        public void BuildMessagesAreHandedOnAsTheyArrive()
        {
            var got = new System.Collections.Generic.List<string>();
            _sync.BuildMessage += m => got.Add(m.type);
            _sync.Handle(new WsMessageDto { type = "build_inventory", inventory = new InventoryDto { session_id = "bsess_x" } });
            _sync.Handle(new WsMessageDto { type = "build_ideas", session_id = "bsess_x" });
            _sync.Handle(new WsMessageDto { type = "presence" });
            Assert.That(got, Is.EqualTo(new[] { "build_inventory", "build_ideas" }));
        }

        [Test]
        public void ACorruptJournalIsTreatedAsNone()
        {
            File.WriteAllText(Path.Combine(_dir, "journal.json"), "{ not json");
            Assert.That(new Journal(_dir).Load(), Is.Null);
        }

        [Test]
        public void TheStreamAddressFollowsTheServerAddress()
        {
            var uri = new ServerConfig { server_url = "https://cut-once.example/", api_token = "a b", device_id = "quest-1" }.StreamUri;
            Assert.That(uri.AbsoluteUri, Does.StartWith("wss://cut-once.example/v1/stream?client=quest&id=quest-1&token=a%20b"));
            Assert.That(new ServerConfig { server_url = "http://10.0.0.5:8080" }.StreamUri.Scheme, Is.EqualTo("ws"));
        }
    }
}
