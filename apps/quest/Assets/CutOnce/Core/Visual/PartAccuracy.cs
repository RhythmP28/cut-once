using System.Globalization;

namespace CutOnce.Core
{
    /// <summary>
    /// Where a part's numbers came from and how far off they can be, read from Part.external_ids
    /// ("source", "tolerance_m"). A polished hologram implies precision, so parts that were estimated draw
    /// dashed and the copilot can say "about". A part with no tags is a designed part: exact by definition.
    /// </summary>
    public readonly struct PartAccuracy
    {
        /// <summary>Above this, a part is drawn as approximate.</summary>
        public const double ApproximateAboveM = 0.05;

        public readonly string Source;          // design | drawings | lidar | photos | measured | assumed | inferred
        public readonly double? ToleranceM;     // null when unknown or untagged

        PartAccuracy(string source, double? toleranceM) { Source = source; ToleranceM = toleranceM; }

        public bool IsApproximate =>
            Source == "assumed" || Source == "inferred" || (Source != "design" && Source != null && !ToleranceM.HasValue) ||
            (ToleranceM.HasValue && ToleranceM.Value > ApproximateAboveM);

        public string Label =>
            Source == null ? "as designed"
            : ToleranceM.HasValue ? $"{Source}, ±{(ToleranceM.Value < 0.1 ? (ToleranceM.Value * 1000).ToString("0", CultureInfo.InvariantCulture) + " mm" : ToleranceM.Value.ToString("0.0#", CultureInfo.InvariantCulture) + " m")}"
            : $"{Source}, tolerance unknown";

        public static PartAccuracy Of(PartDto part)
        {
            var ids = part?.external_ids;
            if (ids == null || !ids.TryGetValue("source", out var source)) return new PartAccuracy(null, null);
            double? tolerance = ids.TryGetValue("tolerance_m", out var t) &&
                                double.TryParse(t, NumberStyles.Float, CultureInfo.InvariantCulture, out var v) ? v : (double?)null;
            return new PartAccuracy(source, tolerance);
        }
    }
}
