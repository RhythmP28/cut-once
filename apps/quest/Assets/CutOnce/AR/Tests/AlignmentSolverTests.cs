using NUnit.Framework;
using UnityEngine;
using CutOnce.AR;

public class AlignmentSolverTests
{
    static readonly Vector3 A1 = new(-0.2f, 0, 0.53f), A2 = new(-0.8f, 0, 0.53f), A3 = new(-0.19f, 0, 0.08f);
    static Vector3 Apply(Pose p, Vector3 a) => p.position + p.rotation * a;
    static Pose Tilted(float deg) => new Pose(new Vector3(1.2f, 0.74f, -2.0f), Quaternion.AngleAxis(37f, Vector3.up) * Quaternion.AngleAxis(deg, Vector3.right));

    [Test] public void RecoversKnownYawAndTranslation()
    {
        var truth = Tilted(0f);
        var p = AlignmentSolver.SolveTwoPoint(A1, A2, Apply(truth, A1), Apply(truth, A2), out var baseline, out var level);
        Assert.Less(Vector3.Distance(Apply(p, A3), Apply(truth, A3)), 0.0005f);
        Assert.Less(baseline, 1e-4f); Assert.Less(level, 1e-4f);
    }

    [Test] public void ThirdMarkerCatchesATilt() // numerically: a 2° tilt leaves 15.7 mm at m3
    {
        var tilted = Tilted(2f);
        var p = AlignmentSolver.SolveTwoPoint(A1, A2, Apply(tilted, A1), Apply(tilted, A2), out _, out _);
        Assert.Greater(AlignmentSolver.Residual(p, A3, Apply(tilted, A3)), 0.004f); // > 4 mm → switch to the three-point fit
    }

    [Test] public void ThreePointRefineFixesTheTilt()
    {
        var tilted = Tilted(5f);
        var model = new[] { A1, A2, A3 };
        var world = new[] { Apply(tilted, A1), Apply(tilted, A2), Apply(tilted, A3) };
        var p = AlignmentSolver.RefineThreePoint(AlignmentSolver.SolveTwoPoint(A1, A2, world[0], world[1], out _, out _), model, world);
        for (int i = 0; i < 3; i++) Assert.Less(Vector3.Distance(Apply(p, model[i]), world[i]), 0.001f);
    }
}
