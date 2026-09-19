using System.Collections.Generic;
using CutOnce.Scanner;
using NUnit.Framework;
using UnityEngine;

namespace CutOnce.Scanner.Tests
{
    /// <summary>
    /// The rules that decide whether the room fills with stable, named objects or with flickering duplicates:
    /// one object per real thing, nothing shown on a single sighting, nothing forgotten just because you looked away.
    /// </summary>
    public class TrackedObjectManagerTests
    {
        const int Chair = 56, Cup = 41, Bowl = 45;
        const float Tick = 0.1f;                                            // ten inferences a second

        static LocatedObject Seen(int classId, string name, Vector3 at, float confidence = 0.8f) =>
            new LocatedObject(new DetectedObject(classId, name, confidence, new Rect(0.4f, 0.4f, 0.2f, 0.2f), new Vector2Int(640, 480)), at, new Vector2(0.4f, 0.8f), Vector3.forward);

        static List<LocatedObject> Image(params LocatedObject[] seen) => new List<LocatedObject>(seen);

        static bool Always(Vector3 _) => true;
        static bool Never(Vector3 _) => false;

        [Test]
        public void TheSameChairSeenTwentyTimes_IsOneChair()
        {
            var tracker = new TrackedObjectManager();
            var random = new System.Random(7);
            for (int i = 0; i < 20; i++)
            {
                var jitter = new Vector3((float)random.NextDouble() - 0.5f, (float)random.NextDouble() - 0.5f, (float)random.NextDouble() - 0.5f) * 0.1f;   // +-5 cm of depth noise
                tracker.Observe(Image(Seen(Chair, "chair", new Vector3(1f, 0.5f, 2f) + jitter)), i * Tick, Always);
            }
            Assert.AreEqual(1, tracker.Objects.Count);
            Assert.AreEqual(20, tracker.Objects[0].TotalHits);
            Assert.AreEqual("chair", tracker.Objects[0].ClassName);
        }

        [Test]
        public void AnObjectIsShown_OnlyOnItsThirdSightingInARow()
        {
            var tracker = new TrackedObjectManager { HitsToConfirm = 3 };
            var confirmed = new List<TrackedObject>();
            tracker.Confirmed += confirmed.Add;
            var at = new Vector3(0f, 1f, 1.5f);

            tracker.Observe(Image(Seen(Cup, "cup", at)), 0 * Tick, Always);
            tracker.Observe(Image(Seen(Cup, "cup", at)), 1 * Tick, Always);
            Assert.AreEqual(0, confirmed.Count, "two sightings is not yet an object");
            Assert.AreEqual(0, tracker.ConfirmedCount);

            tracker.Observe(Image(Seen(Cup, "cup", at)), 2 * Tick, Always);
            Assert.AreEqual(1, confirmed.Count);
            Assert.IsTrue(confirmed[0].IsConfirmed);
            Assert.AreEqual(1, tracker.ConfirmedCount);

            tracker.Observe(Image(Seen(Cup, "cup", at)), 3 * Tick, Always);
            Assert.AreEqual(1, confirmed.Count, "confirmed once, not once per sighting");
        }

        [Test]
        public void AOneImageGhost_IsNeverShown_AndIsForgotten()
        {
            var tracker = new TrackedObjectManager();
            int shown = 0;
            tracker.Confirmed += _ => shown++;
            tracker.Observe(Image(Seen(Cup, "cup", new Vector3(0f, 1f, 1.5f))), 0f, Always);
            for (int i = 1; i <= 10; i++) tracker.Observe(Image(), i * Tick, Always);
            Assert.AreEqual(0, shown);
            Assert.AreEqual(0, tracker.Objects.Count, "a candidate the camera keeps looking at and never sees again is dropped");
        }

        [Test]
        public void LookingAway_DoesNotForgetAnObject_LookingBackAtNothingDoes()
        {
            var tracker = new TrackedObjectManager { KeepAliveSeconds = 1.5f };
            var lost = new List<TrackedObject>();
            tracker.Lost += lost.Add;
            float now = 0f;
            for (int i = 0; i < 5; i++, now += Tick) tracker.Observe(Image(Seen(Chair, "chair", new Vector3(1f, 0.5f, 2f))), now, Always);
            Assert.AreEqual(1, tracker.ConfirmedCount);

            for (int i = 0; i < 100; i++, now += Tick) tracker.Observe(Image(), now, Never);      // ten seconds scanning the other side of the room
            Assert.AreEqual(1, tracker.ConfirmedCount, "out of view is not the same as gone");
            Assert.AreEqual(0, lost.Count);

            for (int i = 0; i < 10; i++, now += Tick) tracker.Observe(Image(), now, Always);      // one second looking right at where it was
            Assert.AreEqual(1, tracker.ConfirmedCount, "a second of misses is within the keep-alive: no flicker");

            for (int i = 0; i < 10; i++, now += Tick) tracker.Observe(Image(), now, Always);      // and another
            Assert.AreEqual(0, tracker.ConfirmedCount);
            Assert.AreEqual(1, lost.Count);
            Assert.AreEqual("chair", lost[0].ClassName);
        }

        [Test]
        public void ABriefDropout_DoesNotFlicker()
        {
            var tracker = new TrackedObjectManager();
            int lost = 0;
            tracker.Lost += _ => lost++;
            float now = 0f;
            var at = new Vector3(0f, 1f, 1.5f);
            for (int i = 0; i < 5; i++, now += Tick) tracker.Observe(Image(Seen(Cup, "cup", at)), now, Always);
            for (int i = 0; i < 8; i++, now += Tick) tracker.Observe(Image(), now, Always);        // 0.8 s of the model missing it
            tracker.Observe(Image(Seen(Cup, "cup", at)), now, Always);
            Assert.AreEqual(0, lost);
            Assert.AreEqual(1, tracker.Objects.Count, "and it is the same object, not a new one");
            Assert.AreEqual(1, tracker.Objects[0].Id);
        }

        [Test]
        public void Smoothing_CalmsDepthNoise_ButStillArrives()
        {
            var tracker = new TrackedObjectManager { Smoothing = 0.35f };
            var truth = new Vector3(0f, 1f, 2f);
            var random = new System.Random(11);
            float worstRaw = 0f, worstSmoothed = 0f;
            for (int i = 0; i < 60; i++)
            {
                var noisy = truth + Vector3.forward * (((float)random.NextDouble() - 0.5f) * 0.16f);        // +-8 cm along the ray
                tracker.Observe(Image(Seen(Cup, "cup", noisy)), i * Tick, Always);
                if (i < 20) continue;                                                                    // after it has settled
                worstRaw = Mathf.Max(worstRaw, Vector3.Distance(noisy, truth));
                worstSmoothed = Mathf.Max(worstSmoothed, Vector3.Distance(tracker.Objects[0].SmoothedWorldPosition, truth));
            }
            Assert.Less(worstSmoothed, worstRaw * 0.6f, "the label moves much less than the measurements do");
            Assert.Less(worstSmoothed, 0.05f);
        }

        [Test]
        public void TwoChairsAMetreApart_AreTwoChairs()
        {
            var tracker = new TrackedObjectManager();
            for (int i = 0; i < 5; i++)
                tracker.Observe(Image(Seen(Chair, "chair", new Vector3(0f, 0.5f, 2f)), Seen(Chair, "chair", new Vector3(1f, 0.5f, 2f))), i * Tick, Always);
            Assert.AreEqual(2, tracker.ConfirmedCount);
            Assert.AreNotEqual(tracker.Objects[0].Id, tracker.Objects[1].Id);
        }

        [Test]
        public void TwoDetectionsInOneImage_NeverClaimTheSameObject()
        {
            var tracker = new TrackedObjectManager();
            tracker.Observe(Image(Seen(Cup, "cup", new Vector3(0f, 1f, 1.5f))), 0f, Always);
            // Two cups 20 cm apart, both within MatchDistance of the one known cup: the second must become a new object.
            tracker.Observe(Image(Seen(Cup, "cup", new Vector3(0.05f, 1f, 1.5f)), Seen(Cup, "cup", new Vector3(0.25f, 1f, 1.5f))), Tick, Always);
            Assert.AreEqual(2, tracker.Objects.Count);
        }

        [Test]
        public void TheModelWaveringBetweenCupAndBowl_IsOneObject_NamedByWhatItBelievedMost()
        {
            var tracker = new TrackedObjectManager();
            var at = new Vector3(0f, 1f, 1.5f);
            float now = 0f;
            for (int i = 0; i < 4; i++, now += Tick) tracker.Observe(Image(Seen(Cup, "cup", at, 0.7f)), now, Always);
            tracker.Observe(Image(Seen(Bowl, "bowl", at + Vector3.right * 0.03f, 0.5f)), now, Always); now += Tick;
            Assert.AreEqual(1, tracker.Objects.Count, "one thing, one label");
            Assert.AreEqual("cup", tracker.Objects[0].ClassName, "one wobble does not rename it");

            for (int i = 0; i < 8; i++, now += Tick) tracker.Observe(Image(Seen(Bowl, "bowl", at, 0.6f)), now, Always);
            Assert.AreEqual(1, tracker.Objects.Count);
            Assert.AreEqual("bowl", tracker.Objects[0].ClassName, "but if it keeps saying bowl, it is a bowl");
            Assert.AreEqual(Bowl, tracker.Objects[0].ClassId);
        }

        [Test]
        public void ADifferentClassHalfAMetreAway_IsADifferentObject()
        {
            var tracker = new TrackedObjectManager();
            for (int i = 0; i < 4; i++)
                tracker.Observe(Image(Seen(Cup, "cup", new Vector3(0f, 1f, 1.5f)), Seen(Bowl, "bowl", new Vector3(0.5f, 1f, 1.5f))), i * Tick, Always);
            Assert.AreEqual(2, tracker.ConfirmedCount);
        }

        [Test]
        public void AStalledFrame_DoesNotExpireTheWholeRoom()
        {
            var tracker = new TrackedObjectManager { KeepAliveSeconds = 1.5f };
            for (int i = 0; i < 5; i++) tracker.Observe(Image(Seen(Chair, "chair", new Vector3(1f, 0.5f, 2f))), i * Tick, Always);
            tracker.Observe(Image(), 30f, Always);                       // the app was paused for half a minute
            Assert.AreEqual(1, tracker.ConfirmedCount, "one missed image is one missed image, however long it took to arrive");
        }

        [Test]
        public void Clear_ReportsEveryShownObjectAsLost()
        {
            var tracker = new TrackedObjectManager();
            int lost = 0;
            tracker.Lost += _ => lost++;
            for (int i = 0; i < 5; i++) tracker.Observe(Image(Seen(Chair, "chair", new Vector3(1f, 0.5f, 2f)), Seen(Cup, "cup", new Vector3(0f, 1f, 1.5f))), i * Tick, Always);
            tracker.Clear();
            Assert.AreEqual(2, lost);
            Assert.AreEqual(0, tracker.Objects.Count);
            Assert.AreEqual(0, tracker.ConfirmedCount);
        }
    }
}
