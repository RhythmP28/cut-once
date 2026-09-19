using System;
using System.Collections.Generic;
using UnityEngine;

namespace CutOnce.Scanner
{
    /// <summary>
    /// Turns a stream of per-image detections into a stable set of objects in the room.
    ///
    ///  - Same class within MatchDistance of an object we already know: it is that object, seen again. Its position
    ///    moves part of the way to the new measurement (an exponential moving average), so depth noise does not shake
    ///    the label.
    ///  - A new object is shown only after HitsToConfirm inferences in a row: one-image ghosts never appear.
    ///  - An object is dropped only after KeepAliveSeconds of the camera LOOKING AT where it is and not detecting it.
    ///    Time spent looking elsewhere does not count, so a desk you have scanned keeps its labels while you scan the
    ///    shelf, and they are still there when you look back.
    ///  - One thing, one name: a detection of a different class landing on top of a known object (the model wavering
    ///    between "cup" and "bowl") updates that object instead of stacking a second label on it. The name shown is
    ///    the class with the most score behind it so far.
    ///
    /// Plain C# over Unity's maths types: no scene, no camera, no headset needed to test it.
    /// </summary>
    public sealed class TrackedObjectManager
    {
        /// <summary>Same class within this many metres is the same object.</summary>
        public float MatchDistance = 0.3f;
        /// <summary>A different class within this many metres is still the same object, renamed by vote. 0 turns it off.</summary>
        public float SameSpotDistance = 0.12f;
        /// <summary>How far towards each new measurement the smoothed position moves. 1 = no smoothing.</summary>
        public float Smoothing = 0.35f;
        public int HitsToConfirm = 3;
        public float KeepAliveSeconds = 1.5f;
        /// <summary>A candidate that has not been confirmed is dropped sooner, and outright if it is never seen again.</summary>
        public float UnconfirmedKeepAliveSeconds = 0.6f, UnconfirmedMaxAgeSeconds = 3f;
        public int MaxObjects = 64;

        /// <summary>An object has been seen often enough to show.</summary>
        public event Action<TrackedObject> Confirmed;
        /// <summary>A confirmed object is gone. (Candidates that never confirmed vanish silently.)</summary>
        public event Action<TrackedObject> Lost;

        public IReadOnlyList<TrackedObject> Objects => _objects;
        public int ConfirmedCount { get; private set; }

        readonly List<TrackedObject> _objects = new List<TrackedObject>(32);
        readonly List<bool> _matched = new List<bool>(32);
        int _nextId = 1;
        float _lastObserved = float.NaN;

        /// <param name="located">This inference's detections that depth could place.</param>
        /// <param name="now">When the image was taken.</param>
        /// <param name="isInView">Could the camera see this point in that image? Decides whether a miss counts against an object.</param>
        public void Observe(IReadOnlyList<LocatedObject> located, float now, Func<Vector3, bool> isInView)
        {
            float elapsed = float.IsNaN(_lastObserved) ? 0f : Mathf.Clamp(now - _lastObserved, 0f, 0.5f);   // a stall must not expire everything at once
            _lastObserved = now;

            _matched.Clear();
            for (int i = 0; i < _objects.Count; i++) _matched.Add(false);

            for (int d = 0; d < located.Count; d++)
            {
                LocatedObject seen = located[d];
                int match = Nearest(seen, sameClass: true, MatchDistance);
                if (match < 0 && SameSpotDistance > 0f) match = Nearest(seen, sameClass: false, SameSpotDistance);
                if (match >= 0) { Update(_objects[match], seen, now); _matched[match] = true; }
                else if (_objects.Count < MaxObjects) { _objects.Add(Create(seen, now)); _matched.Add(true); }
            }

            for (int i = _objects.Count - 1; i >= 0; i--)
            {
                if (_matched[i]) continue;
                TrackedObject missed = _objects[i];
                if (isInView == null || isInView(missed.SmoothedWorldPosition))
                {
                    missed.UnseenInViewSeconds += elapsed;
                    if (!missed.IsConfirmed) missed.ConsecutiveHits = 0;
                }
                bool gone = missed.IsConfirmed
                    ? missed.UnseenInViewSeconds > KeepAliveSeconds
                    : missed.UnseenInViewSeconds > UnconfirmedKeepAliveSeconds || now - missed.LastSeenTime > UnconfirmedMaxAgeSeconds;
                if (!gone) continue;
                _objects.RemoveAt(i);
                if (missed.IsConfirmed) { ConfirmedCount--; Lost?.Invoke(missed); }
            }
        }

        /// <summary>Forget everything (a new room, or the scanner switched off).</summary>
        public void Clear()
        {
            for (int i = _objects.Count - 1; i >= 0; i--)
            {
                TrackedObject removed = _objects[i];
                _objects.RemoveAt(i);
                if (removed.IsConfirmed) Lost?.Invoke(removed);
            }
            ConfirmedCount = 0;
            _lastObserved = float.NaN;
        }

        /// <summary>The closest object not already claimed by another detection in this image.</summary>
        int Nearest(in LocatedObject seen, bool sameClass, float within)
        {
            int best = -1;
            float bestSqr = within * within;
            for (int i = 0; i < _objects.Count; i++)
            {
                if (_matched[i] || (_objects[i].ClassId == seen.Detection.ClassId) != sameClass) continue;
                float sqr = (_objects[i].SmoothedWorldPosition - seen.WorldPosition).sqrMagnitude;
                if (sqr <= bestSqr) { bestSqr = sqr; best = i; }
            }
            return best;
        }

        TrackedObject Create(in LocatedObject seen, float now)
        {
            var created = new TrackedObject
            {
                Id = _nextId++, ClassId = seen.Detection.ClassId, ClassName = seen.Detection.ClassName, Confidence = seen.Detection.Confidence,
                WorldPosition = seen.WorldPosition, SmoothedWorldPosition = seen.WorldPosition, WorldSize = seen.WorldSize, Facing = seen.Facing,
                FirstSeenTime = now, LastSeenTime = now, ConsecutiveHits = 1, TotalHits = 1,
            };
            created.ClassVotes[seen.Detection.ClassId] = seen.Detection.Confidence;
            if (HitsToConfirm <= 1) Confirm(created);
            return created;
        }

        void Update(TrackedObject known, in LocatedObject seen, float now)
        {
            float t = Mathf.Clamp01(Smoothing);
            known.WorldPosition = seen.WorldPosition;
            known.SmoothedWorldPosition = Vector3.Lerp(known.SmoothedWorldPosition, seen.WorldPosition, t);
            known.WorldSize = Vector2.Lerp(known.WorldSize, seen.WorldSize, t);
            known.Facing = seen.Facing;
            known.Confidence = Mathf.Lerp(known.Confidence, seen.Detection.Confidence, t);
            known.LastSeenTime = now;
            known.UnseenInViewSeconds = 0f;
            known.ConsecutiveHits++;
            known.TotalHits++;

            known.ClassVotes.TryGetValue(seen.Detection.ClassId, out float votes);
            known.ClassVotes[seen.Detection.ClassId] = votes + seen.Detection.Confidence;
            known.ClassVotes.TryGetValue(known.ClassId, out float current);
            if (seen.Detection.ClassId != known.ClassId && votes + seen.Detection.Confidence > current)
            {
                known.ClassId = seen.Detection.ClassId;
                known.ClassName = seen.Detection.ClassName;
            }

            if (!known.IsConfirmed && known.ConsecutiveHits >= HitsToConfirm) Confirm(known);
        }

        void Confirm(TrackedObject confirmed)
        {
            confirmed.IsConfirmed = true;
            ConfirmedCount++;
            Confirmed?.Invoke(confirmed);
        }
    }
}
