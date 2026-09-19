// The inference loop is adapted from Meta's Unity-PassthroughCameraApiSamples
// (MultiObjectDetection/SentisInference/Scripts/SentisInferenceRunManager.cs),
// Copyright (c) Meta Platforms, Inc. and affiliates, used under the Oculus SDK License Agreement.

using System;
using System.Collections;
using Unity.InferenceEngine;
using UnityEngine;

namespace CutOnce.Scanner
{
    /// <summary>
    /// Camera image in, detections out, a few times a second, without holding up a rendered frame.
    ///
    /// The mechanism is Meta's: one inference in flight at a time, in a coroutine. Schedule() queues the whole model
    /// and returns; the three outputs come back through ReadbackAndCloneAsync, polled once per frame, so the main
    /// thread never waits on the model. What is added: a ceiling on inferences per second (the sample runs them
    /// back to back), an input tensor that is reused instead of 4.9 MB allocated per inference, and the result handed
    /// on as data (DetectionFrame) rather than drawn straight into a canvas.
    /// </summary>
    public sealed class ObjectDetectionManager : MonoBehaviour
    {
        [Tooltip("CPU (Burst jobs) is what Meta ships this model with on Quest: it leaves the GPU to the renderer. GPUCompute is worth an A/B on the headset.")]
        public BackendType backend = BackendType.CPU;
        [Tooltip("Ceiling, not a target: the headset will manage fewer. Tracking fills the gaps between detections.")]
        [Range(1f, 30f)] public float maxInferencesPerSecond = 10f;
        [Range(0f, 1f)] public float scoreThreshold = YoloProcessor.DefaultScoreThreshold;
        [Range(0f, 1f)] public float iouThreshold = YoloProcessor.DefaultIouThreshold;
        [Tooltip("Once a second, log what was detected: \"Detected: chair 0.91\". Read it with `adb logcat -s Unity`.")]
        public bool logDetections = true;

        /// <summary>Raised on the main thread after every inference, including ones that found nothing.</summary>
        public event Action<DetectionFrame> Detected;

        public DetectionFrame Latest => _frame;
        public float InferencesPerSecond { get; private set; }
        public int Inferences { get; private set; }
        /// <summary>What the detector is waiting for, in words ("allow camera access"); null while it is detecting.</summary>
        public string Status { get; private set; } = "Loading the model…";

        IScannerFrameSource _source;
        YoloProcessor _yolo;
        Worker _worker;
        Tensor<float> _input;
        Vector2Int _inputSize;   // x = width, y = height
        readonly DetectionFrame _frame = new DetectionFrame();
        float _nextAllowed, _nextLog, _rateSince;
        int _rateCount;

        public void Init(IScannerFrameSource source, ModelAsset model, string labels)
        {
            _source = source;
            _yolo = new YoloProcessor(labels);
            var loaded = ModelLoader.Load(model);
            var shape = loaded.inputs[0].shape;                       // 1 x 3 x height x width
            _inputSize = new Vector2Int(shape.Get(3), shape.Get(2));
            _worker = new Worker(loaded, backend);
            _input = new Tensor<float>(new TensorShape(1, 3, _inputSize.y, _inputSize.x));
        }

        IEnumerator Start()
        {
            if (_worker == null) { Status = "The detector was never given a model (Init was not called)"; Debug.LogError("[Scanner] " + Status); yield break; }

            // The first inference blocks the main thread for a long time (Meta's words), so spend it here, at launch,
            // on a blank image, rather than the first time someone looks at their desk.
            var blank = new Texture2D(2, 2, TextureFormat.RGBA32, false);
            TextureConverter.ToTensor(blank, _input);
            _worker.Schedule(_input);
            for (int i = 0; i < 3; i++) _worker.PeekOutput(i).CompleteAllPendingOperations();
            Destroy(blank);
            _rateSince = Time.unscaledTime;
            Debug.Log($"[Scanner] Model ready: {_inputSize.x}x{_inputSize.y} input, {_yolo.LabelCount} classes, {backend} backend.");

            while (true)
            {
                if (Time.unscaledTime < _nextAllowed || !_source.TryGetFrame(out var image))
                {
                    if (_source.Status != null) Status = _source.Status;
                    yield return null;
                    continue;
                }
                _nextAllowed = Time.unscaledTime + 1f / maxInferencesPerSecond;
                Status = null;
                yield return Detect(image);
            }
        }

        IEnumerator Detect(ScannerFrame image)
        {
            float started = Time.realtimeSinceStartup;
            _frame.CameraPose = image.CameraPose;
            _frame.ImageSize = image.Size;
            _frame.CapturedAt = Time.unscaledTime;

            // The whole image is resampled to the model's input size (the tensor's shape decides; 2.6 deprecated the
            // sample's SetDimensions call for exactly that reason). Origin top-left, RGB: the defaults.
            TextureConverter.ToTensor(image.Texture, _input);
            _worker.Schedule(_input);

            // Output 0: corners, one row per anchor. 1: best class id. 2: its score. Each readback resolves once every
            // layer before it has run; polling the awaiter keeps this off the main thread's critical path.
            var boxesAwaiter = (_worker.PeekOutput(0) as Tensor<float>).ReadbackAndCloneAsync().GetAwaiter();
            while (!boxesAwaiter.IsCompleted) yield return null;
            using var boxes = boxesAwaiter.GetResult();

            var classIdsAwaiter = (_worker.PeekOutput(1) as Tensor<int>).ReadbackAndCloneAsync().GetAwaiter();
            while (!classIdsAwaiter.IsCompleted) yield return null;
            using var classIds = classIdsAwaiter.GetResult();

            var scoresAwaiter = (_worker.PeekOutput(2) as Tensor<float>).ReadbackAndCloneAsync().GetAwaiter();
            while (!scoresAwaiter.IsCompleted) yield return null;
            using var scores = scoresAwaiter.GetResult();

            _yolo.ScoreThreshold = scoreThreshold;
            _yolo.IouThreshold = iouThreshold;
            _frame.Candidates = boxes.shape[0] == 0 ? 0
                : _yolo.Process(boxes.AsReadOnlyNativeArray(), classIds.AsReadOnlyNativeArray(), scores.AsReadOnlyNativeArray(), _inputSize, image.Size, _frame.Objects);
            if (boxes.shape[0] == 0) _frame.Objects.Clear();
            _frame.InferenceMs = (Time.realtimeSinceStartup - started) * 1000f;

            Inferences++;
            _rateCount++;
            float window = Time.unscaledTime - _rateSince;
            if (window >= 1f) { InferencesPerSecond = _rateCount / window; _rateCount = 0; _rateSince = Time.unscaledTime; }

            if (logDetections && Time.unscaledTime >= _nextLog) { _nextLog = Time.unscaledTime + 1f; Log(); }
            Detected?.Invoke(_frame);
        }

        void Log()
        {
            Debug.Log($"[Scanner] {_frame.Objects.Count} detected in {_frame.InferenceMs:0} ms ({InferencesPerSecond:0.0}/s, {_frame.Candidates} candidates)");
            foreach (var found in _frame.Objects) Debug.Log($"[Scanner] Detected: {found.ClassName} {found.Confidence:0.00}");
        }

        void OnDestroy()
        {
            if (_worker == null) return;
            // An inference may still be in flight: let it finish before its buffers go away.
            for (int i = 0; i < 3; i++) _worker.PeekOutput(i)?.CompleteAllPendingOperations();
            _worker.Dispose();
            _input?.Dispose();
        }
    }
}
