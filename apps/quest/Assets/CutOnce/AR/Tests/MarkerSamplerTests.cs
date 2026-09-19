using NUnit.Framework;
using UnityEngine;
using CutOnce.AR;

public class MarkerSamplerTests
{
    [Test] public void RepeatedPoseCountsOnce()
    {
        var s = new MarkerSampler(5);
        for (int i = 0; i < 70; i++) s.Offer(new Vector3(0.2f, 0, 0.53f), true); // ~70 frames of one 1 Hz measurement
        Assert.AreEqual(1, s.Count);
    }

    [Test] public void UntrackedReadsAreIgnored()
    {
        var s = new MarkerSampler(5);
        Assert.IsFalse(s.Offer(Vector3.one, false)); Assert.AreEqual(0, s.Count);
    }

    [Test] public void MedianRejectsOneBadRead()
    {
        var s = new MarkerSampler(5);
        foreach (var x in new[] { 0.200f, 0.201f, 0.199f, 0.200f, 0.260f }) s.Offer(new Vector3(x, 0, 0.53f), true);
        Assert.IsTrue(s.IsReady); Assert.AreEqual(0.200f, s.Median().x, 0.0005f);
    }
}
