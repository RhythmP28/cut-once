using System;
using System.Collections;
using System.IO;
using System.Reflection;
using System.Threading.Tasks;
using CutOnce.AR;
using CutOnce.Core;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace CutOnce.Device.PlayTests
{
    /// <summary>
    /// Build mode inside the whole app, with no server and no headset: the messages the server would send are handed to
    /// it directly, and the run a picked design starts is loaded the way the app loads any run. Like E7DefaultTests, the
    /// app is pointed at a closed port and any config and journal on this machine are moved aside and put back.
    /// BuildMode lives in Assembly-CSharp (it names Meta types), so it is reached by name.
    /// </summary>
    public class BuildModeTests
    {
        const BindingFlags Hidden = BindingFlags.NonPublic | BindingFlags.Instance;
        string _config, _journal, _configBackup, _journalBackup;

        [SetUp]
        public void SetUp()
        {
            _config = Path.Combine(Application.persistentDataPath, "cutonce.config.json");
            _journal = Path.Combine(Application.persistentDataPath, "cutonce");
            _configBackup = _config + ".before-build-test"; _journalBackup = _journal + ".before-build-test";
            if (File.Exists(_config)) File.Move(_config, _configBackup);
            if (Directory.Exists(_journal)) Directory.Move(_journal, _journalBackup);
            File.WriteAllText(_config, "{\"server_url\":\"http://127.0.0.1:9\",\"api_token\":\"none\",\"device_id\":\"build-test\"}");   // port 9: nothing listens
        }

        [TearDown]
        public void TearDown()
        {
            if (File.Exists(_config)) File.Delete(_config);
            if (Directory.Exists(_journal)) Directory.Delete(_journal, true);
            if (File.Exists(_configBackup)) File.Move(_configBackup, _config);
            if (Directory.Exists(_journalBackup)) Directory.Move(_journalBackup, _journal);
        }

        [UnityTearDown]
        public IEnumerator DestroyWhatTheAppCreated()
        {
            AppSmokeTests.DestroyAppObjects();
            yield return null;
        }

        // ── the app, and what the server would send ─────────────────────────────────────────────────────────────
        static readonly Type AppType = Type.GetType("CutOnce.Device.CutOnceApp, Assembly-CSharp");
        static Type BuildType => Type.GetType("CutOnce.Device.BuildMode, Assembly-CSharp");

        static Component StartApp(string name, bool copilot)
        {
            Assert.That(AppType, Is.Not.Null, "CutOnceApp is missing from Assembly-CSharp");
            Assert.That(BuildType, Is.Not.Null, "BuildMode is missing from Assembly-CSharp");
            var app = new GameObject(name).AddComponent(AppType);
            AppType.GetField("createCopilot").SetValue(app, copilot);
            return app;
        }

        static UnityEngine.Object BuildModeOf() => UnityEngine.Object.FindAnyObjectByType(BuildType);
        static BuildPhase Phase(UnityEngine.Object mode) => ((BuildFlow)BuildType.GetProperty("Flow").GetValue(mode)).Phase;
        static string ModeOf(Component app) => (string)AppType.GetProperty("Mode").GetValue(app);
        static AssemblyView Hologram() => UnityEngine.Object.FindAnyObjectByType<AssemblyView>(FindObjectsInactive.Include);

        static void Send(UnityEngine.Object mode, WsMessageDto message) =>
            BuildType.GetMethod("OnBuildMessage", Hidden).Invoke(mode, new object[] { message });

        /// <summary>The message both the TypeScript and the C# tests parse: one idea, "Can on a stage", whose can is twin o1.</summary>
        static WsMessageDto IdeasFixture()
        {
            for (var dir = new DirectoryInfo(Application.dataPath); dir != null; dir = dir.Parent)
            {
                string path = Path.Combine(dir.FullName, "data", "fixtures", "build", "ws_build_ideas.json");
                if (File.Exists(path)) return CoreJson.Parse<WsMessageDto>(File.ReadAllText(path));
            }
            throw new FileNotFoundException("data/fixtures/build/ws_build_ideas.json was not found above " + Application.dataPath);
        }

        static WsMessageDto Inventory(double[] canPosition)
        {
            var can = new TwinDto { twin_id = "o1", name = "tall_can", label = "tall can", snapped = true, material = "metal",
                shape = new ShapeDto { type = "cylinder", axis = "y", diameter = 0.066, length = 0.157 }, position = canPosition };
            var inventory = new InventoryDto { session_id = "bsess_fixture", labelled = true };
            inventory.twins.Add(can);
            return new WsMessageDto { type = "build_inventory", inventory = inventory };
        }

        /// <summary>
        /// Loads a run of <paramref name="plan"/> the way the app does when the stream says a run started: the store, then the
        /// hologram. A plan with no model files to fetch is built before this returns, so what follows sees the very first
        /// moment of the placement, however slow the frames are.
        /// </summary>
        static void LoadRun(Component app, PlanDto plan, string assemblyId)
        {
            var store = (BuildStateStore)AppType.GetField("_store", Hidden).GetValue(app);
            store.Reset(plan, assemblyId, null);
            var building = (Task)AppType.GetMethod("BuildHologram", Hidden).Invoke(app, null);
            Assert.That(building.IsCompleted && !building.IsFaulted, Is.True, "the hologram was not built at once: " + building.Exception);
        }

        // ── tests ───────────────────────────────────────────────────────────────────────────────────────────────
        [UnityTest]
        public IEnumerator BuildModeShowsTwinsAndIdeasItIsSentAndReportsBuildMode()
        {
            var app = StartApp("[App] (build smoke test)", copilot: false);
            yield return null;

            var mode = BuildModeOf();
            Assert.That(mode, Is.Not.Null, "the app did not attach BuildMode");
            Assert.That(ModeOf(app), Is.EqualTo("overlay"), "build mode is off until a scan or an inventory starts it");
            Send(mode, Inventory(new[] { 0.1, 0.8185, 0.5 }));
            Send(mode, IdeasFixture());
            yield return null;

            Assert.That(GameObject.Find("[BuildTwins]")?.transform.Find("part_o1"), Is.Not.Null, "the can's outline was not shown over the real can");
            Assert.That(GameObject.Find("[Idea] Can on a stage"), Is.Not.Null, "the idea preview was not shown");
            Assert.That(ModeOf(app), Is.EqualTo("build"));
            Assert.That(Hologram().gameObject.activeSelf, Is.False, "the run that was showing is out of the way while you choose");
            UnityEngine.Object.Destroy(app.gameObject);
            yield return null;
        }

        [UnityTest]
        public IEnumerator TheChosenDesignLocksWhereTheServerSaysAndItsPiecesFlyInFromTheirObjects()
        {
            var app = StartApp("[App] (build flight test)", copilot: false);
            for (float waited = 0f; waited < 15f && (Hologram() == null || Hologram().Views.Count == 0); waited += Time.unscaledDeltaTime) yield return null;
            Assert.That(Hologram()?.Views.Count ?? 0, Is.GreaterThan(0), "the app's own first run (E7, offline) never loaded");

            var mode = BuildModeOf();
            var ideas = IdeasFixture(); var idea = ideas.ideas[0];
            var canInRoom = new[] { 0.6, 0.8185, 0.9 };                          // the real can stands half a metre from where the design goes
            Send(mode, Inventory(canInRoom));
            Send(mode, ideas);
            yield return null;

            // Picking posts to the server, which starts a run of the idea's plan; the stream then makes the app load it.
            // Locking saves a spatial anchor, and anchors only exist on the headset: in the Editor Meta's OVRSpatialAnchor
            // logs an error when it cannot make one. That one log is expected, so errors are let through until the lock settles.
            LogAssert.ignoreFailingMessages = true;
            LoadRun(app, idea.plan, "asm_build_smoke");

            var hologram = Hologram();
            var alignment = hologram.GetComponent<AlignmentController>();
            Assert.That(new object[] { alignment.State, alignment.Method }, Is.EqualTo(new object[] { AlignmentState.Locked, "build" }));
            Assert.That(hologram.gameObject.activeSelf, Is.True, "the design is shown");
            Assert.That(Vector3.Distance(hologram.transform.position, ModelSpace.Point(idea.origin.position)), Is.LessThan(1e-4f), "locked where the server put it");
            Assert.That(Quaternion.Angle(hologram.transform.rotation, ModelSpace.Rotation(idea.origin.rotation_quat)), Is.LessThan(0.05f));
            Assert.That(Phase(mode), Is.EqualTo(BuildPhase.Assembling));
            var can = hologram.ViewOf("part_o1");
            Assert.That(Vector3.Distance(can.transform.position, ModelSpace.Point(canInRoom)), Is.LessThan(1e-4f), "the can's hologram starts on the real can");

            yield return null;
            for (float waited = 0f; waited < 5f && alignment.Hint.StartsWith("Saving"); waited += Time.unscaledDeltaTime) yield return null;
            LogAssert.ignoreFailingMessages = false;
            Assert.That(GameObject.Find("[Idea] Can on a stage"), Is.Null, "the previews are gone once one is picked");

            for (float waited = 0f; waited < 8f && Phase(mode) != BuildPhase.Walkthrough; waited += Time.unscaledDeltaTime) yield return null;
            Assert.That(Phase(mode), Is.EqualTo(BuildPhase.Walkthrough), "the fly-together never finished");
            Assert.That(Vector3.Distance(can.transform.localPosition, ModelSpace.Point(idea.plan.parts[1].position)), Is.LessThan(1e-5f), "and ends exactly in its place in the design");
            Assert.That(Quaternion.Angle(can.transform.localRotation, Quaternion.identity), Is.LessThan(0.01f));
            yield return null;
            Assert.That(GameObject.Find("[BuildTwins]").transform.childCount, Is.EqualTo(0), "the outlines over the real objects go once the pieces have left them");
            Assert.That(ModeOf(app), Is.EqualTo("build"));

            // B with nothing pointed at: the whole step is done, and the walkthrough moves on.
            var store = (BuildStateStore)AppType.GetField("_store", Hidden).GetValue(app);
            Assert.That(store.Current.current_step_id, Is.EqualTo("step_01"));
            Assert.That((bool)BuildType.GetMethod("MarkCurrentStep").Invoke(mode, null), Is.True);
            Assert.That(new[] { store.Current.parts["part_surface"].state, store.Current.current_step_id }, Is.EqualTo(new[] { "built", "step_02" }));

            // The Director starts another run: build mode steps aside for it.
            var other = IdeasFixture().ideas[0].plan; other.plan_id = "plan_started_elsewhere";
            LoadRun(app, other, "asm_started_elsewhere");
            Assert.That(new object[] { Phase(mode), ModeOf(app), Hologram().gameObject.activeSelf }, Is.EqualTo(new object[] { BuildPhase.Off, "overlay", true }));
            UnityEngine.Object.Destroy(app.gameObject);
            yield return null;
        }

        [UnityTest]
        public IEnumerator AScanThatFindsNoDepthLeavesBuildModeOffAndTheHologramShowing()
        {
            // The Editor has the copilot's stored photo but no depth sensor, so every ray misses and the scan fails with a reason.
            var app = StartApp("[App] (build scan test)", copilot: true);
            for (float waited = 0f; waited < 15f && (Hologram() == null || Hologram().Views.Count == 0); waited += Time.unscaledDeltaTime) yield return null;
            var mode = BuildModeOf();

            BuildType.GetMethod("StartScan").Invoke(mode, null);
            for (float waited = 0f; waited < 10f && Phase(mode) != BuildPhase.Off; waited += Time.unscaledDeltaTime) yield return null;

            Assert.That(new object[] { Phase(mode), ModeOf(app), Hologram().gameObject.activeSelf }, Is.EqualTo(new object[] { BuildPhase.Off, "overlay", true }));
            UnityEngine.Object.Destroy(app.gameObject);
            yield return null;
        }
    }
}
