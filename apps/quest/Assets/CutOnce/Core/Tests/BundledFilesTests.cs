using System.IO;
using NUnit.Framework;

namespace CutOnce.Core.Tests
{
    /// <summary>
    /// The app carries copies of two repo files in a Resources folder (a build cannot read outside Assets). A copy
    /// that drifts is a silent bug, so this fails until the copy is refreshed: `pnpm quest:bundle`.
    /// </summary>
    public class BundledFilesTests
    {
        static string Bundled(string name) => Path.Combine(RepoFiles.Root, "apps", "quest", "Assets", "CutOnce", "AR", "Resources", "CutOnce", name);

        [TestCase("data/fixtures/hologram-palette.json", "hologram-palette.json")]
        [TestCase("data/demo/desk.plan.json", "desk.plan.json")]
        public void TheBundledCopyMatchesItsSource(string source, string bundled) =>
            Assert.That(File.ReadAllText(Bundled(bundled)), Is.EqualTo(File.ReadAllText(Path.Combine(RepoFiles.Root, source))),
                $"{bundled} is out of date: run `pnpm quest:bundle`");

        [Test]
        public void TheBundledPlanParsesAndHasTouchPointsForTheTwoPointOption()
        {
            var plan = CoreJson.Parse<PlanDto>(File.ReadAllText(Bundled("desk.plan.json")));
            Assert.That(plan.parts, Is.Not.Empty);
            Assert.That(plan.touch_points.Count, Is.GreaterThanOrEqualTo(2));
        }
    }
}
