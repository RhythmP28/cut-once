using System;
using UnityEngine;

namespace CutOnce.Room
{
    [Serializable]
    public sealed class RoomSurface
    {
        public string label;
        public Vector3[] outline;
    }

    /// <summary>Metres in a stable, horizontal room frame. No headset dependency.</summary>
    [Serializable]
    public sealed class RoomGeometry
    {
        public string id;
        public Vector3[] floor;
        public RoomSurface[] surfaces;
        public float height;

        public float Area
        {
            get
            {
                float sum = 0;
                for (int i = 0; i < floor.Length; i++)
                {
                    var a = floor[i]; var b = floor[(i + 1) % floor.Length];
                    sum += a.x * b.z - b.x * a.z;
                }
                return Mathf.Abs(sum) * .5f;
            }
        }

        public float Perimeter
        {
            get
            {
                float sum = 0;
                for (int i = 0; i < floor.Length; i++) sum += Vector3.Distance(floor[i], floor[(i + 1) % floor.Length]);
                return sum;
            }
        }

        public bool Contains(Vector3 point, float tolerance = .015f)
        {
            if (!Finite(point) || floor == null || floor.Length < 3 || point.y < -tolerance || point.y > height + tolerance) return false;
            bool inside = false;
            var p = new Vector2(point.x, point.z);
            for (int i = 0, j = floor.Length - 1; i < floor.Length; j = i++)
            {
                var a = new Vector2(floor[j].x, floor[j].z); var b = new Vector2(floor[i].x, floor[i].z);
                if (DistanceToSegment(p, a, b) <= tolerance) return true;
                if ((a.y > p.y) != (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
            }
            return inside;
        }

        public float WallClearance(Vector3 point)
        {
            float distance = float.PositiveInfinity;
            var p = new Vector2(point.x, point.z);
            for (int i = 0; i < floor.Length; i++)
            {
                var a = floor[i]; var b = floor[(i + 1) % floor.Length];
                distance = Mathf.Min(distance, DistanceToSegment(p, new Vector2(a.x, a.z), new Vector2(b.x, b.z)));
            }
            return distance;
        }

        // Test edge crossings too: endpoint-only checks accept strokes through a concave room's missing corner.
        public bool ContainsSegment(Vector3 a, Vector3 b)
        {
            if (!Contains(a) || !Contains(b) || !Contains((a + b) * .5f)) return false;
            for (int i = 0; i < floor.Length; i++)
            {
                var c = floor[i]; var d = floor[(i + 1) % floor.Length];
                float abC = Cross(a, b, c), abD = Cross(a, b, d), cdA = Cross(c, d, a), cdB = Cross(c, d, b);
                if (abC * abD < -1e-8f && cdA * cdB < -1e-8f) return false;
            }
            return true;
        }

        static float Cross(Vector3 a, Vector3 b, Vector3 c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
        static float DistanceToSegment(Vector2 p, Vector2 a, Vector2 b)
        {
            Vector2 delta = b - a;
            float t = delta.sqrMagnitude < 1e-10f ? 0 : Mathf.Clamp01(Vector2.Dot(p - a, delta) / delta.sqrMagnitude);
            return Vector2.Distance(p, a + t * delta);
        }
        public static bool Finite(Vector3 p) => float.IsFinite(p.x) && float.IsFinite(p.y) && float.IsFinite(p.z);
    }

    public enum DrawingTool { Freehand, Box, Measure }

    [Serializable]
    public sealed class RoomDrawing
    {
        public DrawingTool tool;
        public Vector3[] points;
    }

    [Serializable]
    public sealed class RoomDocument
    {
        public int version = 1;
        public string roomId;
        public RoomGeometry geometry;
        public RoomDrawing[] drawings;
    }

    public static class DrawingGeometry
    {
        public const int MaxDrawings = 64, MaxPoints = 512;
        // A continuous walk over all 12 box edges; repeated edges avoid extra renderers.
        static readonly int[] BoxWalk = { 0, 1, 2, 3, 0, 4, 5, 1, 5, 6, 2, 6, 7, 3, 7, 4 };
        public static Vector3[] Box(Vector3 a, Vector3 b, float height)
        {
            var result = new Vector3[BoxWalk.Length];
            FillBox(a, b, height, result);
            return result;
        }
        public static void FillBox(Vector3 a, Vector3 b, float height, Vector3[] result)
        {
            float x0 = Mathf.Min(a.x, b.x), x1 = Mathf.Max(a.x, b.x), z0 = Mathf.Min(a.z, b.z), z1 = Mathf.Max(a.z, b.z);
            for (int i = 0; i < BoxWalk.Length; i++)
            {
                int corner = BoxWalk[i], baseCorner = corner % 4;
                result[i] = new Vector3(baseCorner == 1 || baseCorner == 2 ? x1 : x0, a.y + (corner >= 4 ? height : 0), baseCorner >= 2 ? z1 : z0);
            }
        }

        public static bool Valid(RoomGeometry room, Vector3[] points)
        {
            if (points == null || points.Length < 2 || points.Length > MaxPoints) return false;
            for (int i = 0; i < points.Length; i++)
                if (!room.Contains(points[i]) || (i > 0 && !room.ContainsSegment(points[i - 1], points[i]))) return false;
            return true;
        }
    }
}
