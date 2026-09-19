using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace CutOnce.AR
{
    /// <summary>
    /// Collects distinct QR centre measurements. MRUK refreshes QR poses at about 1 Hz (MRUK.Trackers.cs) and has no
    /// update event, so a reading identical to the last one is the same measurement and is skipped.
    /// </summary>
    public sealed class MarkerSampler
    {
        const float SameMeasurement = 1e-5f; // metres: real re-measurements of a still marker differ by more than this
        readonly int _needed;
        readonly List<Vector3> _samples = new();
        Vector3? _last;

        public MarkerSampler(int needed = 5) { _needed = needed; }

        public int Count => _samples.Count;
        public bool IsReady => _samples.Count >= _needed;

        public bool Offer(Vector3 centre, bool isTracked)
        {
            if (!isTracked || IsReady) return false;
            if (_last.HasValue && (centre - _last.Value).sqrMagnitude < SameMeasurement * SameMeasurement) return false;
            _last = centre;
            _samples.Add(centre);
            return true;
        }

        /// <summary>Per-axis median: with 5 samples, up to 2 bad reads cannot move it.</summary>
        public Vector3 Median()
        {
            float M(IEnumerable<float> values)
            {
                var a = values.OrderBy(x => x).ToArray();
                return a.Length % 2 == 1 ? a[a.Length / 2] : 0.5f * (a[a.Length / 2 - 1] + a[a.Length / 2]);
            }
            return new Vector3(M(_samples.Select(p => p.x)), M(_samples.Select(p => p.y)), M(_samples.Select(p => p.z)));
        }

        public void Reset() { _samples.Clear(); _last = null; }
    }
}
