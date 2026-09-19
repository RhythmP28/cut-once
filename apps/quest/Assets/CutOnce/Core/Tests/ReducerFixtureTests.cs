using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace CutOnce.Core.Tests
{
    /// <summary>The contract between TypeScript and C#: the same events must fold to the same state, field for field.</summary>
    public class ReducerFixtureTests
    {
        sealed class Fixture { public string note, plan, assembly_id; public List<BuildEventDto> events; public int? up_to; public JObject expected; }

        static IEnumerable<string> FixtureFiles() =>
            Directory.GetFiles(RepoFiles.Fixture("events_to_state"), "*.json").OrderBy(f => f).Select(Path.GetFileName);

        [TestCaseSource(nameof(FixtureFiles))]
        public void FoldMatchesTheTypeScriptReducer(string file)
        {
            var fixture = CoreJson.Parse<Fixture>(RepoFiles.Read(RepoFiles.Fixture("events_to_state", file)));
            var plan = RepoFiles.Plan(fixture.plan.EndsWith(".json") ? fixture.plan : fixture.plan + ".json");

            var state = Reducer.Fold(plan, fixture.assembly_id, fixture.events, fixture.up_to);

            var actual = JObject.FromObject(state, JsonSerializer.Create(CoreJson.Settings));
            Assert.That(JToken.DeepEquals(Normalise(fixture.expected), Normalise(actual)), Is.True,
                $"{file} ({fixture.note})\nexpected: {fixture.expected.ToString(Formatting.None)}\nactual:   {actual.ToString(Formatting.None)}");
        }

        [Test]
        public void ThereAreFixturesToRun() => Assert.That(FixtureFiles().Count(), Is.GreaterThanOrEqualTo(8));

        // 1 and 1.0 are the same number on the wire; JToken.DeepEquals treats Integer and Float as different types.
        static JToken Normalise(JToken token)
        {
            if (token is JObject o) return new JObject(o.Properties().OrderBy(p => p.Name).Select(p => new JProperty(p.Name, Normalise(p.Value))));
            if (token is JArray a) return new JArray(a.Select(Normalise));
            if (token.Type == JTokenType.Integer || token.Type == JTokenType.Float) return new JValue(token.Value<double>());
            return token.DeepClone();
        }
    }
}
