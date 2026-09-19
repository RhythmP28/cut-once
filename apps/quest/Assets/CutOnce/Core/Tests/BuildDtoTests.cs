using NUnit.Framework;

namespace CutOnce.Core.Tests
{
    public class BuildDtoTests
    {
        [Test]
        public void TheSharedBuildIdeasMessageParsesWithItsPlanOriginAndTwinMap()
        {
            var m = CoreJson.Parse<WsMessageDto>(RepoFiles.Read(RepoFiles.Fixture("build", "ws_build_ideas.json")));
            Assert.That(m.type, Is.EqualTo("build_ideas"));
            Assert.That(m.final, Is.True);
            var idea = m.ideas[0];
            Assert.That(idea.title, Is.EqualTo("Can on a stage"));
            Assert.That(idea.plan.parts.Count, Is.EqualTo(2));
            Assert.That(idea.plan.parts[1].shape.axis, Is.EqualTo("y"));
            Assert.That(idea.origin.rotation_quat[1], Is.EqualTo(0.3826834).Within(1e-6));
            Assert.That(idea.twin_of["part_o1"], Is.EqualTo("o1"));
        }

        [Test]
        public void AnUploadLeavesOutAMissingSessionId()
        {
            var json = CoreJson.Write(new BuildScanUploadDto { device_id = "quest", grid = new BuildGridDto { cols = 8, rows = 6 }, hit = "0" });
            Assert.That(json, Does.Not.Contain("session_id"));
        }
    }
}
