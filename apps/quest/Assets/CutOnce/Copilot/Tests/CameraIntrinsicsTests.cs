using NUnit.Framework;
using UnityEngine;
using CutOnce.Copilot;

public class CameraIntrinsicsTests
{
    static readonly CameraIntrinsics K = new CameraIntrinsics { width = 1280, height = 960, fx = 900, fy = 900, cx = 640, cy = 480 };

    [Test] public void PinholeStraightAheadIsTheViewportCentre()
    {
        var v = K.Pinhole(new Vector3(0, 0, 2), Vector3.zero, Quaternion.identity);
        Assert.AreEqual(0.5f, v.x, 1e-5f); Assert.AreEqual(0.5f, v.y, 1e-5f); Assert.AreEqual(2f, v.z, 1e-5f);
    }

    [Test] public void PinholeUpIsUpAndRightIsRight() // viewport (0,0) is bottom-left, like Meta's
    {
        Assert.Greater(K.Pinhole(new Vector3(0, 0.5f, 2), Vector3.zero, Quaternion.identity).y, 0.5f);
        Assert.Greater(K.Pinhole(new Vector3(0.5f, 0, 2), Vector3.zero, Quaternion.identity).x, 0.5f);
    }

    // Meta's WorldToViewportPoint (MRUK 205, PassthroughCameraAccess.cs), copied as the reference:
    // sensor-pixel intrinsics, origin bottom-left, a centred crop of the sensor scaled to the current resolution.
    static Vector2 MetaViewport(Vector3 c, Vector2 f, Vector2 pp, Vector2Int sensorRes, Vector2Int currentRes)
    {
        var sensorPoint = new Vector2(c.x / c.z * f.x + pp.x, c.y / c.z * f.y + pp.y);
        Vector2 sensor = sensorRes, current = currentRes;
        Vector2 s = current / sensor;
        s /= Mathf.Max(s.x, s.y);
        var crop = new Rect(sensor.x * (1f - s.x) * 0.5f, sensor.y * (1f - s.y) * 0.5f, sensor.x * s.x, sensor.y * s.y);
        return new Vector2((sensorPoint.x - crop.x) / crop.width, (sensorPoint.y - crop.y) / crop.height);
    }

    [TestCase(1280, 1280, 1280, 960)]
    [TestCase(1280, 960, 1280, 960)]
    [TestCase(1280, 1280, 800, 600)]
    public void FromMetaMatchesMetasOwnProjection(int sensorW, int sensorH, int imageW, int imageH)
    {
        var f = new Vector2(870f, 868f);
        var pp = new Vector2(sensorW * 0.51f, sensorH * 0.48f);
        var sensorRes = new Vector2Int(sensorW, sensorH);
        var imageRes = new Vector2Int(imageW, imageH);
        var k = CameraIntrinsics.FromMeta(f, pp, sensorRes, imageRes);
        foreach (var p in new[] { new Vector3(0.1f, -0.2f, 1.5f), new Vector3(-0.4f, 0.3f, 2f), new Vector3(0f, 0f, 1f) })
        {
            Vector2 expected = MetaViewport(p, f, pp, sensorRes, imageRes);
            Vector3 actual = k.Pinhole(p, Vector3.zero, Quaternion.identity);
            Assert.AreEqual(expected.x, actual.x, 1e-4f);
            Assert.AreEqual(expected.y, actual.y, 1e-4f);
        }
    }
}
