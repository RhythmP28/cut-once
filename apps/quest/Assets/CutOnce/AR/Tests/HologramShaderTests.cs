using System.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.Rendering;
using UnityEngine;

namespace CutOnce.AR.Tests
{
    /// <summary>
    /// Importing a shader only parses it; the HLSL is compiled later, per platform, when something first draws with
    /// it, which for us would be on the headset. This compiles the hologram for the Quest's two graphics APIs and
    /// for the Mac Editor, with and without the stereo keywords, so a typo fails here and not in the demo.
    /// </summary>
    public class HologramShaderTests
    {
        static readonly (ShaderCompilerPlatform api, BuildTarget target)[] Targets =
        {
            (ShaderCompilerPlatform.Vulkan, BuildTarget.Android), (ShaderCompilerPlatform.GLES3x, BuildTarget.Android), (ShaderCompilerPlatform.Metal, BuildTarget.StandaloneOSX),
        };
        static readonly string[][] KeywordSets = { new string[0], new[] { "STEREO_MULTIVIEW_ON" }, new[] { "STEREO_INSTANCING_ON" }, new[] { "INSTANCING_ON" } };

        [Test]
        public void TheHologramShaderIsInResourcesSoABuildKeepsIt()
        {
            var shader = Resources.Load<Shader>(HologramMaterial.ResourcePath);
            Assert.That(shader, Is.Not.Null);
            Assert.That(shader.name, Is.EqualTo(HologramMaterial.ShaderName));
            Assert.That(ShaderUtil.ShaderHasError(shader), Is.False);
        }

        [Test]
        public void ItCompilesForTheQuestAndTheEditorInMonoAndStereo()
        {
            var shader = Resources.Load<Shader>(HologramMaterial.ResourcePath);
            var pass = ShaderUtil.GetShaderData(shader).GetSubshader(0).GetPass(0);
            foreach (var (api, target) in Targets)
                foreach (var keywords in KeywordSets)
                    foreach (var stage in new[] { ShaderType.Vertex, ShaderType.Fragment })
                    {
                        var result = pass.CompileVariant(stage, keywords, api, target);
                        var errors = result.Messages.Where(m => m.severity == ShaderCompilerMessageSeverity.Error).Select(m => $"{m.message} (line {m.line})").ToArray();
                        Assert.That(result.Success && errors.Length == 0, Is.True, $"{api} {stage} [{string.Join(" ", keywords)}]: {string.Join("; ", errors)}");
                    }
        }

        [Test]
        public void EveryPropertyPartViewWritesExistsInTheShader()
        {
            var shader = Resources.Load<Shader>(HologramMaterial.ResourcePath);
            var names = Enumerable.Range(0, shader.GetPropertyCount()).Select(shader.GetPropertyName).ToList();
            foreach (var wanted in new[] { "_FillColor", "_EdgeColor", "_EdgeWidthPx", "_PulseHz", "_Brackets", "_Grid", "_Dashed", "_HalfSize", "_EdgeMode", "_RevealY" })
                Assert.That(names, Does.Contain(wanted));
        }
    }
}
