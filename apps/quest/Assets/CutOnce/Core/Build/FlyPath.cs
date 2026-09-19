namespace CutOnce.Core
{
    /// <summary>The Lego Movie moment's timing: each piece flies for 0.7 s, starting 0.3 s after the one before, over a raised arc.</summary>
    public static class FlyPath
    {
        public const double Seconds = 0.7, Stagger = 0.3;

        public static double Ease(double t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }

        /// <summary>Linear progress 0..1 of the piece at <paramref name="order"/>, <paramref name="elapsed"/> seconds after the start.</summary>
        public static double Progress(int order, double elapsed) { double t = (elapsed - order * Stagger) / Seconds; return t < 0 ? 0 : t > 1 ? 1 : t; }

        /// <summary>Height added at eased progress e on a flight of <paramref name="distance"/> metres: 0 at both ends, 15 cm plus a quarter of the distance mid-flight.</summary>
        public static double Lift(double e, double distance) => 4 * e * (1 - e) * (0.15 + 0.25 * distance);

        public static double TotalSeconds(int count) => count <= 0 ? 0 : (count - 1) * Stagger + Seconds;

        static readonly int[][] AxisOrders = { new[] { 0, 1, 2 }, new[] { 0, 2, 1 }, new[] { 1, 0, 2 }, new[] { 2, 1, 0 }, new[] { 1, 2, 0 }, new[] { 2, 0, 1 } };

        /// <summary>
        /// A build plan never rotates a box: the design reorders its size instead (standing a book up swaps x and y). For
        /// each axis of the design's box, this gives the axis of the real box with that length, so a flight can start
        /// lying exactly on the real object and turn on the way. The closest fit wins, and among equals the one that
        /// turns the fewest axes (a cube needs no turn).
        /// </summary>
        public static int[] MatchAxes(double[] designSize, double[] realSize)
        {
            if (designSize == null || realSize == null || designSize.Length != 3 || realSize.Length != 3) return new[] { 0, 1, 2 };
            int[] best = AxisOrders[0]; double bestError = double.MaxValue;
            foreach (var order in AxisOrders)                     // identity first, then single swaps, then the two cycles
            {
                double error = 0;
                for (int i = 0; i < 3; i++) error += System.Math.Abs(designSize[i] - realSize[order[i]]);
                if (error < bestError - 1e-9) { best = order; bestError = error; }
            }
            return (int[])best.Clone();
        }
    }
}
