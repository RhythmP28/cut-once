using System.Collections.Generic;
using UnityEngine;

namespace CutOnce.Placement
{
    /// <summary>
    /// Integration entry point for detection. Submit on Unity's main thread, after converting coordinates
    /// and capture timestamps to Unity world space and Time.unscaledTimeAsDouble's clock.
    /// Rejected/absent observations expire in PlacementTracker; never restamp an old detection each frame.
    /// </summary>
    public sealed class BufferedObjectPoseSource : MonoBehaviour, IObjectPoseSource
    {
        const int Capacity = 256;
        readonly Dictionary<string, ObjectObservation> observations = new Dictionary<string, ObjectObservation>();

        public bool Submit(ObjectObservation observation)
        {
            if (string.IsNullOrWhiteSpace(observation.ObjectId) || double.IsNaN(observation.ObservedAt) ||
                double.IsInfinity(observation.ObservedAt)) return false;
            if (observations.TryGetValue(observation.ObjectId, out var previous))
            {
                if (observation.ObservedAt <= previous.ObservedAt) return false;
            }
            else if (observations.Count >= Capacity) return false;
            observations[observation.ObjectId] = observation;
            return true;
        }
        public bool TryGetObservation(string objectId, out ObjectObservation observation) =>
            observations.TryGetValue(objectId, out observation);
        public void Forget(string objectId) => observations.Remove(objectId);
        public void Clear() => observations.Clear();
        void OnDisable() => Clear();
    }
}
