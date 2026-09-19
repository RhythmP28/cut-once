using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using Newtonsoft.Json.Linq;

namespace CutOnce.Core
{
    /// <summary>One named mesh from a .glb, in the file's own frame (glTF: right-handed, +Y up, metres: the plan frame).</summary>
    public sealed class GlbMesh
    {
        public string Name;
        public float[] Positions;   // x, y, z per vertex, node transforms already applied
        public int[] Indices;       // triangles
        public int TriangleCount => Indices.Length / 3;
    }

    /// <summary>
    /// Reads the meshes of a binary glTF (.glb) by node name. Our plan files name one node per part (node = part_id), so
    /// this is all the headset needs: no materials, textures or animation. Pure C#, so it is tested without Unity, and
    /// it needs no extra Unity package. Only triangle lists with float positions are read; anything else is refused
    /// with a message rather than drawn wrong.
    /// </summary>
    public static class GlbReader
    {
        const uint Magic = 0x46546C67, JsonChunk = 0x4E4F534A, BinChunk = 0x004E4942;

        public static Dictionary<string, GlbMesh> ReadNamedMeshes(byte[] glb)
        {
            if (glb == null || glb.Length < 20 || BitConverter.ToUInt32(glb, 0) != Magic) throw new InvalidDataException("not a binary glTF (.glb) file");
            if (BitConverter.ToUInt32(glb, 4) != 2) throw new InvalidDataException("only glTF 2 is supported");

            JObject json = null; ArraySegment<byte> bin = default;
            for (int at = 12; at + 8 <= glb.Length;)
            {
                int length = (int)BitConverter.ToUInt32(glb, at); uint type = BitConverter.ToUInt32(glb, at + 4);
                if (type == JsonChunk) json = JObject.Parse(Encoding.UTF8.GetString(glb, at + 8, length));
                else if (type == BinChunk) bin = new ArraySegment<byte>(glb, at + 8, length);
                at += 8 + length;
            }
            if (json == null) throw new InvalidDataException("the .glb has no JSON chunk");

            var result = new Dictionary<string, GlbMesh>();
            var nodes = (JArray)json["nodes"] ?? new JArray();
            var roots = SceneRoots(json, nodes.Count);
            foreach (int root in roots) Walk(json, nodes, bin, root, Identity(), result);
            return result;
        }

        static IEnumerable<int> SceneRoots(JObject json, int nodeCount)
        {
            var scenes = (JArray)json["scenes"];
            if (scenes != null && scenes.Count > 0)
            {
                int scene = json["scene"]?.Value<int>() ?? 0;
                foreach (var n in (JArray)scenes[scene]["nodes"] ?? new JArray()) yield return n.Value<int>();
                yield break;
            }
            // No scene: every node that is nobody's child is a root.
            var children = new HashSet<int>();
            for (int i = 0; i < nodeCount; i++) foreach (var c in (JArray)json["nodes"][i]["children"] ?? new JArray()) children.Add(c.Value<int>());
            for (int i = 0; i < nodeCount; i++) if (!children.Contains(i)) yield return i;
        }

        static void Walk(JObject json, JArray nodes, ArraySegment<byte> bin, int index, double[] parent, Dictionary<string, GlbMesh> result)
        {
            var node = (JObject)nodes[index];
            var world = Multiply(parent, Local(node));
            if (node["mesh"] != null)
            {
                string name = node["name"]?.Value<string>() ?? $"node_{index}";
                result[name] = ReadMesh(json, bin, node["mesh"].Value<int>(), world, name);
            }
            foreach (var child in (JArray)node["children"] ?? new JArray()) Walk(json, nodes, bin, child.Value<int>(), world, result);
        }

        static GlbMesh ReadMesh(JObject json, ArraySegment<byte> bin, int meshIndex, double[] m, string name)
        {
            var positions = new List<float>(); var indices = new List<int>();
            foreach (JObject prim in (JArray)json["meshes"][meshIndex]["primitives"])
            {
                int mode = prim["mode"]?.Value<int>() ?? 4;
                if (mode != 4) throw new InvalidDataException($"{name}: only triangle lists are supported (mode {mode})");
                int baseVertex = positions.Count / 3;
                var p = ReadAccessor(json, bin, prim["attributes"]["POSITION"].Value<int>(), name, expectFloatVec3: true);
                for (int i = 0; i < p.Length; i += 3)
                {
                    double x = p[i], y = p[i + 1], z = p[i + 2];
                    positions.Add((float)(m[0] * x + m[4] * y + m[8] * z + m[12]));
                    positions.Add((float)(m[1] * x + m[5] * y + m[9] * z + m[13]));
                    positions.Add((float)(m[2] * x + m[6] * y + m[10] * z + m[14]));
                }
                if (prim["indices"] == null) for (int i = 0; i < p.Length / 3; i++) indices.Add(baseVertex + i);
                else foreach (var v in ReadAccessor(json, bin, prim["indices"].Value<int>(), name, expectFloatVec3: false)) indices.Add(baseVertex + (int)v);
            }
            if (Determinant3(m) < 0) for (int i = 0; i + 2 < indices.Count; i += 3) { int t = indices[i + 1]; indices[i + 1] = indices[i + 2]; indices[i + 2] = t; }   // a mirroring node flips winding back
            return new GlbMesh { Name = name, Positions = positions.ToArray(), Indices = indices.ToArray() };
        }

        static double[] ReadAccessor(JObject json, ArraySegment<byte> bin, int index, string name, bool expectFloatVec3)
        {
            var acc = (JObject)json["accessors"][index];
            if (acc["sparse"] != null) throw new InvalidDataException($"{name}: sparse accessors are not supported");
            int count = acc["count"].Value<int>(), componentType = acc["componentType"].Value<int>();
            string type = acc["type"].Value<string>();
            int components = type == "VEC3" ? 3 : type == "SCALAR" ? 1 : throw new InvalidDataException($"{name}: accessor type {type} is not supported");
            if (expectFloatVec3 && (componentType != 5126 || components != 3)) throw new InvalidDataException($"{name}: positions must be float VEC3");
            int size = componentType == 5126 || componentType == 5125 ? 4 : componentType == 5123 ? 2 : componentType == 5121 ? 1
                     : throw new InvalidDataException($"{name}: component type {componentType} is not supported");

            var view = (JObject)json["bufferViews"][acc["bufferView"].Value<int>()];
            int start = (view["byteOffset"]?.Value<int>() ?? 0) + (acc["byteOffset"]?.Value<int>() ?? 0);
            int stride = view["byteStride"]?.Value<int>() ?? size * components;
            var values = new double[count * components];
            for (int i = 0; i < count; i++)
                for (int k = 0; k < components; k++)
                {
                    int at = bin.Offset + start + i * stride + k * size;
                    if (at + size > bin.Offset + bin.Count) throw new InvalidDataException($"{name}: accessor {index} runs past the binary chunk");
                    values[i * components + k] = componentType switch
                    {
                        5126 => BitConverter.ToSingle(bin.Array, at),
                        5125 => BitConverter.ToUInt32(bin.Array, at),
                        5123 => BitConverter.ToUInt16(bin.Array, at),
                        _ => bin.Array[at],
                    };
                }
            return values;
        }

        // ── 4 × 4 matrices, column-major like glTF ──────────────────────────────────────────────────────────────
        static double[] Identity() => new double[] { 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1 };

        static double[] Local(JObject node)
        {
            if (node["matrix"] is JArray matrix) { var m = new double[16]; for (int i = 0; i < 16; i++) m[i] = matrix[i].Value<double>(); return m; }
            double[] t = Vec(node["translation"], 0, 0, 0), r = Vec(node["rotation"], 0, 0, 0, 1), s = Vec(node["scale"], 1, 1, 1);
            double x = r[0], y = r[1], z = r[2], w = r[3];
            return new[]
            {
                (1 - 2 * (y * y + z * z)) * s[0], (2 * (x * y + z * w)) * s[0], (2 * (x * z - y * w)) * s[0], 0,
                (2 * (x * y - z * w)) * s[1], (1 - 2 * (x * x + z * z)) * s[1], (2 * (y * z + x * w)) * s[1], 0,
                (2 * (x * z + y * w)) * s[2], (2 * (y * z - x * w)) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0,
                t[0], t[1], t[2], 1,
            };
        }

        static double[] Vec(JToken token, params double[] fallback)
        {
            if (!(token is JArray a)) return fallback;
            var v = new double[a.Count]; for (int i = 0; i < a.Count; i++) v[i] = a[i].Value<double>(); return v;
        }

        static double[] Multiply(double[] a, double[] b)
        {
            var r = new double[16];
            for (int col = 0; col < 4; col++) for (int row = 0; row < 4; row++)
                for (int k = 0; k < 4; k++) r[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
            return r;
        }

        static double Determinant3(double[] m) =>
            m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
    }
}
