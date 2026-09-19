using Meta.XR.MRUtilityKit;
using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace CutOnce.RoomSense
{
    /// <summary>
    /// Editor-only testing aid: press N to load the next scanned room. MRUK ships eight real scans
    /// (offices, bedrooms, living rooms) with wildly different amounts of clutter, which is the
    /// closest thing to trying the glow in someone else's room without a headset.
    ///
    /// Loading fires MRUK's scene-loaded event, which RoomGlow is already subscribed to, so the
    /// overlay rebuilds itself for the new room with no extra wiring.
    /// </summary>
    public class RoomCycler : MonoBehaviour
    {
        [Tooltip("Scanned rooms to cycle through. Filled in by RoomSenseSetup with MRUK's bundled scans.")]
        public TextAsset[] rooms;

        private int _index;

        private void Update()
        {
            if (NextPressed()) Next();
        }

        public async void Next()
        {
            if (rooms == null || rooms.Length == 0) return;
            _index = (_index + 1) % rooms.Length;
            var room = rooms[_index];
            Debug.Log($"[RoomCycler] loading {room.name} ({_index + 1}/{rooms.Length})");
            await MRUK.Instance.LoadSceneFromJsonString(room.text);
        }

        /// <summary>Works whichever input backend the project is set to.</summary>
        private static bool NextPressed()
        {
#if ENABLE_INPUT_SYSTEM
            return Keyboard.current != null && Keyboard.current.nKey.wasPressedThisFrame;
#else
            return Input.GetKeyDown(KeyCode.N);
#endif
        }
    }
}
