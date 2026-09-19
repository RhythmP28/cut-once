using System;
using System.IO;
using System.Linq;
using NUnit.Framework;

namespace CutOnce.Core.Tests
{
    public class GlbReaderTests
    {
        // The app's bundled copy: always real bytes (the one in data/e7/out is in Git LFS, a pointer on a checkout without it).
        static string BundledGlb => Path.Combine(RepoFiles.Root, "apps", "quest", "Assets", "CutOnce", "AR", "Resources", "CutOnce", "e7.glb.bytes");
        static PlanDto E7Plan => CoreJson.Parse<PlanDto>(File.ReadAllText(Path.Combine(RepoFiles.Root, "apps", "quest", "Assets", "CutOnce", "AR", "Resources", "CutOnce", "e7.plan.json")));

        [Test]
        public void EveryE7PartHasItsMeshAndItsBoundsMatchThePlan()
        {
            var meshes = GlbReader.ReadNamedMeshes(File.ReadAllBytes(BundledGlb));
            var plan = E7Plan;
            Assert.That(meshes.Keys.OrderBy(k => k), Is.EqualTo(plan.parts.Select(p => p.part_id).OrderBy(k => k)));

            foreach (var part in plan.parts)
            {
                var m = meshes[part.part_id];
                Assert.That(m.Indices.Length % 3, Is.EqualTo(0));
                Assert.That(m.Indices.All(i => i >= 0 && i < m.Positions.Length / 3), Is.True, $"{part.part_id} has an index out of range");
                for (int axis = 0; axis < 3; axis++)
                {
                    var values = Enumerable.Range(0, m.Positions.Length / 3).Select(i => (double)m.Positions[i * 3 + axis]).ToList();
                    Assert.That(values.Min(), Is.EqualTo(part.shape.bounds.min[axis]).Within(0.002), $"{part.part_id} axis {axis} min");
                    Assert.That(values.Max(), Is.EqualTo(part.shape.bounds.max[axis]).Within(0.002), $"{part.part_id} axis {axis} max");
                }
            }
            Assert.That(meshes.Values.Sum(m => m.TriangleCount), Is.GreaterThan(plan.parts.Count * 12), "real outlines, not boxes");
        }

        [Test]
        public void ItRefusesFilesThatAreNotGlb()
        {
            Assert.Throws<InvalidDataException>(() => GlbReader.ReadNamedMeshes(new byte[] { 1, 2, 3 }));
            Assert.Throws<InvalidDataException>(() => GlbReader.ReadNamedMeshes(System.Text.Encoding.ASCII.GetBytes("version https://git-lfs.github.com/spec/v1\noid sha256:abc")));
        }

        [Test]
        public void NodeTransformsAreApplied()
        {
            // A one-triangle file: node translated by (10, 0, 0) and scaled by 2.
            string json = "{\"asset\":{\"version\":\"2.0\"},\"scene\":0,\"scenes\":[{\"nodes\":[0]}],\"nodes\":[{\"name\":\"part_t\",\"mesh\":0,\"translation\":[10,0,0],\"scale\":[2,2,2]}]," +
                          "\"meshes\":[{\"primitives\":[{\"attributes\":{\"POSITION\":0}}]}],\"accessors\":[{\"bufferView\":0,\"componentType\":5126,\"count\":3,\"type\":\"VEC3\"}]," +
                          "\"bufferViews\":[{\"buffer\":0,\"byteLength\":36}],\"buffers\":[{\"byteLength\":36}]}";
            while (json.Length % 4 != 0) json += " ";
            var bin = new float[] { 0, 0, 0, 1, 0, 0, 0, 1, 0 }.SelectMany(BitConverter.GetBytes).ToArray();
            var jsonBytes = System.Text.Encoding.UTF8.GetBytes(json);
            var glb = new MemoryStream();
            void U32(uint v) => glb.Write(BitConverter.GetBytes(v), 0, 4);
            U32(0x46546C67); U32(2); U32((uint)(12 + 8 + jsonBytes.Length + 8 + bin.Length));
            U32((uint)jsonBytes.Length); U32(0x4E4F534A); glb.Write(jsonBytes, 0, jsonBytes.Length);
            U32((uint)bin.Length); U32(0x004E4942); glb.Write(bin, 0, bin.Length);

            var mesh = GlbReader.ReadNamedMeshes(glb.ToArray())["part_t"];
            Assert.That(mesh.Positions, Is.EqualTo(new float[] { 10, 0, 0, 12, 0, 0, 10, 2, 0 }));
            Assert.That(mesh.Indices, Is.EqualTo(new[] { 0, 1, 2 }), "no index buffer: vertices are taken in order");
        }
    }
}
