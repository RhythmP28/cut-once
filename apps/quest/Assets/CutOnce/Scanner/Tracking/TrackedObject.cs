using System.Collections.Generic;
using UnityEngine;

namespace CutOnce.Scanner
{
    /// <summary>
    /// One real thing in the room, as opposed to one box in one image. Twenty detections of "chair" at the same spot are
    /// one of these, seen twenty times.
    /// </summary>
    public sealed class TrackedObject
    {
        public int Id { get; internal set; }
        public int ClassId { get; internal set; }
        public string ClassName { get; internal set; }
        /// <summary>Smoothed, so the label does not flicker between 0.62 and 0.58.</summary>
        public float Confidence { get; internal set; }
        /// <summary>The latest measurement, straight from depth: jumpy.</summary>
        public Vector3 WorldPosition { get; internal set; }
        /// <summary>What the visuals follow.</summary>
        public Vector3 SmoothedWorldPosition { get; internal set; }
        /// <summary>Width and height in metres, smoothed.</summary>
        public Vector2 WorldSize { get; internal set; }
        /// <summary>Which way a box around it faces (away from where it was last seen from), flat to the floor.</summary>
        public Vector3 Facing { get; internal set; }
        public float FirstSeenTime { get; internal set; }
        public float LastSeenTime { get; internal set; }
        /// <summary>Inferences in a row that saw it. Reset by an inference that looked right at it and saw nothing.</summary>
        public int ConsecutiveHits { get; internal set; }
        public int TotalHits { get; internal set; }
        /// <summary>Seen often enough to show. Once true it stays true until the object is lost.</summary>
        public bool IsConfirmed { get; internal set; }

        /// <summary>How long it has been in the camera's view WITHOUT being detected. Looking away does not count against it.</summary>
        internal float UnseenInViewSeconds;
        /// <summary>Score mass per class: the name shown is the one the model has believed in most, not the latest guess.</summary>
        internal readonly Dictionary<int, float> ClassVotes = new Dictionary<int, float>(2);

        public override string ToString() => $"#{Id} {ClassName} {Confidence:0.00} at {SmoothedWorldPosition}";
    }
}
