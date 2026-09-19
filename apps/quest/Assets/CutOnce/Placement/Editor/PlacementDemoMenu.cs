using CutOnce.Diagnostics;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace CutOnce.Placement.Editor
{
    public static class PlacementDemoMenu
    {
        public const string ScenePath = "Assets/CutOnce/Placement/PlacementDemo.unity";
        const string Menu = "Cut Once/Placement Demo/";

        [MenuItem(Menu + "Open demo scene", priority = 0)]
        public static void Open()
        {
            if (EditorApplication.isPlaying) { Debug.LogWarning("Stop Play mode before opening the demo."); return; }
            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            if (AssetDatabase.LoadAssetAtPath<SceneAsset>(ScenePath) != null)
            { EditorSceneManager.OpenScene(ScenePath); return; }
            Create();
        }

        public static void Create()
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>("Packages/com.meta.xr.sdk.core/Prefabs/OVRCameraRig.prefab");
            var rig = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
            rig.name = "[Rig]";
            if (!rig.TryGetComponent(out OVRManager manager)) manager = rig.AddComponent<OVRManager>();
            manager.isInsightPassthroughEnabled = true;
            manager.trackingOriginType = OVRManager.TrackingOrigin.FloorLevel;
            if (!rig.TryGetComponent(out OVRPassthroughLayer _)) rig.AddComponent<OVRPassthroughLayer>();
            foreach (var camera in rig.GetComponentsInChildren<Camera>(true))
            {
                camera.clearFlags = CameraClearFlags.SolidColor;
                camera.backgroundColor = Color.clear;
                camera.allowHDR = false;
            }
            new GameObject("[Budget]").AddComponent<BudgetProbe>();
            new GameObject("[Placement Demo]").AddComponent<PlacementDemo>();
            EditorSceneManager.SaveScene(scene, ScenePath);
        }

        static PlacementDemo Demo()
        {
            var demo = Object.FindFirstObjectByType<PlacementDemo>();
            if (!EditorApplication.isPlaying || demo == null || demo.Bindings == null)
            { Debug.LogWarning("Open the placement demo and press Play first."); return null; }
            return demo;
        }
        static void Select(int index)
        {
            var demo = Demo();
            if (demo != null) Selection.activeGameObject = demo.Source.objects[index].objectTransform.gameObject;
        }
        [MenuItem(Menu + "Select box 1", priority = 10)] static void SelectBox1() => Select(0);
        [MenuItem(Menu + "Select box 2", priority = 11)] static void SelectBox2() => Select(1);
        [MenuItem(Menu + "Select plank", priority = 12)] static void SelectPlank() => Select(2);
        [MenuItem(Menu + "Snap selected object to target", priority = 20)]
        static void SnapSelected()
        {
            var demo = Demo(); if (demo == null) return;
            for (int i = 0; i < demo.Source.objects.Length; i++)
                if (Selection.activeTransform == demo.Source.objects[i].objectTransform) { demo.Snap(i); return; }
            Debug.LogWarning("Use Placement Demo > Select box 1, box 2, or plank first.");
        }
        [MenuItem(Menu + "Toggle selected object tracking", priority = 21)]
        static void ToggleTracking()
        {
            var demo = Demo(); if (demo == null) return;
            foreach (var entry in demo.Source.objects)
                if (Selection.activeTransform == entry.objectTransform) { entry.tracked = !entry.tracked; return; }
            Debug.LogWarning("Select a simulated object first.");
        }
        [MenuItem(Menu + "Snap all objects to targets", priority = 22)]
        static void SnapAll() { var demo = Demo(); if (demo != null) for (int i = 0; i < 3; i++) demo.Snap(i); }
        [MenuItem(Menu + "Reset demo", priority = 23)]
        static void Reset() { var demo = Demo(); if (demo != null) demo.ResetDemo(); }
        [MenuItem(Menu + "Print placement status", priority = 24)]
        static void Status()
        {
            var demo = Demo(); if (demo == null) return;
            foreach (var b in demo.Bindings)
                Debug.Log($"[Placement] {b.objectId}: {b.State}; distance {b.PositionError:F3} m; angle {b.RotationError:F1} deg; hold {b.HoldProgress:P0}");
        }
    }
}
