using NUnit.Framework;
using UnityEngine;

namespace CutOnce.Placement.Tests
{
    public sealed class PlacementTrackerTests
    {
        static readonly Pose Target = new Pose(Vector3.zero, Quaternion.identity);
        static ObjectObservation Sample(double time, float x = 0, float angle = 0, float confidence = 1, string id = "box") =>
            new ObjectObservation(id, new Pose(new Vector3(x, 0, 0), Quaternion.Euler(0, angle, 0)), confidence, time);
        static PlacementTracker Tracker(PlacementSettings settings = null) => new PlacementTracker("box", settings ?? new PlacementSettings());
        static void Confirm(PlacementTracker tracker)
        {
            for (int i = 0; i <= 5; i++) tracker.Tick(true, Sample(i * 0.1), Target, i * 0.1);
            Assert.That(tracker.State, Is.EqualTo(PlacementState.Confirmed));
        }

        [Test] public void FreshContinuousAlignmentConfirmsAfterDwell() { Confirm(Tracker()); }
        [Test] public void FrozenFrameCannotAdvanceDwell()
        {
            var t = Tracker(new PlacementSettings { maxObservationAge = 2 });
            t.Tick(true, Sample(0), Target, 0);
            Assert.That(t.Tick(true, Sample(0), Target, 1), Is.EqualTo(PlacementState.Aligning));
            Assert.That(t.HoldProgress, Is.Zero);
        }
        [Test] public void ConfirmationHasExitHysteresisAndReturnsAfterMovement()
        {
            var t = Tracker(); Confirm(t);
            Assert.That(t.Tick(true, Sample(0.6, 0.06f), Target, 0.6), Is.EqualTo(PlacementState.Confirmed));
            Assert.That(t.Tick(true, Sample(0.7, 0.08f), Target, 0.7), Is.EqualTo(PlacementState.Near));
            Assert.That(t.Tick(true, Sample(0.8), Target, 0.8), Is.EqualTo(PlacementState.Aligning));
        }
        [Test] public void LeavingAlignmentRestartsHold()
        {
            var t = Tracker();
            t.Tick(true, Sample(0), Target, 0);
            t.Tick(true, Sample(0.2), Target, 0.2);
            t.Tick(true, Sample(0.3, 0.2f), Target, 0.3);
            Assert.That(t.Tick(true, Sample(0.4), Target, 0.4), Is.EqualTo(PlacementState.Aligning));
            Assert.That(t.HoldProgress, Is.Zero);
        }
        [Test] public void MissingTrackingClearsConfirmationAndRequiresNewHold()
        {
            var t = Tracker(); Confirm(t);
            Assert.That(t.Tick(false, default, Target, 0.6), Is.EqualTo(PlacementState.TrackingLost));
            Assert.That(t.Tick(true, Sample(0.7), Target, 0.7), Is.EqualTo(PlacementState.Aligning));
        }
        [Test] public void StaleLowConfidenceWrongIdentityAndFutureObservationsFailClosed()
        {
            var t = Tracker();
            Assert.That(t.Tick(true, Sample(0), Target, 1), Is.EqualTo(PlacementState.TrackingLost));
            Assert.That(t.Tick(true, Sample(1, confidence: 0.3f), Target, 1), Is.EqualTo(PlacementState.TrackingLost));
            Assert.That(t.Tick(true, Sample(1, id: "other"), Target, 1), Is.EqualTo(PlacementState.TrackingLost));
            Assert.That(t.Tick(true, Sample(2), Target, 1), Is.EqualTo(PlacementState.TrackingLost));
        }
        [Test] public void ObservationGapDoesNotCountAsStablePlacement()
        {
            var t = Tracker(); t.Tick(true, Sample(0), Target, 0);
            Assert.That(t.Tick(true, Sample(1), Target, 1), Is.EqualTo(PlacementState.Aligning));
            Assert.That(t.HoldProgress, Is.Zero);
        }
        [Test] public void OutOfOrderObservationClearsConfirmation()
        {
            var t = Tracker(); Confirm(t);
            Assert.That(t.Tick(true, Sample(0.45), Target, 0.55), Is.EqualTo(PlacementState.TrackingLost));
        }
        [Test] public void TargetChangeRequiresConfirmationAgain()
        {
            var t = Tracker(); Confirm(t);
            var movedTarget = new Pose(new Vector3(0.01f, 0, 0), Quaternion.identity);
            Assert.That(t.Tick(true, Sample(0.6), movedTarget, 0.6), Is.EqualTo(PlacementState.Aligning));
        }
        [Test] public void RotationIsRequiredUnlessExplicitlyIgnoredOrSymmetric()
        {
            Assert.That(Tracker().Tick(true, Sample(0, angle: 180), Target, 0), Is.EqualTo(PlacementState.Misplaced));
            var symmetry = Tracker(new PlacementSettings { rotationRule = RotationRule.HalfTurnAroundLocalY });
            Assert.That(symmetry.Tick(true, Sample(0, angle: 180), Target, 0), Is.EqualTo(PlacementState.Aligning));
            var sphere = Tracker(new PlacementSettings { rotationRule = RotationRule.Ignore });
            Assert.That(sphere.Tick(true, Sample(0, angle: 70), Target, 0), Is.EqualTo(PlacementState.Aligning));
        }
        [Test] public void InvalidNumbersNeverConfirm()
        {
            var t = Tracker();
            Assert.That(t.Tick(true, Sample(0, x: float.NaN), Target, 0), Is.EqualTo(PlacementState.TrackingLost));
            var invalid = new ObjectObservation("box", new Pose(Vector3.zero, default), 1, 0);
            Assert.That(t.Tick(true, invalid, Target, 0), Is.EqualTo(PlacementState.TrackingLost));
            Assert.Throws<System.ArgumentException>(() => Tracker(new PlacementSettings { holdSeconds = -1 }));
        }
        [Test] public void BufferRejectsReorderedFramesAndCanForgetLostObject()
        {
            var obj = new GameObject("buffer test");
            try
            {
                var source = obj.AddComponent<BufferedObjectPoseSource>();
                Assert.That(source.Submit(Sample(2)), Is.True);
                Assert.That(source.Submit(Sample(1)), Is.False);
                Assert.That(source.Submit(Sample(2)), Is.False);
                source.Forget("box");
                Assert.That(source.TryGetObservation("box", out _), Is.False);
            }
            finally { Object.DestroyImmediate(obj); }
        }
    }
}
