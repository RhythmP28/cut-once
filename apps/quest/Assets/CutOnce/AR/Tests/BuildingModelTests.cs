using System.Collections.Generic;
using System.IO;
using System.Linq;
using CutOnce.Core;
using NUnit.Framework;
using UnityEngine;

namespace CutOnce.AR.Tests
{
    /// <summary>A building (E7) as the headset draws it: real meshes from its model file, crease lines, and a tabletop scale.</summary>
    public class BuildingModelTests
    {
        static string Bundled(string name) => Path.Combine(Application.dataPath, "CutOnce", "AR", "Resources", "CutOnce", name);
        static Dictionary<string, GlbMesh> E7Meshes => GlbReader.ReadNamedMeshes(File.ReadAllBytes(Bundled("e7.glb.bytes")));
        static PlanDto E7Plan => CoreJson.Parse<PlanDto>(File.ReadAllText(Bundled("e7.plan.json")));

        /// <summary>Six times the signed volume. Its sign says which way the triangles wind (outward or inward).</summary>
        static float SignedVolume(Mesh m)
        {
            var v = m.vertices; var t = m.triangles; float sum = 0;
            for (int i = 0; i < t.Length; i += 3) sum += Vector3.Dot(v[t[i]], Vector3.Cross(v[t[i + 1]], v[t[i + 2]]));
            return sum;
        }

        [Test]
        public void MirroringKeepsTheFacesOfAModelFacingOutLikeOurOwnBoxes()
        {
            // ShapeFactory's boxes are checked face by face in HologramGeometryTests; a model part must wind the same way.
            float box = SignedVolume(ShapeFactory.Box(new Vector3(2, 1, 3)));
            foreach (var pair in E7Meshes)
            {
                float model = SignedVolume(GlbMeshes.Surface(pair.Value));
                Assert.That(Mathf.Sign(model), Is.EqualTo(Mathf.Sign(box)), $"{pair.Key} winds the other way: its front faces would be its inside");
            }
        }

        [Test]
        public void ACubeHasTwelveCreaseLinesAndNoDiagonals()
        {
            // A unit cube as a glTF exporter writes it: 8 shared corners, 12 triangles, a diagonal across each face.
            var p = new float[] { 0,0,0, 1,0,0, 1,1,0, 0,1,0, 0,0,1, 1,0,1, 1,1,1, 0,1,1 };
            var i = new[] { 0,2,1, 0,3,2, 4,5,6, 4,6,7, 0,1,5, 0,5,4, 3,7,6, 3,6,2, 0,4,7, 0,7,3, 1,2,6, 1,6,5 };
            var lines = GlbMeshes.EdgeLines(new GlbMesh { Name = "cube", Positions = p, Indices = i }, 0.01f);
            Assert.That(lines.triangles.Length / 3, Is.EqualTo(12 * 4), "12 edges, each two crossed quads of two triangles");
        }

        [Test]
        public void E7IsDrawnFromItsModelAtTabletopScaleAndTheDeskAtFullSize()
        {
            var root = new GameObject("AssemblyRoot (test)");
            try
            {
                var view = root.AddComponent<AssemblyView>();
                Assert.That(view.Build(E7Plan, E7Meshes), Is.Empty);
                Assert.That(view.DisplayScale, Is.EqualTo(1f / 200f));
                Assert.That(view.ScaleLabel, Is.EqualTo("1:200"));
                Assert.That(root.transform.localScale.x, Is.EqualTo(1f / 200f));
                float longest = Mathf.Max(view.LocalBounds.size.x, view.LocalBounds.size.z) * view.DisplayScale;
                Assert.That(longest, Is.InRange(0.3f, AssemblyView.TabletopMaxMetres), "a model that fits on a table");

                var slab = view.ViewOf("part_e7_l01_slab");
                Assert.That(slab.GetComponent<MeshFilter>().sharedMesh.vertexCount, Is.GreaterThan(36), "the real outline, not its bounding box");
                Assert.That(slab.transform.Find("edges"), Is.Not.Null, "crease lines are drawn");

                var desk = CoreJson.Parse<PlanDto>(File.ReadAllText(Bundled("desk.plan.json")));
                view.Build(desk);
                Assert.That(view.DisplayScale, Is.EqualTo(1f));
                Assert.That(root.transform.localScale, Is.EqualTo(Vector3.one));
                Assert.That(root.transform.childCount, Is.EqualTo(desk.parts.Count), "E7's parts were removed");
            }
            finally { Object.DestroyImmediate(root); }
        }

        [Test]
        public void WithoutItsModelFileABuildingStillDrawsAsBoxes()
        {
            var root = new GameObject("AssemblyRoot (test)");
            try
            {
                var view = root.AddComponent<AssemblyView>();
                Assert.That(view.Build(E7Plan, null), Is.Empty);
                Assert.That(view.ViewOf("part_e7_l01_slab").GetComponent<MeshFilter>().sharedMesh.vertexCount, Is.EqualTo(24));
                Assert.That(view.DisplayScale, Is.EqualTo(1f / 200f));
            }
            finally { Object.DestroyImmediate(root); }
        }

        [Test]
        public void AScaledModelStillStandsOnThePointedSpot()
        {
            var model = new Bounds(new Vector3(-20f, 17f, 45f), new Vector3(42f, 34f, 91f));
            var surface = new Vector3(1f, 0.74f, 2f);
            const float scale = 1f / 200f;
            var pose = PlacementMath.StandOn(surface, 30f, model, scale);
            Vector3 lowestCentre = pose.position + pose.rotation * (new Vector3(model.center.x, model.min.y, model.center.z) * scale);
            Assert.That((lowestCentre - surface).magnitude, Is.LessThan(1e-4f));
        }

        [TestCase(1.0f, 1f)]
        [TestCase(4.0f, 1f)]
        [TestCase(12f, 1f / 20f)]
        [TestCase(91f, 1f / 200f)]
        [TestCase(300f, 1f / 500f)]
        public void TheDisplayScaleIsTheLargestArchitecturalScaleThatFitsATable(float span, float expected) =>
            Assert.That(AssemblyView.ScaleFor(new Bounds(Vector3.zero, new Vector3(span, 3f, span * 0.5f))), Is.EqualTo(expected));
    }
}
