using CutOnce.RoomSense;
using Meta.XR.MRUtilityKit;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

/// <summary>Builds the RoomSense test scene headlessly: mock room + glow material + RoomGlow.</summary>
public static class RoomSenseSetup
{
    const string MatPath = "Assets/CutOnce/RoomSense/SheikahGlow.mat";
    const string ScenePath = "Assets/Scenes/RoomSenseTest.unity";
    const string PkgRooms = "Packages/com.meta.xr.mrutilitykit/Core/Rooms/Json";
    // HackDesk first: our own synthesised scan, a desk buried in water bottles and tools, where
    // none of the small objects are labelled anchors — they can only glow via the global mesh.
    // Then MRUK's eight real scans, most cluttered first, as a reality check.
    static readonly string[] Rooms =
    {
        "Assets/CutOnce/RoomSense/MockRooms/HackDesk.json",
        PkgRooms + "/MeshLivingRoom2.json", PkgRooms + "/MeshOffice2.json",
        PkgRooms + "/MeshBedroom2.json", PkgRooms + "/MeshBedroom3.json",
        PkgRooms + "/MeshBedroom1.json", PkgRooms + "/MeshLivingRoom3.json",
        PkgRooms + "/MeshLivingRoom1.json", PkgRooms + "/MeshOffice1.json",
    };

    /// <summary>Open the RoomSense scene and start play mode, so launching the editor just shows it.</summary>
    public static void OpenAndPlay()
    {
        EditorSceneManager.OpenScene(ScenePath);
        EditorApplication.EnterPlaymode();
    }

    public static void Build()
    {
        var shader = Shader.Find("CutOnce/SheikahGlow");
        if (shader == null) { Debug.LogError("[Setup] shader CutOnce/SheikahGlow not found"); EditorApplication.Exit(1); return; }
        var mat = new Material(shader);
        AssetDatabase.CreateAsset(mat, MatPath);

        var jsons = new System.Collections.Generic.List<TextAsset>();
        foreach (var path in Rooms)
        {
            var asset = AssetDatabase.LoadAssetAtPath<TextAsset>(path);
            if (asset != null) jsons.Add(asset);
            else Debug.LogWarning("[Setup] missing mock room: " + path);
        }
        if (jsons.Count == 0) { Debug.LogError("[Setup] no mock rooms found"); EditorApplication.Exit(1); return; }

        var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);

        var mrukGo = new GameObject("MRUK");
        var mruk = mrukGo.AddComponent<MRUK>();
        mruk.SceneSettings = new MRUK.MRUKSettings
        {
            DataSource = MRUK.SceneDataSource.Json,
            SceneJsons = jsons.ToArray(),
            RoomIndex = 0,
            LoadSceneOnStartup = true,
        };

        var glowGo = new GameObject("RoomSense");
        var glow = glowGo.AddComponent<RoomGlow>();
        glow.glowMaterial = AssetDatabase.LoadAssetAtPath<Material>(MatPath);
        glowGo.AddComponent<RoomCycler>().rooms = jsons.ToArray();
        glowGo.AddComponent<GazeInspector>();

        // Put the camera inside the room so the reveal pulse starts where a head would be.
        if (Camera.main != null)
        {
            Camera.main.transform.position = new Vector3(0f, 1.5f, -0.1f);
            Camera.main.transform.rotation = Quaternion.Euler(12f, 180f, 0f); // facing the desk
        }

        EditorSceneManager.SaveScene(scene, ScenePath);
        EditorSceneManager.SaveOpenScenes();
        EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
        AssetDatabase.SaveAssets();
        Debug.Log($"[Setup] scene built at {ScenePath} with {jsons.Count} scanned rooms; press N in play mode to cycle.");
    }
}
