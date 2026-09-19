using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace CutOnce.QuestTools.Tests
{
    /// <summary>
    /// Runs with every EditMode test run (pnpm quest:check, the Test Runner, or an agent through Meta's MCP bridge),
    /// so a setting that would break the headset fails a test on the laptop.
    /// </summary>
    public class QuestReadinessTests
    {
        SceneSetup[] _scenes;

        [SetUp] public void Remember() => _scenes = EditorSceneManager.GetSceneManagerSetup();
        [TearDown] public void Restore() { if (_scenes.Length > 0) EditorSceneManager.RestoreSceneManagerSetup(_scenes); }

        [Test]
        public void ProjectSettingsAreReadyForTheQuest()
        {
            var errors = QuestChecks.Run(includeScenes: false).Where(f => f.IsError).Select(f => f.ToString()).ToList();
            Assert.That(errors, Is.Empty, "Run Cut Once > Apply Quest 3 settings.\n" + string.Join("\n", errors));
        }

        [Test]
        public void BaselineSceneIsInsideTheQuestBudget()
        {
            var scene = EditorSceneManager.OpenScene(QuestBaselineScene.ScenePath, OpenSceneMode.Single);
            var findings = new List<QuestChecks.Finding>();
            QuestChecks.CheckScene(findings, scene);
            Assert.That(findings.Select(f => f.ToString()), Is.Empty);
        }

        [Test]
        public void BaselineSwatchesUseTheSharedPalette()
        {
            // The web preview and the headset read the same file; this catches the two drifting apart.
            var bases = JObject.Parse(File.ReadAllText(QuestBaselineScene.PalettePath))["bases"];
            foreach (var state in new[] { "BUILT_REPLAY", "CURRENT_STEP", "MISSING", "FUTURE", "WRONG" })
            {
                var fill = AssetDatabase.LoadAssetAtPath<Material>($"Assets/CutOnce/Scenes/QuestBaseline/{state}_fill.mat");
                Assert.That(fill, Is.Not.Null, state);
                ColorUtility.TryParseHtmlString(bases[state].Value<string>("fill"), out var expected);
                var actual = fill.GetColor("_BaseColor");
                Assert.That(actual.r, Is.EqualTo(expected.r).Within(0.002f), state);
                Assert.That(actual.g, Is.EqualTo(expected.g).Within(0.002f), state);
                Assert.That(actual.b, Is.EqualTo(expected.b).Within(0.002f), state);
                Assert.That(actual.a, Is.EqualTo(bases[state].Value<float>("fillAlpha")).Within(0.002f), state);
                Assert.That(fill.GetFloat("_SrcBlendAlpha"), Is.EqualTo((float)UnityEngine.Rendering.BlendMode.One),
                    $"{state}: the alpha channel must blend with One, or the fill fades out over passthrough");
            }
        }
    }
}
