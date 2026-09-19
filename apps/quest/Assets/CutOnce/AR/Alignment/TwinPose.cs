using System;
using CutOnce.Core;
using UnityEngine;

namespace CutOnce.AR
{
    /// <summary>
    /// How a real object (a twin) is turned in Unity, and how a design part has to be turned to lie exactly on it. Here
    /// rather than beside the overlay that uses it, so the EditMode tests can hold the numbers to hand-worked ones.
    /// </summary>
    public static class TwinPose
    {
        /// <summary>yaw_deg as the plan's quaternion: a right-handed turn about +Y, taking the object's +X onto its long side.</summary>
        public static double[] YawQuat(double yawDeg) { double h = yawDeg * Math.PI / 360.0; return new[] { 0.0, Math.Sin(h), 0.0, Math.Cos(h) }; }

        /// <summary>The object's turn in Unity. The mirror turns it the other way: a yaw of 30° is a Unity yaw of -30°.</summary>
        public static Quaternion Rotation(double yawDeg) => ModelSpace.Rotation(YawQuat(yawDeg));

        /// <summary>
        /// The rotation a design part's transform starts a flight with, so its mesh lies exactly on the real object. A
        /// build plan never rotates a part: it reorders a box's size (a book stood upright swaps x and y) and names a
        /// cylinder's axis. So this is the object's yaw times the turn that puts each of the design's axes back on the
        /// real axis of that length (FlyPath.MatchAxes), or the cylinder mesh's +Y on the real can's axis. With nothing to
        /// match (no shape, or a box against a cylinder) it is the yaw alone.
        /// </summary>
        public static Quaternion StartRotation(double yawDeg, ShapeDto real, ShapeDto design)
        {
            var yaw = Rotation(yawDeg);
            if (real == null || design == null || design.type != real.type) return yaw;
            if (real.type == "cylinder") return yaw * ModelSpace.AxisFromY(real.axis);      // the mesh runs along its own +Y
            if (real.type != "box") return yaw;
            var order = FlyPath.MatchAxes(design.size, real.size);
            return yaw * Quaternion.LookRotation(Axis(order[2]), Axis(order[1]));           // x follows: a box looks the same either way round
        }

        static Vector3 Axis(int i) => i == 0 ? Vector3.right : i == 1 ? Vector3.up : Vector3.forward;
    }
}
