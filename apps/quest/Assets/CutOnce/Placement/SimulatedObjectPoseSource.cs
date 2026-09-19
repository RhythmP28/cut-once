using System;
using UnityEngine;

namespace CutOnce.Placement
{
    /// <summary>Fixture tracking only. Replace with an IObjectPoseSource detector adapter later.</summary>
    public sealed class SimulatedObjectPoseSource : MonoBehaviour, IObjectPoseSource
    {
        [Serializable]
        public sealed class Entry
        {
            public string objectId;
            public Transform objectTransform;
            public bool tracked = true;
            [Range(0, 1)] public float confidence = 1;
        }
        public Entry[] objects = Array.Empty<Entry>();

        public bool TryGetObservation(string objectId, out ObjectObservation observation)
        {
            observation = default;
            Entry match = null;
            for (int i = 0; i < objects.Length; i++)
            {
                var entry = objects[i];
                if (entry == null || entry.objectId != objectId) continue;
                if (match != null) return false; // Ambiguous identity must never confirm placement.
                match = entry;
            }
            if (match == null || !match.tracked || match.objectTransform == null ||
                !match.objectTransform.gameObject.activeInHierarchy) return false;
            observation = new ObjectObservation(objectId,
                new Pose(match.objectTransform.position, match.objectTransform.rotation),
                match.confidence, Time.unscaledTimeAsDouble);
            return true;
        }
    }
}
