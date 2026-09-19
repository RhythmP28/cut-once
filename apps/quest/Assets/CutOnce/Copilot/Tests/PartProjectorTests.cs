using NUnit.Framework;
using UnityEngine;
using CutOnce.Copilot;

public class PartProjectorTests
{
    // Stand-in camera: viewport = world x/y shifted by 0.5, so (0,0,z) is the image centre.
    static Vector3 Vp(Vector3 p) => new Vector3(p.x + 0.5f, p.y + 0.5f, p.z);
    static float Depth(Vector3 p) => p.z;
    static Vector3 Persp(Vector3 p) => new Vector3(0.5f + 0.5f * p.x / p.z, 0.5f + 0.5f * p.y / p.z, p.z); // 90° pinhole down +z

    [Test] public void CentredBoxMapsToTopLeftPixels()
    {
        Assert.IsTrue(PartProjector.TryProject(new Bounds(new Vector3(0, 0, 1), new Vector3(0.2f, 0.2f, 0.2f)), Vp, Depth, 1280, 960, out var r, out var f));
        Assert.AreEqual(512f, r.x, 0.5f); Assert.AreEqual(384f, r.y, 0.5f);
        Assert.AreEqual(256f, r.width, 0.5f); Assert.AreEqual(192f, r.height, 0.5f); Assert.AreEqual(1f, f, 1e-4f);
    }

    [Test] public void HigherInTheWorldIsSmallerYInThePhoto() // the vertical flip
    {
        PartProjector.TryProject(new Bounds(new Vector3(0, 0.3f, 1), Vector3.one * 0.1f), Vp, Depth, 1280, 960, out var top, out _);
        PartProjector.TryProject(new Bounds(new Vector3(0, -0.3f, 1), Vector3.one * 0.1f), Vp, Depth, 1280, 960, out var bottom, out _);
        Assert.Less(top.y, bottom.y);
    }

    [Test] public void BehindTheCameraIsRejected() =>
        Assert.IsFalse(PartProjector.TryProject(new Bounds(new Vector3(0, 0, -1), Vector3.one * 0.1f), Vp, Depth, 1280, 960, out _, out _));

    [Test] public void HalfOffScreenReportsInFrameAboutHalf()
    {
        PartProjector.TryProject(new Bounds(new Vector3(0.5f, 0, 1), new Vector3(0.2f, 0.2f, 0.2f)), Vp, Depth, 1280, 960, out var r, out var f);
        Assert.AreEqual(0.5f, f, 0.01f); Assert.LessOrEqual(r.xMax, 1280f);
    }

    [Test] public void TabletopRunningBehindTheCameraIsKeptAsTheBottomStrip() // numerically: (0, 750, 1280, 210)
    {
        var tabletop = new Bounds(new Vector3(0, -0.475f, 0.3f), new Vector3(1f, 0.05f, 1f)); // 0.2 m behind to 0.8 m ahead
        Assert.IsTrue(PartProjector.TryProject(tabletop, Persp, Depth, 1280, 960, out var r, out var f));
        Assert.AreEqual(0f, r.x, 0.5f); Assert.AreEqual(1280f, r.width, 0.5f);
        Assert.AreEqual(750f, r.y, 0.5f); Assert.AreEqual(960f, r.yMax, 0.5f);
        Assert.Greater(f, 0f);
    }

    class Part : IProjectablePart
    {
        public string PartId { get; set; }
        public string State { get; set; }
        public Bounds WorldBounds { get; set; }
    }

    [Test] public void ProjectKeepsOnlyPartsInFrameWithPixelBoxesAndNearFaceDistance()
    {
        var k = new CameraIntrinsics { width = 1280, height = 960, fx = 900, fy = 900, cx = 640, cy = 480 };
        var frame = new CameraFrame(new byte[] { 1 }, Vector3.zero, Quaternion.identity, k, System.DateTime.UtcNow,
            p => k.Pinhole(p, Vector3.zero, Quaternion.identity));
        var parts = new IProjectablePart[]
        {
            new Part { PartId = "part_ahead", State = "missing", WorldBounds = new Bounds(new Vector3(0, 0, 2), Vector3.one * 0.2f) },
            new Part { PartId = "part_behind", State = "built", WorldBounds = new Bounds(new Vector3(0, 0, -2), Vector3.one * 0.2f) },
        };
        var visible = PartProjector.Project(parts, frame);
        Assert.AreEqual(1, visible.Count);
        Assert.AreEqual("part_ahead", visible[0].PartId);
        Assert.AreEqual("missing", visible[0].State);
        Assert.AreEqual(640f, visible[0].X + visible[0].W / 2f, 0.5f);   // centred horizontally
        Assert.AreEqual(480f, visible[0].Y + visible[0].H / 2f, 0.5f);   // and vertically
        Assert.AreEqual(1.9f, visible[0].DistanceM, 1e-4f);              // to the box's near face
    }

    [Test] public void ProjectReturnsNothingWithoutAFrame() =>
        Assert.AreEqual(0, PartProjector.Project(new IProjectablePart[0], default).Count);
}
