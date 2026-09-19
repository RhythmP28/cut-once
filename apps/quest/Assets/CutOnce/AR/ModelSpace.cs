using UnityEngine;

namespace CutOnce.AR
{
    /// <summary>
    /// The one place where plan coordinates become Unity coordinates. Plans are right-handed, +Y up, metres;
    /// Unity is left-handed. We mirror X (the same convention glTFast uses, and the one AlignmentSolver expects:
    /// "model points must already be in Unity space"). Everything under AssemblyRoot is in this mirrored model
    /// space; AssemblyRoot's own pose is the alignment.
    /// </summary>
    public static class ModelSpace
    {
        public static Vector3 Point(double[] p) => new Vector3(-(float)p[0], (float)p[1], (float)p[2]);

        /// <summary>Extents have no sign, so a size is unchanged by the mirror.</summary>
        public static Vector3 Size(double[] s) => new Vector3((float)s[0], (float)s[1], (float)s[2]);

        /// <summary>Mirroring X turns a rotation (x, y, z, w) into (x, -y, -z, w).</summary>
        public static Quaternion Rotation(double[] q) =>
            q == null || q.Length != 4 ? Quaternion.identity : new Quaternion((float)q[0], -(float)q[1], -(float)q[2], (float)q[3]);

        /// <summary>Rotation that takes the mesh's long axis (+Y) to the plan's axis letter. A mirror leaves an axis line unchanged.</summary>
        public static Quaternion AxisFromY(string axis) =>
            axis == "x" ? Quaternion.FromToRotation(Vector3.up, Vector3.right)
            : axis == "z" ? Quaternion.FromToRotation(Vector3.up, Vector3.forward)
            : Quaternion.identity;
    }
}
