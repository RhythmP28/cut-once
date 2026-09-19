using Unity.InferenceEngine;
using UnityEngine;

namespace CutOnce.Scanner
{
    /// <summary>
    /// The object scanner, assembled in code like the rest of the app (CutOnceApp builds everything at runtime so there
    /// are no prefab or Inspector references to drift, and Main.unity has one owner who is not us).
    ///
    /// On the headset it starts by itself and reads the passthrough camera. In the Editor nothing starts by itself,
    /// so the team's PlayMode tests and scenes are left exactly as they were: call Install() (or use
    /// Cut Once > Scanner) and it runs on a stored photo instead.
    /// Define CUTONCE_NO_SCANNER_AUTOBOOT to stop the headset auto-start.
    /// </summary>
    public sealed class ObjectScanner : MonoBehaviour
    {
        /// <summary>Resources paths. The model is Meta's yolov9sentis.sentis; the labels are the 80 COCO names in its class order.</summary>
        public const string ModelResource = "CutOnce/Scanner/yolov9sentis", LabelsResource = "CutOnce/Scanner/coco-labels";

        public ObjectDetectionManager Detector { get; private set; }
        public IScannerFrameSource Frames { get; private set; }

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
            scanner.Frames = frames ?? (Application.isEditor ? go.AddComponent<PhotoFrameSource>() : go.AddComponent<PassthroughFrameSource>());
            scanner.Detector = go.AddComponent<ObjectDetectionManager>();
            scanner.Detector.Init(scanner.Frames, model, labels.text);
            return scanner;
        }
    }
}
