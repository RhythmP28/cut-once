using System;
using UnityEngine;

namespace CutOnce.Placement
{
    /// <summary>Connects a live pose source and target to the detector-independent state machine.</summary>
    public sealed class PlacementBinding : MonoBehaviour
    {
        public string objectId;
        [Tooltip("A MonoBehaviour implementing IObjectPoseSource.")]
        public MonoBehaviour poseSource;
        public Transform target;
        public PlacementSettings settings = new PlacementSettings();
        public PlacementState State => tracker == null ? PlacementState.TrackingLost : tracker.State;
        public float PositionError => tracker == null ? float.PositiveInfinity : tracker.PositionError;
        public float RotationError => tracker == null ? float.PositiveInfinity : tracker.RotationError;
        public float HoldProgress => tracker == null ? 0 : tracker.HoldProgress;
        public event Action<PlacementState> StateChanged;
        IObjectPoseSource source;
        PlacementTracker tracker;

        void OnEnable()
        {
            source = poseSource as IObjectPoseSource;
            if (source == null || target == null)
            { Debug.LogError("[Placement] Assign a pose source and target.", this); enabled = false; return; }
            try { tracker = new PlacementTracker(objectId, settings); }
            catch (ArgumentException e) { Debug.LogError("[Placement] " + e.Message, this); enabled = false; }
        }
        void Update()
        {
            var previous = tracker.State;
            ObjectObservation observation = default;
            bool available = poseSource != null && poseSource.isActiveAndEnabled && target != null &&
                source.TryGetObservation(objectId, out observation);
            var pose = target == null ? new Pose(Vector3.zero, Quaternion.identity) : new Pose(target.position, target.rotation);
            tracker.Tick(available, observation, pose, Time.unscaledTimeAsDouble);
            if (previous != tracker.State) StateChanged?.Invoke(tracker.State);
        }
        void OnDisable() { tracker = null; StateChanged?.Invoke(PlacementState.TrackingLost); }
    }
}
