using Meta.XR.MRUtilityKit;
using UnityEngine;

namespace CutOnce.RoomSense
{
    /// <summary>
    /// Makes RoomSense work by simply running the app: no scene wiring, nothing to remember.
    ///
    /// Main.unity has no MRUK in it, and adding one would mean editing a scene several people
    /// touch — a guaranteed merge conflict. So this installs the room scan, the glow and the gaze
    /// inspector at startup instead, and does nothing if a RoomGlow is already in the scene.
    ///
    /// The material is loaded from Resources on purpose: a shader referenced only through
    /// Shader.Find can be stripped from a player build, and a stripped shader means a pink room.
    ///
    /// It is background polish, not the main act, so it does NOT start by itself: a whole-room transparent mesh is a lot of
    /// fill rate to spend while YOLO is running. Define ROOMSENSE_AUTOBOOT to start it with the app, or call Install().
    /// </summary>
    public static class RoomSenseBootstrap
    {
        public const string MaterialResource = "SheikahGlow";

#if ROOMSENSE_AUTOBOOT
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void AutoBoot() => Install();
#endif

        /// <summary>Install the overlay. Safe to call twice; the second call is a no-op.</summary>
        public static GameObject Install(bool withGazeInspector = false)
        {
            if (Object.FindFirstObjectByType<RoomGlow>() != null) return null;

            if (Object.FindFirstObjectByType<MRUK>() == null)
            {
                var mrukGo = new GameObject("[RoomSense] MRUK");
                var mruk = mrukGo.AddComponent<MRUK>();
                mruk.SceneSettings = new MRUK.MRUKSettings
                {
                    DataSource = MRUK.SceneDataSource.Device,   // the real scan from Space Setup
                    LoadSceneOnStartup = true,
                    RoomPrefabs = new GameObject[0],
                    SceneJsons = new TextAsset[0],
                };
                Object.DontDestroyOnLoad(mrukGo);
            }

            var go = new GameObject("[RoomSense]");
            var glow = go.AddComponent<RoomGlow>();
            glow.glowMaterial = Resources.Load<Material>(MaterialResource);
            if (glow.glowMaterial == null)
                Debug.LogError($"[RoomSense] Resources/{MaterialResource}.mat is missing — nothing will render.");
            // No GazeInspector by default: it names things by measuring them, and the object scanner (CutOnce.Scanner, YOLO on
            // the passthrough camera) now names things by seeing them. Two label systems on one desk is one too many.
            if (withGazeInspector) go.AddComponent<GazeInspector>();
            Object.DontDestroyOnLoad(go);

            Debug.Log("[RoomSense] installed: room glow" + (withGazeInspector ? " + gaze inspector." : "."));
            return go;
        }
    }
}
