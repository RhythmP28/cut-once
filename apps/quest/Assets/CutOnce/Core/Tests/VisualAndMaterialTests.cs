using System.Collections.Generic;
using System.Linq;
using NUnit.Framework;

namespace CutOnce.Core.Tests
{
    public class VisualAndMaterialTests
    {
        const string Aid = "asm_test_run";
        static readonly PlanDto Plan = RepoFiles.Plan("plan_desk_archetype.json");
        static HologramPalette Palette => HologramPalette.Parse(RepoFiles.Read(RepoFiles.Fixture("hologram-palette.json")));

        static BuildStateDto StateWith(params string[] built)
        {
            var store = new BuildStateStore(); store.Reset(Plan, Aid, null);
            foreach (var id in built) store.Propose(id, "built");
            return store.Current;
        }

        [Test]
        public void EveryPartGetsOneOfTheFiveLiveLooks()
        {
            var state = StateWith("part_tabletop");
            var visuals = VisualStateResolver.Resolve(Plan, state);

            Assert.That(visuals.Count, Is.EqualTo(Plan.parts.Count));
            Assert.That(visuals["part_tabletop"].Base, Is.EqualTo(BaseVisual.BUILT_LIVE));
            var current = Plan.steps.First(s => s.step_id == state.current_step_id).part_ids;
            Assert.That(current.All(id => visuals[id].Base == BaseVisual.CURRENT_STEP), Is.True);
            Assert.That(state.available_part_ids.Except(current).All(id => visuals[id].Base == BaseVisual.MISSING), Is.True);
            Assert.That(state.blocked_part_ids.All(id => visuals[id].Base == BaseVisual.FUTURE), Is.True);
        }

        [Test]
        public void ReplayDrawsBuiltPartsSolid() =>
            Assert.That(VisualStateResolver.Resolve(Plan, StateWith("part_tabletop"), replay: true)["part_tabletop"].Base, Is.EqualTo(BaseVisual.BUILT_REPLAY));

        [Test]
        public void HighlightBeatsSelectionAndWrongBeatsBoth()
        {
            var both = new PartVisual { Base = BaseVisual.MISSING, Modifiers = new List<VisualModifier> { VisualModifier.SELECTED, VisualModifier.HIGHLIGHTED } };
            var style = Palette.StyleFor(both);
            Assert.That(style.edge, Is.EqualTo(Palette.modifiers["HIGHLIGHTED"].edge));
            Assert.That(style.fillAlpha, Is.EqualTo(Palette.bases["MISSING"].fillAlpha + Palette.modifiers["HIGHLIGHTED"].fillAlphaAdd.Value).Within(1e-9));

            both.Base = BaseVisual.WRONG;
            Assert.That(Palette.StyleFor(both).edge, Is.EqualTo(Palette.bases["WRONG"].edge));
        }

        [Test]
        public void StyleForNeverEditsThePaletteItself()
        {
            var palette = Palette;
            double before = palette.bases["MISSING"].fillAlpha;
            palette.StyleFor(new PartVisual { Base = BaseVisual.MISSING, Modifiers = new List<VisualModifier> { VisualModifier.HIGHLIGHTED } });
            Assert.That(palette.bases["MISSING"].fillAlpha, Is.EqualTo(before));
        }

        [Test]
        public void HexColoursParse()
        {
            var (r, g, b) = HologramPalette.Rgb("#FF8000");
            Assert.That(r, Is.EqualTo(1f)); Assert.That(g, Is.EqualTo(128 / 255f).Within(1e-6)); Assert.That(b, Is.EqualTo(0f));
            Assert.Throws<System.FormatException>(() => HologramPalette.Rgb("red"));
        }

        [Test]
        public void AccuracyTagsDecideWhatDrawsDashed()
        {
            PartDto Tagged(string source, string tol) => new PartDto { external_ids = new Dictionary<string, string> { ["source"] = source, ["tolerance_m"] = tol } };
            Assert.That(PartAccuracy.Of(new PartDto()).IsApproximate, Is.False, "an untagged part is a designed part");
            Assert.That(PartAccuracy.Of(Tagged("measured", "0.005")).IsApproximate, Is.False);
            Assert.That(PartAccuracy.Of(Tagged("drawings", "0.1")).IsApproximate, Is.True);
            Assert.That(PartAccuracy.Of(Tagged("assumed", "unknown")).IsApproximate, Is.True);
            Assert.That(PartAccuracy.Of(Tagged("measured", "0.005")).Label, Is.EqualTo("measured, ±5 mm"));
            Assert.That(PartAccuracy.Of(Tagged("lidar", "0.5")).Label, Is.EqualTo("lidar, ±0.5 m"));
        }

        [Test]
        public void MaterialsCountDownAsStepsFinish()
        {
            var before = MaterialList.For(Plan, StateWith());
            Assert.That(before, Is.Not.Empty);
            Assert.That(before.All(l => l.Used == 0 && l.Remaining == l.Required), Is.True);

            var firstStep = Plan.steps.OrderBy(s => s.index).First();
            var after = MaterialList.For(Plan, StateWith(firstStep.part_ids.ToArray()));
            foreach (var use in firstStep.materials)
                Assert.That(after.First(l => l.MaterialId == use.material_id).Used, Is.EqualTo(use.qty));
        }
    }
}
