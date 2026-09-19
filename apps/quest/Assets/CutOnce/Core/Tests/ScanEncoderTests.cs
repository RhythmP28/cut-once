using NUnit.Framework;

namespace CutOnce.Core.Tests
{
    public class ScanEncoderTests
    {
        [Test]
        public void CellsMapToPixelCentresRowMajorFromTheTopLeft()
        {
            ScanEncoder.CellPixel(0, 128, 96, 1280, 960, out var u0, out var v0);
            ScanEncoder.CellPixel(128 + 5, 128, 96, 1280, 960, out var u1, out var v1);
            Assert.That(new[] { u0, v0, u1, v1 }, Is.EqualTo(new[] { 5.0, 5.0, 55.0, 15.0 }));
        }

        [Test]
        public void ACellsRayLeavesTheCameraThroughItsPixel()
        {
            // The copilot's pinhole convention (CameraIntrinsics.Pinhole): pixels from the top-left, the camera looks down +Z with +Y up,
            // so column = cx + fx·x/z and row = cy - fy·y/z. The top-left cell of a 2 × 2 grid has its centre at pixel (320, 240).
            ScanEncoder.CellDirection(0, 2, 2, 1280, 960, 640, 600, 650, 470, out var x, out var y, out var z);
            Assert.That(new[] { 650 + 640 * x / z, 470 - 600 * y / z }, Is.EqualTo(new[] { 320.0, 240.0 }).Within(1e-9));
            Assert.That(new[] { x < 0, y > 0, z > 0 }, Is.All.True, "left of and above the principal point, in front of the camera");
            Assert.That(x * x + y * y + z * z, Is.EqualTo(1).Within(1e-12), "a unit vector");
        }

        [Test]
        public void HitsAreMirroredIntoThePlanFrameInMillimetresAndMissesStayZero()
        {
            var e = new ScanEncoder(2, 1);
            e.HitUnity(1, 0.25, 0.74, 1.5);
            Assert.That(e.PointsMm, Is.EqualTo(new[] { 0, 0, 0, -250, 740, 1500 }));
            Assert.That(e.HitMask, Is.EqualTo("01"));
            Assert.That(e.Hits, Is.EqualTo(1));
            Assert.That(ScanEncoder.PlanFromUnity(0.25, 1.6, -1), Is.EqualTo(new[] { -0.25, 1.6, -1.0 }), "the camera's pose is mirrored the same way");
        }
    }
}
