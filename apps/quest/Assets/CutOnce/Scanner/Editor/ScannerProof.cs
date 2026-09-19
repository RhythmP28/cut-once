using System;
using System.IO;
using System.Text;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace CutOnce.Scanner.Editor
{
    /// <summary>
    /// Proof that the scanner runs, with no headset: the real model and the real pipeline (detect, locate, track, show)
    /// on a stored photo, with a flat wall standing in for depth. It plays an empty scene, installs the scanner, waits for a few inferences, and writes what was found
    /// to Logs/scanner-proof.json and the photo with the boxes drawn on it to Logs/scanner-proof.png.
    ///
    ///   Unity -batchmode -projectPath apps/quest -executeMethod CutOnce.Scanner.Editor.ScannerProof.Run
    ///
    /// (No -nographics: texture-to-tensor conversion needs a graphics device.) The photo is StreamingAssets/frame_0001.jpg,
    /// or the path in the CUTONCE_SCANNER_PHOTO environment variable. Exit code 0 means at least one object was detected.
    /// </summary>
    public static class ScannerProof
    {
        const int InferencesToWaitFor = 8;          // enough for objects to be seen three times running and confirmed
        const double GiveUpAfterSeconds = 120;
        static double _deadline;
        static ObjectScanner _scanner;
        static bool _sawPlaying;

        [MenuItem("Cut Once/Scanner/Detect objects in the fixture photo")]
        public static void Run()
        {
            EditorSettings.enterPlayModeOptionsEnabled = true;      // statics must survive entering play mode for Tick to keep running
            EditorSettings.enterPlayModeOptions = EnterPlayModeOptions.DisableDomainReload | EnterPlayModeOptions.DisableSceneReload;
            EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
            _scanner = null; _sawPlaying = false;
            _deadline = EditorApplication.timeSinceStartup + GiveUpAfterSeconds;
            EditorApplication.update += Tick;
            EditorApplication.EnterPlaymode();
        }

        static void Tick()
        {
            if (!EditorApplication.isPlaying) { if (_sawPlaying || EditorApplication.timeSinceStartup > _deadline) Finish(false, "play mode ended early"); return; }
            _sawPlaying = true;
            if (_scanner == null)
            {
                string photo = Environment.GetEnvironmentVariable("CUTONCE_SCANNER_PHOTO");
                PhotoFrameSource source = null;
                if (!string.IsNullOrEmpty(photo))
                {
                    var holder = new GameObject("[Scanner] proof photo");
                    holder.SetActive(false);                       // set the path before Awake loads it
                    source = holder.AddComponent<PhotoFrameSource>();
                    source.photo = photo;
                    holder.SetActive(true);
                }
                _scanner = ObjectScanner.Install(source);
                if (_scanner == null) { Finish(false, "ObjectScanner.Install returned null (model or labels missing from Resources)"); return; }
            }
            var detector = _scanner.Detector;
            if (detector.Inferences < InferencesToWaitFor && EditorApplication.timeSinceStartup < _deadline) return;
            bool detecting = detector.Inferences >= InferencesToWaitFor && detector.Latest.Objects.Count > 0;
            bool tracking = _scanner.Tracker.ConfirmedCount > 0 && _scanner.Visualizer.Count == _scanner.Tracker.ConfirmedCount;
            Finish(detecting && tracking, detector.Inferences == 0 ? "no inference completed: " + (detector.Status ?? "unknown")
                : !detecting ? "nothing was detected" : !tracking ? $"detections did not become tracked, visible objects ({_scanner.Tracker.ConfirmedCount} confirmed, {_scanner.Visualizer.Count} visuals)" : null);
        }

        static void Finish(bool ok, string problem)
        {
            EditorApplication.update -= Tick;
            var report = new StringBuilder("===== SCANNER PROOF =====\n");
            if (problem != null) report.AppendLine("PROBLEM: " + problem);
            if (_scanner != null && _scanner.Detector != null)
            {
                var detector = _scanner.Detector;
                var frame = detector.Latest;
                report.AppendLine($"backend: {detector.backend} | inferences: {detector.Inferences} | last: {frame.InferenceMs:0} ms | image: {frame.ImageSize.x}x{frame.ImageSize.y} | candidates: {frame.Candidates}");
                foreach (var found in frame.Objects)
                    report.AppendLine($"Detected: {found.ClassName} {found.Confidence:0.00}   (class {found.ClassId}, centre pixel {found.CenterPixel.x},{found.CenterPixel.y}, viewport box {found.Box.xMin:0.00},{found.Box.yMin:0.00} to {found.Box.xMax:0.00},{found.Box.yMax:0.00})");
                report.AppendLine($"tracked: {_scanner.Tracker.ConfirmedCount} confirmed of {_scanner.Tracker.Objects.Count} | visuals in the scene: {_scanner.Visualizer.Count} | detections with no depth: {_scanner.Unplaced}");
                foreach (var tracked in _scanner.Tracker.Objects)
                    report.AppendLine($"Tracked: #{tracked.Id} {tracked.ClassName.ToUpperInvariant()}  {(tracked.IsConfirmed ? "shown" : "candidate")}  seen {tracked.TotalHits}x  at {tracked.SmoothedWorldPosition.ToString("0.00")}  size {tracked.WorldSize.x:0.00} x {tracked.WorldSize.y:0.00} m");
                try { WriteArtifacts(frame); report.AppendLine("wrote Logs/scanner-proof.json and Logs/scanner-proof.png"); }
                catch (Exception e) { report.AppendLine("could not write the artifacts: " + e.Message); }
            }
            report.AppendLine(ok ? "RESULT: detecting, locating, tracking and showing objects" : "RESULT: FAILED");
            report.Append("===== END SCANNER PROOF =====");
            Console.WriteLine(report.ToString());
            Debug.Log(report.ToString());
            if (Application.isBatchMode) EditorApplication.Exit(ok ? 0 : 1);
            else if (EditorApplication.isPlaying) EditorApplication.ExitPlaymode();
        }

        static void WriteArtifacts(DetectionFrame frame)
        {
            Directory.CreateDirectory("Logs");
            var json = new StringBuilder("{\"image\":[" + frame.ImageSize.x + "," + frame.ImageSize.y + "],\"detections\":[");
            for (int i = 0; i < frame.Objects.Count; i++)
            {
                var found = frame.Objects[i];
                // pixel box, origin top-left, for any image tool to draw
                int left = Mathf.RoundToInt(found.Box.xMin * frame.ImageSize.x), right = Mathf.RoundToInt(found.Box.xMax * frame.ImageSize.x);
                int top = Mathf.RoundToInt((1f - found.Box.yMax) * frame.ImageSize.y), bottom = Mathf.RoundToInt((1f - found.Box.yMin) * frame.ImageSize.y);
                json.Append(i == 0 ? "" : ",").Append($"{{\"class\":\"{found.ClassName}\",\"id\":{found.ClassId},\"confidence\":{found.Confidence.ToString("0.000", System.Globalization.CultureInfo.InvariantCulture)},\"box\":[{left},{top},{right},{bottom}]}}");
            }
            File.WriteAllText("Logs/scanner-proof.json", json.Append("]}").ToString());

            if (!(_scanner.Frames is PhotoFrameSource photo) || photo.Texture == null) return;
            var canvas = new Texture2D(photo.Texture.width, photo.Texture.height, TextureFormat.RGBA32, false);
            canvas.SetPixels32(photo.Texture.GetPixels32());
            var blue = new Color32(40, 170, 255, 255);
            foreach (var found in frame.Objects) Outline(canvas, found.Box, blue, Mathf.Max(2, canvas.width / 320));
            canvas.Apply(false);
            File.WriteAllBytes("Logs/scanner-proof.png", canvas.EncodeToPNG());
            UnityEngine.Object.DestroyImmediate(canvas);
        }

        /// <summary>Texture pixels and the viewport share an origin (bottom-left), so a viewport box draws without a flip.</summary>
        static void Outline(Texture2D canvas, Rect viewportBox, Color32 colour, int thickness)
        {
            int x0 = Mathf.Clamp(Mathf.RoundToInt(viewportBox.xMin * canvas.width), 0, canvas.width - 1), x1 = Mathf.Clamp(Mathf.RoundToInt(viewportBox.xMax * canvas.width), 0, canvas.width - 1);
            int y0 = Mathf.Clamp(Mathf.RoundToInt(viewportBox.yMin * canvas.height), 0, canvas.height - 1), y1 = Mathf.Clamp(Mathf.RoundToInt(viewportBox.yMax * canvas.height), 0, canvas.height - 1);
            for (int t = 0; t < thickness; t++)
            {
                for (int x = x0; x <= x1; x++) { canvas.SetPixel(x, Mathf.Min(y0 + t, y1), colour); canvas.SetPixel(x, Mathf.Max(y1 - t, y0), colour); }
                for (int y = y0; y <= y1; y++) { canvas.SetPixel(Mathf.Min(x0 + t, x1), y, colour); canvas.SetPixel(Mathf.Max(x1 - t, x0), y, colour); }
            }
        }
    }
}
