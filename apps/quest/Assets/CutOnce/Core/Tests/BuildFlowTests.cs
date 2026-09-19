using System.Collections.Generic;
using NUnit.Framework;

namespace CutOnce.Core.Tests
{
    public class BuildFlowTests
    {
        static BuildIdeaDto Idea(string id, string plan) => new BuildIdeaDto { idea_id = id, session_id = "bsess_a", title = id, plan = new PlanDto { plan_id = plan } };
        static InventoryDto Inv(bool labelled, string session = "bsess_a") => new InventoryDto { session_id = session, labelled = labelled };

        [Test]
        public void ScanToWalkthroughInOrder()
        {
            var f = new BuildFlow();
            f.StartScan();                                  Assert.That(f.Phase, Is.EqualTo(BuildPhase.Scanning));
            f.OnScanAccepted("bsess_a");
            f.OnInventory(Inv(false));                      Assert.That(f.Phase, Is.EqualTo(BuildPhase.Scanning));
            f.OnInventory(Inv(true));                       Assert.That(f.Phase, Is.EqualTo(BuildPhase.Labelled));
            f.OnIdeas("bsess_a", new List<BuildIdeaDto> { Idea("idea_1", "plan_build_1") }, false);
            Assert.That(f.Phase, Is.EqualTo(BuildPhase.Ideas));
            Assert.That(f.Pick("idea_1"), Is.True);         Assert.That(f.Phase, Is.EqualTo(BuildPhase.Starting));
            Assert.That(f.TryPlace("plan_other"), Is.False);
            Assert.That(f.TryPlace("plan_build_1"), Is.True);
            f.OnPlaced();                                   Assert.That(f.Phase, Is.EqualTo(BuildPhase.Assembling));
            f.OnAssembled();                                Assert.That(f.Phase, Is.EqualTo(BuildPhase.Walkthrough));
            f.OnInventory(Inv(true));                       Assert.That(f.Phase, Is.EqualTo(BuildPhase.Walkthrough), "a late inventory does not interrupt the build");
        }

        [Test]
        public void ARunStartedByVoiceOrTheDirectorIsPlacedToo()
        {
            var f = new BuildFlow();
            f.OnInventory(Inv(true));
            f.OnIdeas("bsess_a", new List<BuildIdeaDto> { Idea("idea_1", "plan_build_1"), Idea("idea_2", "plan_build_2") }, true);
            Assert.That(f.TryPlace("plan_build_2"), Is.True);
            Assert.That(f.Chosen.idea_id, Is.EqualTo("idea_2"));
        }

        [Test]
        public void ADesignStartedWhileAnotherViewIsBeingScannedIsStillPlaced()
        {
            var f = new BuildFlow();
            f.OnInventory(Inv(true));
            f.OnIdeas("bsess_a", new List<BuildIdeaDto> { Idea("idea_1", "plan_build_1") }, true);
            f.StartScan();                                  // a look-around scan is running when "build the can stage" is said
            Assert.That(f.TryPlace("plan_e7_massing"), Is.False, "not one of the ideas");
            Assert.That(f.Phase, Is.EqualTo(BuildPhase.Scanning));
            Assert.That(f.TryPlace("plan_build_1"), Is.True);
            Assert.That(new object[] { f.Phase, f.Chosen.idea_id }, Is.EqualTo(new object[] { BuildPhase.Starting, "idea_1" }));
            f.OnPlaced(); f.OnAssembled();
            Assert.That(f.TryPlace("plan_build_1"), Is.False, "already built: a reload is not a second fly-together");
            Assert.That(new BuildFlow().TryPlace("plan_build_1"), Is.False, "build mode is off");
        }

        [Test]
        public void IdeasFromAnotherSessionAreIgnoredAndExitResets()
        {
            var f = new BuildFlow();
            f.StartScan(); f.OnScanAccepted("bsess_a"); f.OnInventory(Inv(true));
            f.OnIdeas("bsess_b", new List<BuildIdeaDto> { Idea("idea_x", "plan_x") }, true);
            Assert.That(f.Phase, Is.EqualTo(BuildPhase.Labelled));
            f.Exit();
            Assert.That(new object[] { f.Phase, f.SessionId, f.Active }, Is.EqualTo(new object[] { BuildPhase.Off, null, false }));
        }

        [Test]
        public void AMessageSaysWhetherItWasTakenSoOnlyThoseAreShown()
        {
            var f = new BuildFlow();
            Assert.That(f.OnIdeas("bsess_a", new List<BuildIdeaDto> { Idea("idea_1", "plan_build_1") }, true), Is.False, "ideas with build mode off");
            Assert.That(f.OnInventory(null), Is.False);
            Assert.That(f.OnInventory(Inv(true)), Is.True);
            Assert.That(f.OnIdeas("bsess_b", new List<BuildIdeaDto> { Idea("idea_x", "plan_x") }, true), Is.False, "another session's ideas");
            Assert.That(f.OnIdeas("bsess_a", new List<BuildIdeaDto> { Idea("idea_1", "plan_build_1") }, true), Is.True);
            f.Pick("idea_1");
            Assert.That(f.OnInventory(Inv(true)), Is.False, "nothing interrupts a build");
            Assert.That(f.OnIdeas("bsess_a", new List<BuildIdeaDto>(), true), Is.False);
        }

        [Test]
        public void WhenARethinkLeavesNoIdeasYouAreBackToTheLabelledObjects()
        {
            var f = new BuildFlow();
            f.OnInventory(Inv(true));
            f.OnIdeas("bsess_a", new List<BuildIdeaDto> { Idea("idea_1", "plan_build_1") }, true);
            f.OnIdeas("bsess_a", new List<BuildIdeaDto>(), true);
            Assert.That(f.Phase, Is.EqualTo(BuildPhase.Labelled), "nothing to pick, so nothing pretends to be pickable");
            Assert.That(f.Pick("idea_1"), Is.False);
        }

        [Test]
        public void AFailedScanPutsYouBackWhereYouWere()
        {
            var f = new BuildFlow();
            f.StartScan(); f.ScanFailed();
            Assert.That(f.Phase, Is.EqualTo(BuildPhase.Off), "the first scan failed: build mode never started");

            f.OnInventory(Inv(true));
            f.OnIdeas("bsess_a", new List<BuildIdeaDto> { Idea("idea_1", "plan_build_1") }, true);
            f.StartScan(); f.ScanFailed();                  // a look-around scan (trigger on empty space) that failed
            Assert.That(f.Phase, Is.EqualTo(BuildPhase.Ideas), "the ideas are still there to pick from");

            f.Pick("idea_1"); f.TryPlace("plan_build_1"); f.OnPlaced(); f.OnAssembled();
            f.StartScan(); f.ScanFailed();                  // "what can I build?" said mid-build, and the scan failed
            Assert.That(f.Phase, Is.EqualTo(BuildPhase.Walkthrough), "carry on building");
            f.ScanFailed();
            Assert.That(f.Phase, Is.EqualTo(BuildPhase.Walkthrough), "a failure with no scan running changes nothing");
        }

        [Test]
        public void ALateInventoryFromTheSessionYouLeftDoesNotRestartBuildMode()
        {
            var f = new BuildFlow();
            f.StartScan(); f.OnScanAccepted("bsess_a"); f.OnInventory(Inv(false));
            f.Exit();                                       // the Director started another run while the labels were on their way
            f.OnInventory(Inv(true));
            Assert.That(f.Active, Is.False, "the labels of the session that was left");
            f.OnInventory(Inv(true, "bsess_replay"));
            Assert.That(f.Phase, Is.EqualTo(BuildPhase.Labelled), "a new session (a Director replay) starts build mode");
        }

        [Test]
        public void TheOldHologramIsHiddenWhileYouLookAtTheRoomAndBackForTheBuild()
        {
            var f = new BuildFlow();
            var hidden = new List<BuildPhase>();
            void Note() { if (f.HidesHologram) hidden.Add(f.Phase); }
            Note(); f.StartScan(); Note(); f.OnInventory(Inv(true)); Note();
            f.OnIdeas("bsess_a", new List<BuildIdeaDto> { Idea("idea_1", "plan_build_1") }, true); Note();
            f.Pick("idea_1"); Note(); f.TryPlace("plan_build_1"); f.OnPlaced(); Note(); f.OnAssembled(); Note();
            Assert.That(hidden, Is.EqualTo(new[] { BuildPhase.Scanning, BuildPhase.Labelled, BuildPhase.Ideas, BuildPhase.Starting }));
        }

        [Test]
        public void ADesignThatTurnsABoxKnowsWhichOfItsSidesIsWhichOnTheRealOne()
        {
            // The real box lies flat: 30 long (x), 2 high (y), 20 deep (z). Orientation is never a rotation in a build plan: the
            // design reorders the size instead, so the flight has to work out which design axis is which real axis.
            var real = new[] { 0.30, 0.02, 0.20 };
            Assert.That(FlyPath.MatchAxes(new[] { 0.30, 0.02, 0.20 }, real), Is.EqualTo(new[] { 0, 1, 2 }), "flat, as found");
            Assert.That(FlyPath.MatchAxes(new[] { 0.02, 0.30, 0.20 }, real), Is.EqualTo(new[] { 1, 0, 2 }), "stood upright on its short edge");
            Assert.That(FlyPath.MatchAxes(new[] { 0.20, 0.02, 0.30 }, real), Is.EqualTo(new[] { 2, 1, 0 }), "flat, turned a quarter turn");
            Assert.That(FlyPath.MatchAxes(new[] { 0.201, 0.30, 0.019 }, real), Is.EqualTo(new[] { 2, 0, 1 }), "sizes fixed to a standard differ by millimetres");
            Assert.That(FlyPath.MatchAxes(new[] { 0.1, 0.1, 0.1 }, new[] { 0.1, 0.1, 0.1 }), Is.EqualTo(new[] { 0, 1, 2 }), "a cube needs no turn");
            Assert.That(FlyPath.MatchAxes(null, real), Is.EqualTo(new[] { 0, 1, 2 }), "nothing to match: no turn");
        }

        [Test]
        public void FlightsEaseStaggerAndArc()
        {
            Assert.That(new[] { FlyPath.Ease(0), FlyPath.Ease(0.5), FlyPath.Ease(1) }, Is.EqualTo(new[] { 0.0, 0.5, 1.0 }));
            Assert.That(FlyPath.Progress(1, 0.3), Is.EqualTo(0.0));
            Assert.That(FlyPath.Progress(1, 1.0), Is.EqualTo(1.0));
            Assert.That(FlyPath.Lift(0, 1), Is.EqualTo(0.0));
            Assert.That(FlyPath.Lift(0.5, 1), Is.EqualTo(0.4).Within(1e-9));
            Assert.That(FlyPath.TotalSeconds(4), Is.EqualTo(1.6).Within(1e-9));
        }
    }
}
