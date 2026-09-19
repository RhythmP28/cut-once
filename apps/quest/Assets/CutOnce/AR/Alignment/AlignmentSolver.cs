using UnityEngine;

namespace CutOnce.AR
{
    /// <summary>Model-to-world alignment (blueprint §5). Model points must already be in Unity space (X negated).</summary>
    public static class AlignmentSolver
    {
        /// <summary>
        /// Gravity-constrained fit from two points: yaw about +Y, then translation. In Unity, rotating about +Y by θ
        /// turns (0,0,1) into (sin θ, 0, cos θ), so a direction's heading atan2(x, z) grows by exactly θ.
        /// </summary>
        public static Pose SolveTwoPoint(Vector3 a1, Vector3 a2, Vector3 w1, Vector3 w2, out float baselineResidual, out float levelError)
        {
            Vector3 da = a2 - a1, dw = w2 - w1;
            float yawDeg = (Mathf.Atan2(dw.x, dw.z) - Mathf.Atan2(da.x, da.z)) * Mathf.Rad2Deg; // AngleAxis takes degrees
            var r = Quaternion.AngleAxis(yawDeg, Vector3.up);
            var t = 0.5f * ((w1 - r * a1) + (w2 - r * a2));
            baselineResidual = Mathf.Abs(dw.magnitude - da.magnitude); // headset scale is metric: catches a wrong sheet or print scale
            levelError = Mathf.Abs((w1.y - a1.y) - (w2.y - a2.y));     // only sees tilt along the m1–m2 line
            return new Pose(t, r);
        }

        /// <summary>Distance between where the pose puts a model point and where it was measured (the m3 check).</summary>
        public static float Residual(Pose p, Vector3 model, Vector3 world) => Vector3.Distance(p.position + p.rotation * model, world);

        /// <summary>The largest Residual over all markers. Blueprint §5: lock only below 4 mm.</summary>
        public static float WorstResidual(Pose p, Vector3[] model, Vector3[] world)
        {
            float worst = 0f;
            for (int i = 0; i < model.Length; i++) worst = Mathf.Max(worst, Residual(p, model[i], world[i]));
            return worst;
        }

        /// <summary>
        /// Full rigid fit for a tilted surface. zalo's solver keeps its rotation between calls and runs 9 more iterations
        /// per call, so one instance is called repeatedly on the same points. Starting from the two-point pose leaves it
        /// only a small correction. Checked numerically: a 5° tilt is under 0.3 mm after 2 calls and ~0 after 5, at any heading.
        /// From identity instead, one call is 760 mm off at a 135° heading and a 180° heading never converges (456 mm).
        /// A rigid fit always returns a pose, even when stickers m1 and m2 are swapped (729 mm off), so it reports its
        /// worst residual: reject the pose unless it is under 4 mm.
        /// </summary>
        public static Pose RefineThreePoint(Pose initial, Vector3[] model, Vector3[] world, out float worstResidual, int calls = 5)
        {
            var moved = new Vector3[model.Length];
            var refs = new Vector4[world.Length];
            for (int i = 0; i < model.Length; i++)
            {
                moved[i] = initial.position + initial.rotation * model[i];
                refs[i] = new Vector4(world[i].x, world[i].y, world[i].z, 1f); // w is the point's weight
            }
            var solver = new KabschSolver();
            Matrix4x4 delta = Matrix4x4.identity;
            for (int k = 0; k < calls; k++) delta = solver.SolveKabsch(moved, refs);
            var pose = new Pose(delta.MultiplyPoint3x4(initial.position), delta.rotation * initial.rotation);
            worstResidual = WorstResidual(pose, model, world);
            return pose;
        }
    }
}
