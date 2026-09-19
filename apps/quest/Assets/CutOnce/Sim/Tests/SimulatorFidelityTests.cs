using System;
using System.Collections;
using System.IO;
using CutOnce.Diagnostics;
using Meta.XR;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.XR;
using UnityEngine.XR.Management;

namespace CutOnce.Sim.Tests
{
    /// <summary>
    /// Runs the baseline scene in Meta XR Simulator and records what the simulator really provides on this machine,
    /// rather than what the docs say: the device profile, eye buffer, field of view and refresh rate, whether
    /// passthrough runs, whether the passthrough camera delivers frames (and with which lens pose and focal length),
    /// and the draw calls and triangles against the Quest 3 budget. Writes Logs/cli/sim/sim-report.json and the
    /// camera photo the copilot would receive. Run with `pnpm quest:sim`; skipped when the simulator is not active.
    /// </summary>
    public class SimulatorFidelityTests
    {
        const string ScenePath = "Assets/CutOnce/Scenes/QuestBaseline.unity";

        [Serializable]
        public class Report
        {
            public string runtime, headset, xrDevice;
            public int eyeWidth, eyeHeight;
            public float refreshHz;
            public float fovLeftDeg, fovRightDeg, fovUpDeg, fovDownDeg; // left eye, from its projection matrix
            public bool passthrough;
            public bool cameraSupported, cameraPlaying, cameraFrame;
            public Vector2Int cameraResolution;
            public Vector2 cameraFocalLength, cameraPrincipalPoint;
            public Vector3 cameraLensOffset;
            public int drawCalls, triangles;
            public string cameraPhoto;
        }

        static string OutDir => Path.GetFullPath(Path.Combine(Application.dataPath, "..", "Logs", "cli", "sim"));

        [UnityTest, Timeout(300000)]
        public IEnumerator TheSimulatorStandsInForAQuest3()
        {
            string runtime = Environment.GetEnvironmentVariable("XR_SELECTED_RUNTIME_JSON") ?? Environment.GetEnvironmentVariable("XR_RUNTIME_JSON") ?? "";
            if (!runtime.Contains("MetaXRSimulator"))
                Assert.Ignore("Meta XR Simulator is not the OpenXR runtime. Run `pnpm quest:sim`, or Meta > Meta XR Simulator > Activate.");
            // Unity's Metal backend logs engine asserts under XR on a Mac; the facts are checked below instead.
            LogAssert.ignoreFailingMessages = true;
            Directory.CreateDirectory(OutDir);
            var report = new Report { runtime = runtime };

#if UNITY_EDITOR
            yield return UnityEditor.SceneManagement.EditorSceneManager.LoadSceneAsyncInPlayMode(ScenePath, new LoadSceneParameters(LoadSceneMode.Single));
#endif
            yield return WaitFor(() => XRGeneralSettings.Instance != null && XRGeneralSettings.Instance.Manager.activeLoader != null && XRSettings.isDeviceActive, 120); // the first run in a session can take 40 s
            Assert.That(XRSettings.isDeviceActive, "XR did not start in the simulator");
            yield return new WaitForSeconds(3); // let tracking, passthrough and the budget window settle

            report.headset = OVRPlugin.GetSystemHeadsetType().ToString();
            report.xrDevice = XRSettings.loadedDeviceName;
            report.eyeWidth = XRSettings.eyeTextureWidth;
            report.eyeHeight = XRSettings.eyeTextureHeight;
            report.refreshHz = OVRPlugin.systemDisplayFrequency;
            var eye = Camera.main;
            if (eye != null && eye.stereoEnabled)
            {
                var p = eye.GetStereoProjectionMatrix(Camera.StereoscopicEye.Left);
                report.fovLeftDeg = Mathf.Atan((1 - p.m02) / p.m00) * Mathf.Rad2Deg;
                report.fovRightDeg = Mathf.Atan((1 + p.m02) / p.m00) * Mathf.Rad2Deg;
                report.fovDownDeg = Mathf.Atan((1 - p.m12) / p.m11) * Mathf.Rad2Deg;
                report.fovUpDeg = Mathf.Atan((1 + p.m12) / p.m11) * Mathf.Rad2Deg;
            }
            report.passthrough = OVRManager.IsInsightPassthroughInitialized();

            var probe = UnityEngine.Object.FindAnyObjectByType<BudgetProbe>();
            if (probe != null) { report.drawCalls = probe.drawCalls; report.triangles = probe.triangles; }

            // The copilot's photo, through the same component the headset uses.
            report.cameraSupported = PassthroughCameraAccess.IsSupported;
            // The lens geometry arrives as soon as the camera starts, pixels only with the first image. On macOS the
            // simulator (v205) sends no pixels while a room is connected, and Meta's checkerboard without one.
            var camera = new GameObject("[Sim probe camera]").AddComponent<PassthroughCameraAccess>();
            yield return WaitFor(() => camera.Intrinsics.FocalLength != Vector2.zero, 15);
            report.cameraResolution = camera.CurrentResolution;
            report.cameraFocalLength = camera.Intrinsics.FocalLength;
            report.cameraPrincipalPoint = camera.Intrinsics.PrincipalPoint;
            report.cameraLensOffset = camera.Intrinsics.LensOffset.position;
            yield return WaitFor(() => camera.IsPlaying && camera.IsUpdatedThisFrame, 15);
            report.cameraPlaying = camera.IsPlaying;
            report.cameraFrame = camera.IsPlaying && camera.IsUpdatedThisFrame;
            if (report.cameraFrame && camera.GetTexture() is Texture2D photo)
            {
                report.cameraPhoto = Path.Combine(OutDir, "camera-frame.jpg");
                File.WriteAllBytes(report.cameraPhoto, photo.EncodeToJPG(85));
            }
            UnityEngine.Object.Destroy(camera.gameObject);

            File.WriteAllText(Path.Combine(OutDir, "sim-report.json"), JsonUtility.ToJson(report, true));
            Debug.Log("[CutOnce] simulator report: " + JsonUtility.ToJson(report));

            // Every gap at once, so one run says everything the simulator is missing on this machine.
            var gaps = new System.Collections.Generic.List<string>();
            if (!report.headset.Contains("Quest_3")) gaps.Add($"the simulator is not using the Quest 3 device profile ({report.headset})");
            if (!report.passthrough) gaps.Add("passthrough did not start: no room is loaded in the simulator");
            if (report.cameraFocalLength == Vector2.zero) gaps.Add("the passthrough camera did not start, so the copilot's projection cannot be tested");
            if (!report.cameraFrame) Debug.LogWarning("[CutOnce] the passthrough camera sent no pixels (a known simulator limit on macOS with a room connected)");
            if (report.drawCalls > QuestBudgets.MaxDrawCalls) gaps.Add($"{report.drawCalls} draw calls, over the Quest 3 budget of {QuestBudgets.MaxDrawCalls}");
            if (report.triangles > QuestBudgets.MaxTriangles) gaps.Add($"{report.triangles} triangles, over the Quest 3 budget of {QuestBudgets.MaxTriangles}");
            Assert.That(gaps, Is.Empty, string.Join("\n", gaps));
        }

        static IEnumerator WaitFor(Func<bool> done, float seconds)
        {
            float until = Time.realtimeSinceStartup + seconds;
            while (!done() && Time.realtimeSinceStartup < until) yield return null;
        }
    }
}
