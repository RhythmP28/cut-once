using System.Linq;
using CutOnce.Device;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace CutOnce.DeviceEditor
{
    /// <summary>
    /// Builds Assets/CutOnce/Scenes/Main.unity from code, the same way QuestBaselineScene builds its scene: a Meta camera
    /// rig with passthrough beneath a transparent eye buffer, plus one CutOnceApp. Scenes made by hand drift between
    /// machines; a scene made by a script is reviewable and can be rebuilt after an SDK upgrade.
    /// </summary>
    public static class MainSceneBuilder
    {
        public const string ScenePath = "Assets/CutOnce/Scenes/Main.unity";
        const string CameraRigPrefab = "Packages/com.meta.xr.sdk.core/Prefabs/OVRCameraRig.prefab";

        [MenuItem("Cut Once/Rebuild main scene", priority = 10)]
        public static void CreateFromMenu()
        {
            if (EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) Create();
        }

        public static void Create()
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var rig = (GameObject)PrefabUtility.InstantiatePrefab(AssetDatabase.LoadAssetAtPath<GameObject>(CameraRigPrefab));
            rig.name = "[Rig]";
            if (!rig.TryGetComponent(out OVRManager manager)) manager = rig.AddComponent<OVRManager>();
            manager.isInsightPassthroughEnabled = true;
            manager.trackingOriginType = OVRManager.TrackingOrigin.FloorLevel;     // placement falls back to the floor plane at y = 0
            if (!rig.TryGetComponent(out OVRPassthroughLayer _)) rig.AddComponent<OVRPassthroughLayer>();
            foreach (var eye in rig.GetComponentsInChildren<Camera>(true))
            {
                eye.clearFlags = CameraClearFlags.SolidColor;                      // passthrough shows wherever the eye buffer stays transparent
                eye.backgroundColor = Color.clear;
            }

            new GameObject("[App]").AddComponent<CutOnceApp>();

            if (!AssetDatabase.IsValidFolder("Assets/CutOnce/Scenes")) AssetDatabase.CreateFolder("Assets/CutOnce", "Scenes");
            EditorSceneManager.SaveScene(scene, ScenePath);

            var scenes = EditorBuildSettings.scenes.Where(s => s.path != ScenePath).ToList();
            scenes.Insert(0, new EditorBuildSettingsScene(ScenePath, true));       // first scene = the one the headset starts in
            EditorBuildSettings.scenes = scenes.ToArray();
            Debug.Log("[CutOnce] Wrote " + ScenePath + " and made it the first scene in the build.");
        }
    }
}
