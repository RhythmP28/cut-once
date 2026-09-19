using UnityEngine;

namespace CutOnce.AR
{
    /// <summary>The geometry of placing a hologram by pointing. Pure functions, so the Editor tests cover them without a headset.</summary>
    public static class PlacementMath
    {
        /// <summary>
        /// The pose of AssemblyRoot that stands the model on a surface point: the centre of the model's footprint goes
        /// to the point, its lowest face rests on the surface (plans may extend below y = 0: the desk's tabletop
        /// does), and it is turned about the vertical by yawDegrees. The model stays level: gravity is the one
        /// alignment constraint we get for free.
        /// </summary>
        public static Pose StandOn(Vector3 surfacePoint, float yawDegrees, Bounds modelBounds)
        {
            var rotation = Quaternion.AngleAxis(yawDegrees, Vector3.up);
            var pivot = new Vector3(modelBounds.center.x, modelBounds.min.y, modelBounds.center.z);
            return new Pose(surfacePoint - rotation * pivot, rotation);
        }

        /// <summary>Where a ray meets the horizontal plane at the given height. False when it points away or runs parallel.</summary>
        public static bool HitHorizontalPlane(Ray ray, float height, float maxDistance, out Vector3 point)
        {
            point = default;
            if (Mathf.Abs(ray.direction.y) < 1e-4f) return false;
            float t = (height - ray.origin.y) / ray.direction.y;
            if (t <= 0f || t > maxDistance) return false;
            point = ray.origin + ray.direction * t;
            return true;
        }

        /// <summary>Yaw to face a viewer from a position, so a freshly placed model or panel turns toward the operator.</summary>
        public static float YawToward(Vector3 from, Vector3 viewer)
        {
            Vector3 d = viewer - from; d.y = 0f;
            return d.sqrMagnitude < 1e-6f ? 0f : Mathf.Atan2(d.x, d.z) * Mathf.Rad2Deg;
        }

        /// <summary>A nudge: slide in the model's own horizontal frame, lift, and turn about the model's footprint centre.</summary>
        public static Pose Nudge(Pose pose, Vector3 slideLocal, float yawDeltaDegrees, Vector3 pivotLocal)
        {
            var turn = Quaternion.AngleAxis(yawDeltaDegrees, Vector3.up);
            Vector3 pivotWorld = pose.position + pose.rotation * pivotLocal;
            var rotation = turn * pose.rotation;
            Vector3 position = pivotWorld - rotation * pivotLocal + rotation * slideLocal;
            return new Pose(position, rotation);
        }
    }
}
