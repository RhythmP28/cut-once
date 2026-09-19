using System.Collections.Generic;
using UnityEngine;

namespace CutOnce.Copilot.Projection
{
    /// <summary>One part's box in the frame, in the exact shape the server's `visible_parts` expects.</summary>
    public struct ProjectedPart
    {
        public string PartId;
        public string State;
        public float X, Y, W, H;   // pixels, origin top-left
        public float InFrame;      // 0..1, how much of the box landed inside the image
        public float DistanceM;
    }

    /// <summary>
    /// Projects each part's world bounds into a captured frame so the server can tie pixels to part ids.
    /// Section 10: the headset works this out deterministically, so the model never has to guess which
    /// box is which part.
    ///
    /// Convention: Unity is left-handed with the camera looking down its local +Z; image pixels have
    /// their origin at the top-left with y growing downward, which is why the vertical term is negated.
    /// Accuracy here rides entirely on A1's alignment (G4) — a 10 mm alignment error is a visible box shift.
    /// </summary>
    public static class PartProjector
    {
        private const float NearPlaneM = 0.05f;
        /// <summary>Below this the box is too clipped to be worth sending; the server would answer `unsure` anyway.</summary>
        public const float MinInFrame = 0.15f;

        public static bool TryProject(Bounds worldBounds, Vector3 camPos, Quaternion camRot, CameraIntrinsics k, out ProjectedPart box)
        {
            box = default;
            Quaternion inverse = Quaternion.Inverse(camRot);
            Vector3 c = worldBounds.center;
            Vector3 e = worldBounds.extents;

            float minX = float.MaxValue, minY = float.MaxValue, maxX = float.MinValue, maxY = float.MinValue;
            float nearest = float.MaxValue;
            int infront = 0;

            for (int i = 0; i < 8; i++)
            {
                Vector3 corner = c + new Vector3(
                    (i & 1) == 0 ? -e.x : e.x,
                    (i & 2) == 0 ? -e.y : e.y,
                    (i & 4) == 0 ? -e.z : e.z);
                Vector3 local = inverse * (corner - camPos);
                if (local.z <= NearPlaneM) continue;   // behind the camera or on top of the lens
                infront++;
                nearest = Mathf.Min(nearest, local.z);

                float u = k.fx * (local.x / local.z) + k.cx;
                float v = k.cy - k.fy * (local.y / local.z);
                minX = Mathf.Min(minX, u); maxX = Mathf.Max(maxX, u);
                minY = Mathf.Min(minY, v); maxY = Mathf.Max(maxY, v);
            }

            // A partly-behind box has a meaningless projection, so it is dropped rather than guessed at.
            if (infront < 8) return false;

            float fullArea = Mathf.Max(1f, (maxX - minX) * (maxY - minY));
            float cx0 = Mathf.Clamp(minX, 0, k.width);
            float cy0 = Mathf.Clamp(minY, 0, k.height);
            float cx1 = Mathf.Clamp(maxX, 0, k.width);
            float cy1 = Mathf.Clamp(maxY, 0, k.height);
            float clippedArea = Mathf.Max(0f, cx1 - cx0) * Mathf.Max(0f, cy1 - cy0);
            float inFrame = Mathf.Clamp01(clippedArea / fullArea);
            if (inFrame < MinInFrame) return false;

            box = new ProjectedPart
            {
                X = cx0, Y = cy0, W = Mathf.Max(1f, cx1 - cx0), H = Mathf.Max(1f, cy1 - cy0),
                InFrame = inFrame, DistanceM = nearest,
            };
            return true;
        }

        /// <summary>Projects every part, nearest last, capped so one query never carries a hundred boxes.</summary>
        public static List<ProjectedPart> Project(IReadOnlyList<IProjectablePart> parts, CameraFrame frame, int max = 24)
        {
            var found = new List<ProjectedPart>();
            foreach (var part in parts)
            {
                if (!TryProject(part.WorldBounds, frame.Position, frame.Rotation, frame.Intrinsics, out var box)) continue;
                box.PartId = part.PartId;
                box.State = part.State;
                found.Add(box);
            }
            found.Sort((a, b) => a.DistanceM.CompareTo(b.DistanceM));
            if (found.Count > max) found.RemoveRange(max, found.Count - max);
            return found;
        }
    }
}
