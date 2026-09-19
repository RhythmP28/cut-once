using System.Collections.Generic;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

/// <summary>
/// Headless smoke test: enters play mode on the RoomSense scene, lets MRUK load the mock room and
/// RoomGlow build its overlay, then reports what got built. Proves the code path without a headset.
/// </summary>
public static class RoomSensePlayTest
{
    const string ScenePath = "Assets/Scenes/RoomSenseTest.unity";
    static readonly List<string> Captured = new();
    static double _deadline;
    static bool _sawPlaying;

    public static void Run()
    {
        // Statics must survive the play-mode transition for the tick loop to keep running.
        EditorSettings.enterPlayModeOptionsEnabled = true;
        EditorSettings.enterPlayModeOptions =
            EnterPlayModeOptions.DisableDomainReload | EnterPlayModeOptions.DisableSceneReload;

        EditorSceneManager.OpenScene(ScenePath);
        Application.logMessageReceived += Capture;
        _deadline = EditorApplication.timeSinceStartup + 30.0;
        EditorApplication.update += Tick;
        EditorApplication.EnterPlaymode();
    }

    static void Capture(string condition, string stack, LogType type)
    {
        if (condition.Contains("[RoomGlow]") || type == LogType.Exception)
            Captured.Add($"{type}: {condition}");
    }

    /// <summary>Aim at objects whose position we know in HackDesk.json and check what comes back.</summary>
    static bool ProbeGaze()
    {
        var gaze = Object.FindFirstObjectByType<CutOnce.RoomSense.GazeInspector>();
        if (gaze == null) { System.Console.WriteLine("gaze: COMPONENT MISSING"); return false; }

        var eye = Camera.main != null ? Camera.main.transform.position : new Vector3(0f, 1.5f, -0.1f);
        var probes = new (string what, Vector3 at, string expect)[]
        {
            ("bottle on desk",  new Vector3(-0.45f, 0.86f, -1.20f), "Bottle"),
            ("mug on desk",     new Vector3(-0.15f, 0.80f, -1.45f), "Cup"),
            ("bottle on floor", new Vector3( 1.35f, 0.11f, -1.10f), "Bottle"),
            ("the desk itself", new Vector3( 0.00f, 0.73f, -1.35f), "Desk"),
        };

        var ok = true;
        foreach (var (what, at, expect) in probes)
        {
            var hit = gaze.Inspect(new Ray(eye, (at - eye).normalized));
            if (hit == null) { System.Console.WriteLine($"  gaze {what}: NOTHING (expected {expect})"); ok = false; continue; }
            var t = hit.Value;
            var pass = t.name == expect;
            ok &= pass;
            System.Console.WriteLine($"  gaze {what}: \"{t.name}\" {Mathf.RoundToInt(t.worldSize.x * 100)}x{Mathf.RoundToInt(t.worldSize.y * 100)}x{Mathf.RoundToInt(t.worldSize.z * 100)}cm, {t.triangleCount} tris  {(pass ? "OK" : "EXPECTED " + expect)}");
        }

        // Force the fused-scan path a real Quest usually produces: no island is small enough to be
        // an object, so it must carve a patch around the gaze point instead.
        var wasThreshold = gaze.islandIsObjectBelow;
        gaze.islandIsObjectBelow = 0.0001f;
        var fused = gaze.Inspect(new Ray(eye, (new Vector3(-0.45f, 0.86f, -1.20f) - eye).normalized));
        gaze.islandIsObjectBelow = wasThreshold;
        if (fused == null) { System.Console.WriteLine("  gaze fused-scan fallback: NOTHING"); ok = false; }
        else
        {
            var big = fused.Value.worldSize.magnitude > gaze.fallbackRadius * 4f;
            ok &= !big;
            System.Console.WriteLine($"  gaze fused-scan fallback: carved {fused.Value.triangleCount} tris, {fused.Value.worldSize.magnitude:F2}m across  {(big ? "TOO BIG" : "OK")}");
        }
        return ok;
    }

    static void Tick()
    {
        if (EditorApplication.isPlaying) _sawPlaying = true;

        // Overlay is built on MRUK's scene-loaded callback; give it real frames, then report.
        var done = _sawPlaying && Captured.Count > 0;
        if (!done && EditorApplication.timeSinceStartup < _deadline) return;

        EditorApplication.update -= Tick;
        Application.logMessageReceived -= Capture;

        System.Console.WriteLine("===== ROOMSENSE SMOKE TEST =====");
        System.Console.WriteLine(_sawPlaying ? "play mode: entered" : "play mode: NEVER ENTERED");
        var glow = Object.FindFirstObjectByType<CutOnce.RoomSense.RoomGlow>();
        System.Console.WriteLine("RoomGlow in scene: " + (glow != null));
        if (glow != null) System.Console.WriteLine("glowMaterial: " + (glow.glowMaterial != null ? glow.glowMaterial.shader.name : "NULL"));
        foreach (var line in Captured) System.Console.WriteLine("  " + line);
        var overlays = 0;
        foreach (var go in Object.FindObjectsByType<MeshRenderer>(FindObjectsSortMode.None))
            if (go.name.StartsWith("[RoomGlow]")) overlays++;
        System.Console.WriteLine("glowing surfaces in hierarchy: " + overlays);
        foreach (var mf in Object.FindObjectsByType<MeshFilter>(FindObjectsSortMode.None))
        {
            if (!mf.name.StartsWith("[RoomGlow] scene mesh")) continue;
            var m = mf.sharedMesh;
            System.Console.WriteLine(m == null
                ? "scene mesh: NULL"
                : $"scene mesh: {m.vertexCount} verts, {m.triangles.Length / 3} tris, bounds size {m.bounds.size}");
        }
        var gazeOk = ProbeGaze();
        System.Console.WriteLine("===== END SMOKE TEST =====");

        EditorApplication.Exit(_sawPlaying && overlays > 0 && gazeOk ? 0 : 1);
    }
}
