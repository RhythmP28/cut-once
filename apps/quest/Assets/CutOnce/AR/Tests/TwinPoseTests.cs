using System.Collections.Generic;
using System.Linq;
using CutOnce.Core;
using NUnit.Framework;
using UnityEngine;

namespace CutOnce.AR.Tests
{
    /// <summary>
    /// The fly-together starts each design part lying exactly on its real object. A build plan never rotates a part, it
    /// reorders a box's size, so the start turn has to put each design axis back on the real axis of that length, on top
    /// of the object's own yaw. Every number here is worked out by hand in Unity's frame, not through ModelSpace.
    /// </summary>
    public class TwinPoseTests
    {
        const float Tol = 1e-4f;
        static readonly ShapeDto FlatBook = new ShapeDto { type = "box", size = new[] { 0.30, 0.02, 0.20 } };        // lying flat: 30 long, 2 high, 20 deep
        static readonly ShapeDto UprightBook = new ShapeDto { type = "box", size = new[] { 0.02, 0.30, 0.20 } };     // the design stands it on its short edge

        static IEnumerable<Vector3> Corners(Vector3 half) =>
            from x in new[] { -1f, 1f } from y in new[] { -1f, 1f } from z in new[] { -1f, 1f } select new Vector3(x * half.x, y * half.y, z * half.z);

        [Test]
        public void AnObjectsYawIsARightHandedTurnSoItTurnsTheOtherWayInUnity()
        {
            // yaw_deg = 30 takes the object's +X to (cos 30°, -sin 30°) in the plan's (x, z). Mirroring x gives (-0.866, 0, -0.5)
            // in Unity: the same line as (0.866, 0, 0.5), which is where a Unity yaw of -30° puts +X.
            var long_side = TwinPose.Rotation(30) * Vector3.right;
            Assert.That(Vector3.Distance(long_side, new Vector3(0.8660254f, 0f, 0.5f)), Is.LessThan(Tol), $"got {long_side:F4}");
            Assert.That(Vector3.Distance(TwinPose.Rotation(30) * Vector3.up, Vector3.up), Is.LessThan(Tol), "objects stay level");
        }

        [Test]
        public void ABoxTheDesignStandsUprightStartsLyingExactlyOnTheRealOne()
        {
            var start = TwinPose.StartRotation(30, FlatBook, UprightBook);

            // A known corner of the design's box, (+1 cm, +15 cm, +10 cm) from its centre. Its 30 cm side (design +Y) has to lie
            // along the real book's 30 cm side (its own +X), its 2 cm side (design +X) along the real thickness (-Y, by the
            // turn's handedness), its 20 cm side along the real depth: (0.15, -0.01, 0.10) in the book's own frame, which the
            // book's yaw of -30° in Unity carries to 0.15·(0.866, 0, 0.5) - 0.01·up + 0.10·(-0.5, 0, 0.866).
            var corner = start * new Vector3(0.01f, 0.15f, 0.10f);
            Assert.That(Vector3.Distance(corner, new Vector3(0.0799038f, -0.01f, 0.1616025f)), Is.LessThan(Tol), $"got {corner:F5}");

            // And as a whole: the eight corners of the design's box land on the eight corners of the real one. With three
            // different sizes no wrong pairing of axes can do that.
            var real = Corners(new Vector3(0.15f, 0.01f, 0.10f)).Select(c => TwinPose.Rotation(30) * c).ToList();
            foreach (var c in Corners(new Vector3(0.01f, 0.15f, 0.10f)).Select(c => start * c))
                Assert.That(real.Min(r => Vector3.Distance(r, c)), Is.LessThan(Tol), $"a corner of the design's box floats free of the real one at {c:F4}");
        }

        [Test]
        public void ABoxUsedAsItLiesOnlyTakesTheObjectsYaw()
        {
            Assert.That(Quaternion.Angle(TwinPose.StartRotation(30, FlatBook, FlatBook), TwinPose.Rotation(30)), Is.LessThan(0.01f));
        }

        [Test]
        public void ACanFoundOnItsSideStartsAlongTheRealCansAxis()
        {
            // The cylinder mesh runs along its own +Y. A can lying along its +X, yawed 90°, points along the room's z.
            var lying = new ShapeDto { type = "cylinder", axis = "x", diameter = 0.066, length = 0.157 };
            var upright = new ShapeDto { type = "cylinder", axis = "y", diameter = 0.066, length = 0.157 };
            var axis = TwinPose.StartRotation(90, lying, upright) * Vector3.up;
            Assert.That(Mathf.Abs(Vector3.Dot(axis, Vector3.forward)), Is.EqualTo(1f).Within(Tol), $"got {axis:F4}");
            Assert.That(Quaternion.Angle(TwinPose.StartRotation(90, upright, upright), TwinPose.Rotation(90)), Is.LessThan(0.01f), "an upright can only takes its yaw");
        }

        [Test]
        public void AShapeThatCannotBeMatchedOnlyTakesTheObjectsYaw()
        {
            Assert.That(Quaternion.Angle(TwinPose.StartRotation(30, FlatBook, null), TwinPose.Rotation(30)), Is.LessThan(0.01f));
            Assert.That(Quaternion.Angle(TwinPose.StartRotation(30, FlatBook, new ShapeDto { type = "cylinder", axis = "y", diameter = 0.1, length = 0.1 }), TwinPose.Rotation(30)), Is.LessThan(0.01f));
        }
    }
}
