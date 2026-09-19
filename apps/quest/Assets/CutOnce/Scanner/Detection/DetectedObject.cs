using System.Collections.Generic;
using UnityEngine;

namespace CutOnce.Scanner
{
    /// <summary>
    /// One thing the model saw in one camera image.
    ///
    /// The box is in viewport space (0..1, origin bottom-left) because that is what Meta's
    /// PassthroughCameraAccess.ViewportPointToRay takes. The model's own boxes are top-left origin; that flip happens
    /// exactly once, in YoloProcessor, so nothing downstream has to think about it. Getting it wrong is silent: every
    /// label lands mirrored top-to-bottom and merely looks "a bit off".
    /// </summary>
    public readonly struct DetectedObject
    {
        public readonly int ClassId;
        public readonly string ClassName;
        public readonly float Confidence;
        /// <summary>Viewport space: 0..1, origin bottom-left.</summary>
        public readonly Rect Box;
        /// <summary>Centre of the box in camera-image pixels, origin top-left, as an image viewer shows it.</summary>
        public readonly Vector2Int CenterPixel;

        /// <summary>Centre of the box in viewport space: the point to cast a ray through.</summary>
        public Vector2 Center => Box.center;

        public DetectedObject(int classId, string className, float confidence, Rect box, Vector2Int centerPixel)
        {
            ClassId = classId;
            ClassName = className;
            Confidence = confidence;
            Box = box;
            CenterPixel = centerPixel;
        }

        public override string ToString() => $"{ClassName} {Confidence:0.00}";
    }

    /// <summary>
    /// Everything one inference produced, with the pose the camera had when that image was taken. Rays for these boxes
    /// must be cast from CameraPose, not from wherever the head is by the time the model finishes (~100 ms later), or
    /// every label smears in the direction the head is turning. One instance is reused for every inference: read it
    /// inside the Detected callback, don't keep it.
    /// </summary>
    public sealed class DetectionFrame
    {
        public readonly List<DetectedObject> Objects = new List<DetectedObject>(32);
        public Pose CameraPose;
        public Vector2Int ImageSize;
        /// <summary>Time.unscaledTime when the image was handed to the model.</summary>
        public float CapturedAt;
        /// <summary>Image in, boxes out: includes the frames spent waiting for the readback.</summary>
        public float InferenceMs;
        /// <summary>Boxes over the score threshold before overlap suppression. Far above Objects.Count means a noisy scene.</summary>
        public int Candidates;
    }
}
