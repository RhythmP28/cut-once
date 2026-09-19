using System;
using UnityEngine;

namespace CutOnce.Copilot
{
    /// <summary>
    /// A part's box in JPEG pixels (top-left origin), computed with Meta's projection rather than our own camera maths.
    /// On device: worldToViewport = p => pca.WorldToViewportPoint(p, cachedPose), where cachedPose = pca.GetCameraPose()
    /// read in the same step as GetColors(); inFront = p => Vector3.Dot(p - cachedPose.position, cachedPose.forward) > 0.1f.
    /// </summary>
    public static class PartProjector
    {
        public static bool TryProject(Bounds world, Func<Vector3, Vector3> worldToViewport, Func<Vector3, bool> inFront,
                                      int width, int height, out Rect boxPx, out float inFrame)
        {
            boxPx = default;
            inFrame = 0f;
            Vector2 min = new(float.MaxValue, float.MaxValue), max = new(float.MinValue, float.MinValue);
            for (int i = 0; i < 8; i++)
            {
                var corner = world.center + Vector3.Scale(world.extents, new Vector3((i & 1) == 0 ? -1 : 1, (i & 2) == 0 ? -1 : 1, (i & 4) == 0 ? -1 : 1));
                if (!inFront(corner)) return false; // Meta's function does not reject points behind the camera
                Vector2 vp = worldToViewport(corner);
                min = Vector2.Min(min, vp);
                max = Vector2.Max(max, vp);
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
