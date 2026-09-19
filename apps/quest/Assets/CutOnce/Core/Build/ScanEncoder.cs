using System;

namespace CutOnce.Core
{
    /// <summary>
    /// One scan's grid: a point or a miss per cell, row-major from the photo's top-left, so every point knows its pixel.
    /// Points arrive in Unity's left-handed world and are stored mirrored into the plan's right-handed frame (x → -x), in mm.
    /// </summary>
    public sealed class ScanEncoder
    {
        public readonly int Cols, Rows;
        readonly int[] _mm;
        readonly char[] _hit;
        public int Hits { get; private set; }
        public int Count => Cols * Rows;

        public ScanEncoder(int cols, int rows)
        {
            Cols = cols; Rows = rows;
            _mm = new int[cols * rows * 3];
            _hit = new char[cols * rows];
            for (int i = 0; i < _hit.Length; i++) _hit[i] = '0';
        }

        /// <summary>The photo pixel (origin top-left) at the centre of cell <paramref name="index"/>.</summary>
        public static void CellPixel(int index, int cols, int rows, int width, int height, out double u, out double v)
        {
            int c = index % cols, r = index / cols;
            u = (c + 0.5) * width / cols;
            v = (r + 0.5) * height / rows;
        }

        /// <summary>
        /// The unit direction, in the camera's own frame (+X right, +Y up, +Z forward: Unity's), of the ray through the centre
        /// of cell <paramref name="index"/>. Intrinsics are in photo pixels from the top-left, the copilot's convention
        /// (CameraIntrinsics.Pinhole: column = cx + fx·x/z, row = cy - fy·y/z), so image rows run down while +Y runs up.
        /// </summary>
        public static void CellDirection(int index, int cols, int rows, int width, int height, double fx, double fy, double cx, double cy,
                                         out double x, out double y, out double z)
        {
            CellPixel(index, cols, rows, width, height, out double u, out double v);
            x = (u - cx) / fx; y = -(v - cy) / fy;
            double length = Math.Sqrt(x * x + y * y + 1);
            x /= length; y /= length; z = 1 / length;
        }

        public static double[] PlanFromUnity(double x, double y, double z) => new[] { -x, y, z };

        public void HitUnity(int index, double x, double y, double z)
        {
            _mm[3 * index] = (int)Math.Round(-x * 1000);
            _mm[3 * index + 1] = (int)Math.Round(y * 1000);
            _mm[3 * index + 2] = (int)Math.Round(z * 1000);
            if (_hit[index] != '1') Hits++;
            _hit[index] = '1';
        }

        public int[] PointsMm => _mm;
        public string HitMask => new string(_hit);
    }
}
