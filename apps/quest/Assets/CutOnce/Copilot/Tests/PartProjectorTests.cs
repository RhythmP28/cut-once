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
}
