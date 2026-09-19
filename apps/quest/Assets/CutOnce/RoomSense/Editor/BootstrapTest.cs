using CutOnce.RoomSense;
using Meta.XR.MRUtilityKit;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

/// <summary>
/// The claim is "run the app and the room glows" — so test exactly that: an EMPTY scene, like
/// Main.unity is today, with nothing wired. Nothing but RuntimeInitializeOnLoadMethod should run.
/// </summary>
public static class BootstrapTest
{
    static double _deadline;
    static bool _sawPlaying;

    public static void Run()
    {
        EditorSettings.enterPlayModeOptionsEnabled = true;
        EditorSettings.enterPlayModeOptions =
            EnterPlayModeOptions.DisableDomainReload | EnterPlayModeOptions.DisableSceneReload;

        // A bare scene with just a camera: no MRUK, no RoomGlow, nothing wired. Like theirs.
        var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
        EditorSceneManager.SaveScene(scene, "Assets/Scenes/EmptyBootstrapTest.unity");

        _deadline = EditorApplication.timeSinceStartup + 25.0;
        EditorApplication.update += Tick;
        EditorApplication.EnterPlaymode();
    }

    static void Tick()
    {
        if (EditorApplication.isPlaying) _sawPlaying = true;
        var glow = Object.FindFirstObjectByType<RoomGlow>();
        if (!_sawPlaying || (glow == null && EditorApplication.timeSinceStartup < _deadline)) return;

        EditorApplication.update -= Tick;

        var mruk = Object.FindFirstObjectByType<MRUK>();
        var gaze = Object.FindFirstObjectByType<GazeInspector>();

        System.Console.WriteLine("===== BOOTSTRAP TEST (empty scene) =====");
        System.Console.WriteLine("play mode: " + (_sawPlaying ? "entered" : "NEVER ENTERED"));
        System.Console.WriteLine("MRUK auto-created: " + (mruk != null));
        if (mruk != null) System.Console.WriteLine("  data source: " + mruk.SceneSettings.DataSource);
        System.Console.WriteLine("RoomGlow auto-created: " + (glow != null));
        System.Console.WriteLine("  material: " + (glow != null && glow.glowMaterial != null ? glow.glowMaterial.shader.name : "NULL"));
        System.Console.WriteLine("GazeInspector auto-created: " + (gaze != null));
        System.Console.WriteLine("===== END BOOTSTRAP TEST =====");

        var ok = _sawPlaying && mruk != null && glow != null && glow.glowMaterial != null && gaze != null;
        EditorApplication.Exit(ok ? 0 : 1);
    }
}
