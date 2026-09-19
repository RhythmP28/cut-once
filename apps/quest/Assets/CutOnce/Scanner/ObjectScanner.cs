using System;
using System.Collections.Generic;
using System.Text;
using CutOnce.AR;
using Unity.InferenceEngine;
using UnityEngine;

namespace CutOnce.Scanner
{
    /// <summary>
    /// The object scanner, assembled in code like the rest of the app (CutOnceApp builds everything at runtime so there
    /// are no prefab or Inspector references to drift, and Main.unity has one owner who is not us).
    ///
    ///   camera image -> ObjectDetectionManager (YOLO) -> Object3DLocator (depth) -> TrackedObjectManager -> ObjectVisualizer
    ///
    /// On the headset it starts by itself and reads the passthrough camera. In the Editor nothing starts by itself,
    /// so the team's PlayMode tests and scenes are left exactly as they were: call Install() (or use
    /// Cut Once > Scanner) and it runs on a stored photo against a stand-in for depth.
    /// Define CUTONCE_NO_SCANNER_AUTOBOOT to stop the headset auto-start.
    /// </summary>
    public sealed class ObjectScanner : MonoBehaviour
    {
        /// <summary>Resources paths. The model is Meta's yolov9sentis.sentis; the labels are the 80 COCO names in its class order.</summary>
        public const string ModelResource = "CutOnce/Scanner/yolov9sentis", LabelsResource = "CutOnce/Scanner/coco-labels";
        const float WaitForTheAppsRaycasterSeconds = 3f, LookEverySeconds = 0.5f;

        [Tooltip("Once a second, log what is being tracked.")]
        public bool logTracking = true;

        public IScannerFrameSource Frames { get; private set; }
        public ObjectDetectionManager Detector { get; private set; }
        public Object3DLocator Locator { get; private set; }
        public TrackedObjectManager Tracker { get; private set; }
        public ObjectVisualizer Visualizer { get; private set; }
        /// <summary>Detections in the last image that depth could not place (glass, too far, too dark).</summary>
        public int Unplaced { get; private set; }

        readonly List<LocatedObject> _located = new List<LocatedObject>(32);
        readonly StringBuilder _line = new StringBuilder(128);
        Func<Vector3, bool> _isInView;                                  // cached: a method group per inference would allocate a delegate each time
        Pose _viewPose;
        float _installedAt, _nextLook, _nextLog;

#if !CUTONCE_NO_SCANNER_AUTOBOOT
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void StartOnTheHeadset()
        {
            if (!Application.isEditor) Install();
        }
#endif

        /// <summary>Add the scanner to the running scene. Safe to call twice. Pass a frame source to override the default.</summary>
        public static ObjectScanner Install(IScannerFrameSource frames = null)
        {
            var existing = FindAnyObjectByType<ObjectScanner>();
            if (existing != null) return existing;

            var model = Resources.Load<ModelAsset>(ModelResource);
            var labels = Resources.Load<TextAsset>(LabelsResource);
            if (model == null || labels == null)
            {
                Debug.LogError($"[Scanner] Resources/{(model == null ? ModelResource : LabelsResource)} is missing from the build: no object detection.");
                return null;
            }

            var go = new GameObject("[Scanner]");
            DontDestroyOnLoad(go);
            var scanner = go.AddComponent<ObjectScanner>();
            scanner._installedAt = Time.unscaledTime;
            scanner._isInView = scanner.IsInView;
            scanner.Frames = frames ?? (Application.isEditor ? go.AddComponent<PhotoFrameSource>() : go.AddComponent<PassthroughFrameSource>());
            scanner.Tracker = new TrackedObjectManager();
            scanner.Visualizer = go.AddComponent<ObjectVisualizer>();
            scanner.Visualizer.Init(scanner.Tracker);
            scanner.Detector = go.AddComponent<ObjectDetectionManager>();
            scanner.Detector.Init(scanner.Frames, model, labels.text);
            scanner.Detector.Detected += scanner.OnDetected;
            return scanner;
        }

        void OnDetected(DetectionFrame frame)
        {
            if (!EnsureLocator(frame.CameraPose)) return;

            _located.Clear();
            for (int i = 0; i < frame.Objects.Count; i++)
                if (Locator.TryLocate(frame.Objects[i], frame.CameraPose, out LocatedObject located)) _located.Add(located);
            Unplaced = frame.Objects.Count - _located.Count;

            _viewPose = frame.CameraPose;
            Tracker.Observe(_located, frame.CapturedAt, _isInView);

            if (logTracking && Time.unscaledTime >= _nextLog) { _nextLog = Time.unscaledTime + 1f; Log(); }
        }

        bool IsInView(Vector3 worldPoint) => Frames.IsInView(worldPoint, _viewPose);

        /// <summary>
        /// Depth comes from the raycaster the app already has (CutOnceApp adds QuestSurfaceRaycaster). It is found through
        /// its interface because Device/ compiles into Assembly-CSharp, which an assembly definition cannot reference.
        /// In the Editor that raycaster always misses (no depth sensor), so a stand-in wall is used there instead.
        /// </summary>
        bool EnsureLocator(Pose cameraPose)
        {
            if (Locator != null) return true;
            ISurfaceRaycaster surface = Application.isEditor ? new FlatBackdropRaycaster(cameraPose) : FindTheAppsRaycaster();
            if (surface == null)
            {
                if (Time.unscaledTime - _installedAt < WaitForTheAppsRaycasterSeconds) return false;
                Debug.Log("[Scanner] No ISurfaceRaycaster in the scene (no CutOnceApp?): the scanner is using its own depth raycaster.");
                surface = gameObject.AddComponent<DepthSurfaceRaycaster>();
            }
            Locator = new Object3DLocator(Frames, surface);
            return true;
        }

        ISurfaceRaycaster FindTheAppsRaycaster()
        {
            if (Time.unscaledTime < _nextLook) return null;
            _nextLook = Time.unscaledTime + LookEverySeconds;
            foreach (var behaviour in FindObjectsByType<MonoBehaviour>(FindObjectsSortMode.None))
                if (behaviour is ISurfaceRaycaster found && !(behaviour is DepthSurfaceRaycaster)) return found;
            return null;
        }

        void Log()
        {
            _line.Clear().Append("[Scanner] Tracking ").Append(Tracker.ConfirmedCount).Append(" object(s)");
            if (Unplaced > 0) _line.Append(" (").Append(Unplaced).Append(" detection(s) had no depth)");
            _line.Append(':');
            foreach (var tracked in Tracker.Objects)
                if (tracked.IsConfirmed) _line.Append(' ').Append(tracked.ClassName).Append(" @ ").Append(tracked.SmoothedWorldPosition.ToString("0.00")).Append(';');
            Debug.Log(_line.ToString());
        }

        void OnDestroy()
        {
            if (Detector != null) Detector.Detected -= OnDetected;
        }
    }
}
