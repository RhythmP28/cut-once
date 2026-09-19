using System.Linq;
using NUnit.Framework;

namespace CutOnce.Core.Tests
{
    public class HudTextTests
    {
        static readonly PlanDto Plan = RepoFiles.Plan("plan_desk_archetype.json");

        static BuildStateStore Store(params string[] built)
        {
            var store = new BuildStateStore(); store.Reset(Plan, "asm_hud", null);
            foreach (var id in built) store.Propose(id, "built");
            return store;
        }

        [Test]
        public void ProgressAndStepFollowTheState()
        {
            var s = Store("part_tabletop").Current;
            Assert.That(HudText.Progress(s), Is.EqualTo($"1 / {Plan.parts.Count} · {s.progress.pct}%"));
            var step = HudText.CurrentStep(Plan, s);
            Assert.That(HudText.StepTitle(Plan, s), Is.EqualTo($"Step {step.index} of {Plan.steps.Count} · {step.title}"));
            Assert.That(HudText.StepBody(Plan, s), Does.StartWith(step.instruction));
            Assert.That(HudText.StepBody(Plan, s), Does.Contain("You need: "));
        }

        [Test]
        public void AFinishedBuildSaysSo()
        {
            var s = Store(Plan.steps.OrderBy(x => x.index).SelectMany(x => x.part_ids).ToArray()).Current;
            Assert.That(HudText.TimeLeft(s), Is.EqualTo("Build complete"));
            // The desk plan ends with a milestone ("Flip the desk upright"): a step with no parts is never done, so it stays
            // on the card as the last thing to do. A plan without one falls through to "All steps done".
            var last = HudText.CurrentStep(Plan, s);
            Assert.That(last == null || last.part_ids.Count == 0, Is.True);
            Assert.That(HudText.StepTitle(Plan, s), last == null ? Is.EqualTo("All steps done") : Does.Contain(last.title));
            Assert.That(HudText.Materials(MaterialList.For(Plan, s)), Is.EqualTo("Materials: all used"));
        }

        [Test]
        public void APartCardNamesWhatABlockedPartWaitsFor()
        {
            var s = Store().Current;
            var blocked = Plan.parts.First(p => s.blocked_part_ids.Contains(p.part_id));
            string card = HudText.PartCard(Plan, blocked, s.parts[blocked.part_id], s);
            Assert.That(card, Does.Contain("Waits for: "));
            Assert.That(card, Does.Contain(Plan.parts.First(p => p.part_id == blocked.rests_on[0]).name));
            Assert.That(card, Does.Contain("as designed"));
        }

        [Test]
        public void BuildingOnNothingIsCalledOut()
        {
            var store = Store();
            var blocked = Plan.parts.First(p => store.Current.blocked_part_ids.Contains(p.part_id));
            var e = store.Propose(blocked.part_id, "built");
            Assert.That(HudText.EventLine(Plan, e, store.Current), Does.EndWith("nothing under it yet"));
            Assert.That(HudText.History(Plan, store.Events, store.Current).Single(), Does.StartWith("saving…"));
        }
    }
}
