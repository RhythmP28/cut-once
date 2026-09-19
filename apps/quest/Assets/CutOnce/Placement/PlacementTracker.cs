using System;
using UnityEngine;

namespace CutOnce.Placement
{
    // All poses are object-centre poses in the same Unity world frame, metres.
    // Timestamps use Time.unscaledTimeAsDouble, NOT server/Unix time.
    public readonly struct ObjectObservation
    {
        public readonly string ObjectId;
        public readonly Pose Pose;
        public readonly float Confidence;
        public readonly double ObservedAt;
        public ObjectObservation(string objectId, Pose pose, float confidence, double observedAt)
        { ObjectId = objectId; Pose = pose; Confidence = confidence; ObservedAt = observedAt; }
    }

    public interface IObjectPoseSource
    {
        bool TryGetObservation(string objectId, out ObjectObservation observation);
    }

    public enum PlacementState { TrackingLost, Misplaced, Near, Aligning, Confirmed }
    public enum RotationRule { Exact, Ignore, HalfTurnAroundLocalY }

    [Serializable]
    public sealed class PlacementSettings
    {
        [Min(0.001f)] public float positionTolerance = 0.05f;
        [Range(0, 180)] public float rotationTolerance = 12f;
        [Min(1)] public float exitMultiplier = 1.5f;
        [Min(0)] public float holdSeconds = 0.5f;
        [Min(0.01f)] public float maxObservationAge = 0.25f;
        [Range(0, 1)] public float minimumConfidence = 0.7f;
        public RotationRule rotationRule;

        public void Validate()
        {
            if (!Finite(positionTolerance) || positionTolerance <= 0 ||
                !Finite(rotationTolerance) || rotationTolerance < 0 || rotationTolerance > 180 ||
                !Finite(exitMultiplier) || exitMultiplier < 1 || !Finite(holdSeconds) || holdSeconds < 0 ||
                !Finite(maxObservationAge) || maxObservationAge <= 0 ||
                !Finite(minimumConfidence) || minimumConfidence < 0 || minimumConfidence > 1 ||
                !Enum.IsDefined(typeof(RotationRule), rotationRule))
                throw new ArgumentException("Invalid placement tolerances or tracking settings.");
        }
        internal static bool Finite(float v) => !float.IsNaN(v) && !float.IsInfinity(v);
    }

    /// <summary>Pure state machine; no scene searches, rendering, or detector dependencies.</summary>
    public sealed class PlacementTracker
    {
        public PlacementState State { get; private set; } = PlacementState.TrackingLost;
        public float PositionError { get; private set; } = float.PositiveInfinity;
        public float RotationError { get; private set; } = float.PositiveInfinity;
        public float HoldProgress { get; private set; }
        readonly string id;
        readonly PlacementSettings settings;
        double alignedSince = double.NaN, lastSample = double.NegativeInfinity, lastNow = double.NegativeInfinity;
        Pose previousTarget;
        bool hasTarget;

        public PlacementTracker(string objectId, PlacementSettings settings)
        {
            if (string.IsNullOrWhiteSpace(objectId)) throw new ArgumentException("A stable object ID is required.");
            this.settings = settings ?? throw new ArgumentNullException(nameof(settings));
            settings.Validate();
            id = objectId;
        }

        public PlacementState Tick(bool available, ObjectObservation observation, Pose target, double now)
        {
            bool clockReset = now < lastNow;
            lastNow = now;
            if (clockReset) { Reset(); lastSample = double.NegativeInfinity; }
            // A new plan/target must earn confirmation again, even when inside the exit tolerance.
            if (hasTarget && (Vector3.Distance(previousTarget.position, target.position) > 0.0001f ||
                Quaternion.Angle(previousTarget.rotation, target.rotation) > 0.01f)) Reset();
            previousTarget = target;
            hasTarget = true;
            if (!available || observation.ObjectId != id || !ValidPose(observation.Pose) || !ValidPose(target) ||
                !PlacementSettings.Finite(observation.Confidence) || observation.Confidence < settings.minimumConfidence ||
                observation.Confidence > 1 || double.IsNaN(now) || double.IsInfinity(now) ||
                double.IsNaN(observation.ObservedAt) || double.IsInfinity(observation.ObservedAt) ||
                observation.ObservedAt > now || now - observation.ObservedAt > settings.maxObservationAge ||
                observation.ObservedAt < lastSample)
            {
                Reset();
                PositionError = RotationError = float.PositiveInfinity;
                return State;
            }
            if (observation.ObservedAt - lastSample > settings.maxObservationAge) Reset();
            lastSample = observation.ObservedAt;
            PositionError = Vector3.Distance(observation.Pose.position, target.position);
            RotationError = settings.rotationRule == RotationRule.Ignore ? 0 :
                Quaternion.Angle(observation.Pose.rotation, target.rotation);
            if (settings.rotationRule == RotationRule.HalfTurnAroundLocalY)
                RotationError = Mathf.Min(RotationError, Quaternion.Angle(observation.Pose.rotation,
                    target.rotation * Quaternion.Euler(0, 180, 0)));

            if (State == PlacementState.Confirmed && Within(settings.exitMultiplier)) return State;
            if (Within(1))
            {
                // Advance dwell with observation time: repeatedly polling one frozen frame cannot confirm.
                if (double.IsNaN(alignedSince)) alignedSince = observation.ObservedAt;
                HoldProgress = settings.holdSeconds == 0 ? 1 :
                    Mathf.Clamp01((float)(observation.ObservedAt - alignedSince) / settings.holdSeconds);
                State = HoldProgress >= 1 ? PlacementState.Confirmed : PlacementState.Aligning;
            }
            else
            {
                alignedSince = double.NaN;
                HoldProgress = 0;
                State = Within(2) ? PlacementState.Near : PlacementState.Misplaced;
            }
            return State;
        }

        bool Within(float multiplier) => PositionError <= settings.positionTolerance * multiplier &&
            RotationError <= settings.rotationTolerance * multiplier;
        void Reset() { State = PlacementState.TrackingLost; alignedSince = double.NaN; HoldProgress = 0; }
        static bool ValidPose(Pose p)
        {
            var q = p.rotation;
            float norm = q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w;
            return PlacementSettings.Finite(p.position.x) && PlacementSettings.Finite(p.position.y) &&
                PlacementSettings.Finite(p.position.z) && PlacementSettings.Finite(norm) && Mathf.Abs(norm - 1) < 0.01f;
        }
    }
}
