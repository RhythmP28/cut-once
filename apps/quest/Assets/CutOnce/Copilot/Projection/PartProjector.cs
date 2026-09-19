using System;
using System.Collections.Generic;
using UnityEngine;

namespace CutOnce.Copilot
{
    /// <summary>One part's box in the captured JPEG (pixels, origin top-left): a VisiblePart for the server.</summary>
    public struct ProjectedPart
    {
        public string PartId, State;
        public float X, Y, W, H, InFrame, DistanceM;
    }

    /// <summary>
    /// A part's box in JPEG pixels (top-left origin), computed with Meta's projection rather than our own camera maths.
    /// On device: worldToViewport = p => pca.WorldToViewportPoint(p, cachedPose), where cachedPose = pca.GetCameraPose()
    /// read in the same step as GetColors(); depth = p => Vector3.Dot(p - cachedPose.position, cachedPose.forward).
    /// </summary>
    public static class PartProjector
    {
        const float Near = 0.1f; // metres; Meta's function does not reject points behind the camera, so we clip here

        /// <summary>Every part that lands in the frame, projected with the frame's own camera.</summary>
        public static List<ProjectedPart> Project(IReadOnlyList<IProjectablePart> parts, CameraFrame frame)
        {
            var visible = new List<ProjectedPart>();
            if (!frame.IsValid || frame.WorldToViewport == null || parts == null) return visible;
            Vector3 position = frame.Position, forward = frame.Rotation * Vector3.forward;
            Func<Vector3, float> depth = p => Vector3.Dot(p - position, forward);
            foreach (var part in parts)
            {
                if (!TryProject(part.WorldBounds, frame.WorldToViewport, depth, frame.Intrinsics.width, frame.Intrinsics.height, out Rect box, out float inFrame)) continue;
                visible.Add(new ProjectedPart
                {
                    PartId = part.PartId, State = part.State, X = box.x, Y = box.y, W = box.width, H = box.height, InFrame = inFrame,
                    DistanceM = Vector3.Distance(position, part.WorldBounds.ClosestPoint(position)),
                });
            }
            return visible;
        }

        public static bool TryProject(Bounds world, Func<Vector3, Vector3> worldToViewport, Func<Vector3, float> depth,
                                      int width, int height, out Rect boxPx, out float inFrame)
        {
            boxPx = default;
            inFrame = 0f;
            var corner = new Vector3[8];
            var d = new float[8];
            bool anyInFront = false;
            for (int i = 0; i < 8; i++)
            {
                corner[i] = world.center + Vector3.Scale(world.extents, new Vector3((i & 1) == 0 ? -1 : 1, (i & 2) == 0 ? -1 : 1, (i & 4) == 0 ? -1 : 1));
                d[i] = depth(corner[i]) - Near;
                anyInFront |= d[i] >= 0f;
            }
            if (!anyInFront) return false;

            // Project the part of the box in front of the near plane: its corners there, plus where its 12 edges cross the plane.
            // A tabletop that runs under the operator's feet stays in, as the bottom strip of the photo.
            Vector2 min = new(float.MaxValue, float.MaxValue), max = new(float.MinValue, float.MinValue);
            void Add(Vector3 p) { Vector2 vp = worldToViewport(p); min = Vector2.Min(min, vp); max = Vector2.Max(max, vp); }
            for (int i = 0; i < 8; i++)
            {
                if (d[i] >= 0f) Add(corner[i]);
                for (int bit = 1; bit < 8; bit <<= 1) // corners that differ in one bit share an edge; visit each edge once
                {
                    int j = i ^ bit;
                    if (j > i && (d[i] >= 0f) != (d[j] >= 0f)) Add(Vector3.Lerp(corner[i], corner[j], d[i] / (d[i] - d[j])));
                }
            }

            float full = (max.x - min.x) * (max.y - min.y);
            Vector2 cmin = Vector2.Max(min, Vector2.zero), cmax = Vector2.Min(max, Vector2.one);
            if (cmax.x <= cmin.x || cmax.y <= cmin.y || full <= 0f) return false;
            inFrame = (cmax.x - cmin.x) * (cmax.y - cmin.y) / full;
            // Viewport (0,0) is bottom-left; JPEG (0,0) is top-left.
            boxPx = new Rect(cmin.x * width, (1f - cmax.y) * height, (cmax.x - cmin.x) * width, (cmax.y - cmin.y) * height);
            return true;
        }
    }
}
