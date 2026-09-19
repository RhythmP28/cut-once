using System.Collections.Generic;
using CutOnce.Core;
using UnityEngine;

namespace CutOnce.AR
{
    /// <summary>
    /// Turns a mesh read from a plan's .glb into Unity meshes: the surface, and a thin "edge lines" mesh drawn along its
    /// creases. Both are in mirrored model space (ModelSpace). Mirroring X turns a mesh inside out (a reflection flips
    /// every triangle's normal), so each triangle's last two corners are swapped to keep its front face outside, as
    /// glTFast does. BuildingModelTests checks this against our own boxes with signed volume.
    /// </summary>
    public static class GlbMeshes
    {
        /// <summary>Flat-shaded surface: every triangle gets its own vertices, so fresnel reads each face, not a blur.</summary>
        public static Mesh Surface(GlbMesh g)
        {
            var vertices = new Vector3[g.Indices.Length];
            var triangles = new int[g.Indices.Length];
            for (int i = 0; i < g.Indices.Length; i++) vertices[i] = Mirrored(g, g.Indices[i]);
            for (int t = 0; t + 2 < triangles.Length; t += 3) { triangles[t] = t; triangles[t + 1] = t + 2; triangles[t + 2] = t + 1; }   // undo the mirror's flip
            var mesh = new Mesh { name = g.Name, indexFormat = vertices.Length > 65000 ? UnityEngine.Rendering.IndexFormat.UInt32 : UnityEngine.Rendering.IndexFormat.UInt16 };
            mesh.SetVertices(vertices); mesh.SetTriangles(triangles, 0);
            mesh.RecalculateNormals(); mesh.RecalculateBounds();
            return mesh;
        }

        /// <summary>
        /// The edges an architect would draw: where two faces meet at more than <paramref name="creaseDegrees"/>, and open
        /// borders. Flat faces' triangulation diagonals are left out. Each edge becomes two crossed thin quads
        /// <paramref name="width"/> wide (model units), which read as a line from any side with no geometry shader.
        /// </summary>
        public static Mesh EdgeLines(GlbMesh g, float width, float creaseDegrees = 25f)
        {
            // Weld by position: exporters often split vertices at hard edges, which would make every edge look open.
            var ids = new Dictionary<Vector3Int, int>(); var points = new List<Vector3>(); var corner = new int[g.Indices.Length];
            for (int i = 0; i < g.Indices.Length; i++)
            {
                var p = Mirrored(g, g.Indices[i]);
                var key = new Vector3Int(Mathf.RoundToInt(p.x * 1000f), Mathf.RoundToInt(p.y * 1000f), Mathf.RoundToInt(p.z * 1000f));
                if (!ids.TryGetValue(key, out int id)) { id = points.Count; ids[key] = id; points.Add(p); }
                corner[i] = id;
            }

            var faces = new Dictionary<(int, int), List<Vector3>>();
            for (int t = 0; t + 2 < corner.Length; t += 3)
            {
                Vector3 a = points[corner[t]], b = points[corner[t + 1]], c = points[corner[t + 2]];
                var n = Vector3.Cross(b - a, c - a);
                if (n.sqrMagnitude < 1e-12f) continue;                                    // degenerate
                n.Normalize();
                for (int e = 0; e < 3; e++)
                {
                    int i0 = corner[t + e], i1 = corner[t + (e + 1) % 3];
                    var edge = i0 < i1 ? (i0, i1) : (i1, i0);
                    if (!faces.TryGetValue(edge, out var list)) faces[edge] = list = new List<Vector3>(2);
                    list.Add(n);
                }
            }

            float cosCrease = Mathf.Cos(creaseDegrees * Mathf.Deg2Rad);
            var vertices = new List<Vector3>(); var normals = new List<Vector3>(); var triangles = new List<int>();
            foreach (var pair in faces)
            {
                var n = pair.Value;
                bool crease = n.Count != 2 || Vector3.Dot(n[0], n[1]) < cosCrease;
                if (crease) AddLine(points[pair.Key.Item1], points[pair.Key.Item2], width, vertices, normals, triangles);
            }
            if (triangles.Count == 0) return null;
            var mesh = new Mesh { name = g.Name + " edges", indexFormat = vertices.Count > 65000 ? UnityEngine.Rendering.IndexFormat.UInt32 : UnityEngine.Rendering.IndexFormat.UInt16 };
            mesh.SetVertices(vertices); mesh.SetNormals(normals); mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();
            return mesh;
        }

        static void AddLine(Vector3 a, Vector3 b, float width, List<Vector3> v, List<Vector3> n, List<int> t)
        {
            var dir = (b - a).normalized;
            var u = Vector3.Cross(dir, Mathf.Abs(dir.y) > 0.9f ? Vector3.right : Vector3.up).normalized * (width * 0.5f);
            var w = Vector3.Cross(dir, u).normalized * (width * 0.5f);
            foreach (var side in new[] { u, w })
            {
                int i = v.Count;
                v.Add(a - side); v.Add(a + side); v.Add(b + side); v.Add(b - side);
                var normal = Vector3.Cross(dir, side).normalized;
                for (int k = 0; k < 4; k++) n.Add(normal);
                t.AddRange(new[] { i, i + 1, i + 2, i, i + 2, i + 3 });
            }
        }

        static Vector3 Mirrored(GlbMesh g, int index) =>
            new Vector3(-g.Positions[index * 3], g.Positions[index * 3 + 1], g.Positions[index * 3 + 2]);
    }
}
