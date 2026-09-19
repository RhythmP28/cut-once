using System.Collections;
using CutOnce.AR;
using CutOnce.Core;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;
using static CutOnce.Device.PlayTests.BuildModeHarness;

namespace CutOnce.Device.PlayTests
{
    /// <summary>
    /// Build mode inside the whole app, with no server and no headset: the messages the server would send are handed to
    /// it directly, and the run a picked design starts is loaded the way the app loads any run (BuildModeHarness). Like
    /// E7DefaultTests, the app is pointed at a closed port and any config and journal on this machine are moved aside and
    /// put back.
    /// </summary>
    public class BuildModeTests
    {
        Isolation _isolation;

        [SetUp] public void SetUp() => _isolation = new Isolation();
        [TearDown] public void TearDown() => _isolation.Restore();

        [UnityTearDown]
        public IEnumerator DestroyWhatTheAppCreated()
        {
            AppSmokeTests.DestroyAppObjects();
            yield return null;
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
            var store = StoreOf(app);
            Assert.That(store.Current.current_step_id, Is.EqualTo("step_01"));
            Assert.That((bool)Call(mode, "MarkCurrentStep"), Is.True);
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

            Call(mode, "StartScan");
            for (float waited = 0f; waited < 10f && Phase(mode) != BuildPhase.Off; waited += Time.unscaledDeltaTime) yield return null;

            Assert.That(new object[] { Phase(mode), ModeOf(app), Hologram().gameObject.activeSelf }, Is.EqualTo(new object[] { BuildPhase.Off, "overlay", true }));
            UnityEngine.Object.Destroy(app.gameObject);
            yield return null;
        }
    }
}
