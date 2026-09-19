// Non-max suppression and IoU are adapted from Meta's Unity-PassthroughCameraApiSamples
// (MultiObjectDetection/SentisInference/Scripts/SentisInferenceRunManager.cs),
// Copyright (c) Meta Platforms, Inc. and affiliates, used under the Oculus SDK License Agreement.

using System.Collections.Generic;
using Unity.Collections;
using UnityEngine;

namespace CutOnce.Scanner
{
    /// <summary>
    /// Turns the model's three raw outputs into a short list of detections: drop weak boxes, then keep only the best
    /// of any boxes that overlap. The decode itself (centre-size to corners, best class per box) is baked into Meta's
    /// yolov9sentis.sentis graph, so what arrives here is already corners + one class id + one score per anchor.
    ///
    /// Same algorithm as Meta's sample, including suppressing overlaps REGARDLESS of class: a bottle the model also
    /// half-believes is a vase should be one label, not two fighting for the same spot. The differences are that it
    /// owns its buffers (AGENTS rule 10: the sample allocates a list, an array and a closure per inference) and that
    /// it has no Unity objects in it, so it can be tested without a headset.
    /// </summary>
    public sealed class YoloProcessor
    {
        /// <summary>Meta's shipped prefab values. (Their C# field defaults, 0.23 and 0.6, are overridden by that prefab.)</summary>
        public const float DefaultScoreThreshold = 0.3f, DefaultIouThreshold = 0.4f;

        public float ScoreThreshold = DefaultScoreThreshold;
        public float IouThreshold = DefaultIouThreshold;

        readonly string[] _labels;
        readonly List<int> _candidates = new List<int>(256);
        readonly ByScoreDescending _byScore = new ByScoreDescending();
        bool[] _suppressed = new bool[256];

        /// <param name="labelsText">One class name per line, in the model's class order (line 0 is class id 0).</param>
        public YoloProcessor(string labelsText)
        {
            var lines = (labelsText ?? "").Split('\n');
            int count = lines.Length;
            while (count > 0 && lines[count - 1].Trim().Length == 0) count--;   // a trailing newline is not a class
            _labels = new string[count];
            for (int i = 0; i < count; i++) _labels[i] = lines[i].Trim();        // Trim: a CRLF checkout must not name things "chair\r"
        }

        public int LabelCount => _labels.Length;

        public string Label(int classId) => classId >= 0 && classId < _labels.Length ? _labels[classId] : "object";

        /// <summary>
        /// Boxes are rows of (left, top, right, bottom) in model-input pixels, origin top-left. Returns how many boxes
        /// cleared the score threshold before suppression.
        /// </summary>
        public int Process(NativeArray<float>.ReadOnly boxes, NativeArray<int>.ReadOnly classIds, NativeArray<float>.ReadOnly scores,
            Vector2Int modelInput, Vector2Int imageSize, List<DetectedObject> results)
        {
            results.Clear();
            _candidates.Clear();
            int anchors = Mathf.Min(scores.Length, Mathf.Min(classIds.Length, boxes.Length / 4));
            for (int i = 0; i < anchors; i++)
                if (scores[i] >= ScoreThreshold) _candidates.Add(i);
            int candidates = _candidates.Count;
            if (candidates == 0) return 0;

            _byScore.Scores = scores;
            _candidates.Sort(_byScore);

            if (_suppressed.Length < candidates) _suppressed = new bool[Mathf.NextPowerOfTwo(candidates)];
            System.Array.Clear(_suppressed, 0, candidates);

            for (int i = 0; i < candidates; i++)
            {
                if (_suppressed[i]) continue;
                int kept = _candidates[i];
                Vector4 box = Box(boxes, kept);
                if (box.z > box.x && box.w > box.y)   // a box with no area is not a detection (the warm-up image makes some)
                    results.Add(ToDetection(classIds[kept], scores[kept], box, modelInput, imageSize));

                for (int j = i + 1; j < candidates; j++)
                    if (!_suppressed[j] && CalculateIoU(box, Box(boxes, _candidates[j])) > IouThreshold) _suppressed[j] = true;
            }
            return candidates;
        }

        DetectedObject ToDetection(int classId, float score, Vector4 box, Vector2Int modelInput, Vector2Int imageSize)
        {
            // The whole camera image was resampled to the model's input, so dividing by the input size gives 0..1 across
            // the image: no letterbox to undo. The model's y runs down from the top; viewport y runs up from the bottom.
            float left = Mathf.Clamp01(box.x / modelInput.x), right = Mathf.Clamp01(box.z / modelInput.x);
            float top = Mathf.Clamp01(box.y / modelInput.y), bottom = Mathf.Clamp01(box.w / modelInput.y);
            var viewport = Rect.MinMaxRect(left, 1f - bottom, right, 1f - top);
            var centerPixel = new Vector2Int(Mathf.RoundToInt((left + right) * 0.5f * imageSize.x), Mathf.RoundToInt((top + bottom) * 0.5f * imageSize.y));
            return new DetectedObject(classId, Label(classId), score, viewport, centerPixel);
        }

        static Vector4 Box(NativeArray<float>.ReadOnly boxes, int i) => new Vector4(boxes[i * 4], boxes[i * 4 + 1], boxes[i * 4 + 2], boxes[i * 4 + 3]);

        /// <summary>Intersection over union of two (left, top, right, bottom) boxes. 0 = apart, 1 = identical.</summary>
        public static float CalculateIoU(Vector4 a, Vector4 b)
        {
            float width = Mathf.Max(0f, Mathf.Min(a.z, b.z) - Mathf.Max(a.x, b.x));
            float height = Mathf.Max(0f, Mathf.Min(a.w, b.w) - Mathf.Max(a.y, b.y));
            float intersection = width * height;
            float union = (a.z - a.x) * (a.w - a.y) + (b.z - b.x) * (b.w - b.y) - intersection;
            return union <= 0f ? 0f : intersection / union;
        }

        /// <summary>Sorts anchor indices by score without allocating a closure per inference.</summary>
        sealed class ByScoreDescending : IComparer<int>
        {
            public NativeArray<float>.ReadOnly Scores;
            public int Compare(int a, int b) => Scores[b].CompareTo(Scores[a]);
        }
    }
}
