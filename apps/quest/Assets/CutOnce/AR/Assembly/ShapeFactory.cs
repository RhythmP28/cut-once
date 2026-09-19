using System.Collections.Generic;
using CutOnce.Core;
using UnityEngine;

namespace CutOnce.AR
{
    /// <summary>
    /// Builds each part's mesh at its true size in metres (no transform scale), so the shader can measure
    /// distances to edges in object space. Meshes are generated, not CreatePrimitive: a build can strip the
    /// primitives' components, and generated meshes behave the same in the Editor, the simulator and on the Quest.
    /// </summary>
    public static class ShapeFactory
    {
        public const int EdgeNone = 0, EdgeBox = 1, EdgeCylinder = 2;
        const int CylinderSides = 24, TubeSides = 10;

        public sealed class Built
        {
            public Mesh Mesh;
            public Vector3 LocalPosition;        // in mirrored model space
            public Quaternion LocalRotation = Quaternion.identity;
            public Vector3 HalfSize;             // object-space half extents, for the edge maths
            public int EdgeMode;
        }

        public static Built Build(PartDto part)
        {
            var s = part.shape;
            var rotation = ModelSpace.Rotation(part.rotation_quat);
            switch (s.type)
            {
                case "box":
                    var size = ModelSpace.Size(s.size);
                    return new Built { Mesh = Box(size), LocalPosition = ModelSpace.Point(part.position), LocalRotation = rotation, HalfSize = size * 0.5f, EdgeMode = EdgeBox };
                case "cylinder":
                    float r = (float)s.diameter * 0.5f, h = (float)s.length;
                    return new Built { Mesh = Cylinder(r, h, CylinderSides), LocalPosition = ModelSpace.Point(part.position),
                                       LocalRotation = rotation * ModelSpace.AxisFromY(s.axis), HalfSize = new Vector3(r, h * 0.5f, r), EdgeMode = EdgeCylinder };
                case "polyline":
                    var points = new List<Vector3>();
                    foreach (var p in s.points) points.Add(ModelSpace.Point(p));
                    // Route points are relative to the part's position, the same convention as the web viewer (buildPart.ts) and
                    // the validator's bounds (geometry.ts). A mirrored offset is still an offset, so Point() serves for both.
                    return new Built { Mesh = Tube(points, (float)s.diameter * 0.5f, TubeSides), LocalPosition = ModelSpace.Point(part.position), LocalRotation = rotation, HalfSize = Vector3.one, EdgeMode = EdgeNone };
                case "mesh":
                    // A GLB-backed part (E7). Until the model loader lands, its declared bounds stand in for it.
                    if (s.bounds?.min == null || s.bounds.max == null) return null;
                    Vector3 a = ModelSpace.Point(s.bounds.min), b = ModelSpace.Point(s.bounds.max);
                    var extent = new Vector3(Mathf.Abs(b.x - a.x), Mathf.Abs(b.y - a.y), Mathf.Abs(b.z - a.z));
                    return new Built { Mesh = Box(extent), LocalPosition = (a + b) * 0.5f, HalfSize = extent * 0.5f, EdgeMode = EdgeBox };
                default:
                    return null;
            }
        }

        /// <summary>An axis-aligned box centred on the origin, 24 vertices so every face has its own flat normal.</summary>
        public static Mesh Box(Vector3 size)
        {
            Vector3 h = size * 0.5f;
            var normals = new[] { Vector3.right, Vector3.left, Vector3.up, Vector3.down, Vector3.forward, Vector3.back };
            var vertices = new List<Vector3>(); var meshNormals = new List<Vector3>(); var triangles = new List<int>();
            foreach (var n in normals)
            {
                Vector3 u = Mathf.Abs(n.y) > 0.5f ? Vector3.right : Vector3.up, v = Vector3.Cross(n, u);
                int i = vertices.Count;
                foreach (var corner in new[] { -u - v, u - v, u + v, -u + v }) { vertices.Add(Vector3.Scale(n + corner, h)); meshNormals.Add(n); }
                triangles.AddRange(new[] { i, i + 1, i + 2, i, i + 2, i + 3 });
            }
            return Finish("box", vertices, meshNormals, triangles);
        }

        /// <summary>A capped cylinder along +Y, centred on the origin.</summary>
        public static Mesh Cylinder(float radius, float height, int sides)
        {
            var vertices = new List<Vector3>(); var normals = new List<Vector3>(); var triangles = new List<int>();
            float y = height * 0.5f;
            for (int i = 0; i <= sides; i++)
            {
                float a = i * Mathf.PI * 2f / sides; var n = new Vector3(Mathf.Cos(a), 0, Mathf.Sin(a));
                vertices.Add(n * radius + Vector3.down * y); normals.Add(n);
                vertices.Add(n * radius + Vector3.up * y); normals.Add(n);
            }
            for (int i = 0; i < sides; i++) { int k = i * 2; triangles.AddRange(new[] { k, k + 1, k + 3, k, k + 3, k + 2 }); }
            foreach (float sign in new[] { -1f, 1f })
            {
                int centre = vertices.Count; vertices.Add(Vector3.up * y * sign); normals.Add(Vector3.up * sign);
                for (int i = 0; i <= sides; i++)
                {
                    float a = i * Mathf.PI * 2f / sides;
                    vertices.Add(new Vector3(Mathf.Cos(a) * radius, y * sign, Mathf.Sin(a) * radius)); normals.Add(Vector3.up * sign);
                }
                for (int i = 0; i < sides; i++)
                    triangles.AddRange(sign > 0 ? new[] { centre, centre + i + 2, centre + i + 1 } : new[] { centre, centre + i + 1, centre + i + 2 });
            }
            return Finish("cylinder", vertices, normals, triangles);
        }

        /// <summary>Straight runs between the points (a cable route), one open tube per run. Joints overlap, which a see-through hologram hides.</summary>
        public static Mesh Tube(IReadOnlyList<Vector3> points, float radius, int sides)
        {
            var vertices = new List<Vector3>(); var normals = new List<Vector3>(); var triangles = new List<int>();
            for (int p = 1; p < points.Count; p++)
            {
                Vector3 a = points[p - 1], b = points[p], axis = b - a;
                if (axis.sqrMagnitude < 1e-10f) continue;                       // a repeated point
                var frame = Quaternion.FromToRotation(Vector3.up, axis.normalized);
                int start = vertices.Count;
                for (int i = 0; i <= sides; i++)
                {
                    float t = i * Mathf.PI * 2f / sides; var n = frame * new Vector3(Mathf.Cos(t), 0, Mathf.Sin(t));
                    vertices.Add(a + n * radius); normals.Add(n);
                    vertices.Add(b + n * radius); normals.Add(n);
                }
                for (int i = 0; i < sides; i++) { int k = start + i * 2; triangles.AddRange(new[] { k, k + 1, k + 3, k, k + 3, k + 2 }); }
            }
            return vertices.Count == 0 ? null : Finish("tube", vertices, normals, triangles);
        }

        static Mesh Finish(string name, List<Vector3> vertices, List<Vector3> normals, List<int> triangles)
        {
            var mesh = new Mesh { name = name };
            mesh.SetVertices(vertices); mesh.SetNormals(normals); mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();
            return mesh;
        }
    }
}
