using System.Collections.Generic;
using Meta.XR.MRUtilityKit;
using UnityEngine;

namespace CutOnce.RoomSense
{
    /// <summary>
    /// The "scan the room" effect: every surface the Quest knows about — walls, floor, ceiling,
    /// tables, couches, storage — rendered as a glowing blue overlay, revealed by a pulse that
    /// expands from the player like a sonar ping.
    ///
    /// There is deliberately NO machine learning here. Space Setup already gives us labelled,
    /// positioned geometry for the whole room through MRUK; rendering it is free, instant and
    /// deterministic, which is what a live demo wants. ML (QuestCameraKit's Sentis + YOLO sample)
    /// only adds names for loose objects, and can be layered on later without touching this.
    ///
    /// Needs: MRUK in the scene (an [MRUK] prefab), Space Setup done on the device, and
    /// com.oculus.permission.USE_SCENE in the Android manifest. In the Editor, MRUK's room
    /// prefabs stand in for a real scan, so this works over Link and in Play mode too.
    /// </summary>
    public class RoomGlow : MonoBehaviour
    {
        [Tooltip("Unlit, transparent, additive-ish material. RoomGlow drives its _PulseOrigin/_PulseRadius floats.")]
        public Material glowMaterial;

        [Tooltip("Tint per anchor kind; anything unlisted gets the base colour. Walls dimmer so parts still pop.")]
        public Color baseColour = new Color(0.15f, 0.55f, 1f, 0.35f);
        public Color wallColour = new Color(0.10f, 0.35f, 0.80f, 0.18f);
        public Color tableColour = new Color(0.20f, 0.90f, 1f, 0.45f);

        [Tooltip("Metres per second the reveal pulse travels.")]
        public float pulseSpeed = 3.5f;
        [Tooltip("Seconds between automatic pulses. 0 = only pulse when Pulse() is called.")]
        public float pulseEvery = 6f;

        private readonly List<GameObject> _spawned = new();
        private MaterialPropertyBlock _props;
        private float _pulseStartedAt = -999f;
        private Vector3 _pulseOrigin;

        private static readonly int PulseOriginId = Shader.PropertyToID("_PulseOrigin");
        private static readonly int PulseRadiusId = Shader.PropertyToID("_PulseRadius");
        private static readonly int TintId = Shader.PropertyToID("_Tint");

        private void Start()
        {
            _props = new MaterialPropertyBlock();
            // MRUK loads the scene asynchronously after permissions; build the overlay when it is ready.
            MRUK.Instance.RegisterSceneLoadedCallback(BuildOverlay);
        }

        /// <summary>Fire one reveal pulse from wherever the head is now (BOTW scan ping).</summary>
        public void Pulse()
        {
            var head = Camera.main != null ? Camera.main.transform.position : transform.position;
            _pulseOrigin = head;
            _pulseStartedAt = Time.time;
        }

        private void Update()
        {
            if (pulseEvery > 0f && Time.time - _pulseStartedAt > pulseEvery) Pulse();
            var radius = (Time.time - _pulseStartedAt) * pulseSpeed;
            foreach (var go in _spawned)
            {
                if (go == null) continue;
                var r = go.GetComponent<MeshRenderer>();
                if (r == null) continue;
                r.GetPropertyBlock(_props);
                _props.SetVector(PulseOriginId, _pulseOrigin);
                _props.SetFloat(PulseRadiusId, radius);
                r.SetPropertyBlock(_props);
            }
        }

        private void BuildOverlay()
        {
            foreach (var go in _spawned) Destroy(go);
            _spawned.Clear();

            var room = MRUK.Instance.GetCurrentRoom();
            if (room == null) { Debug.LogWarning("[RoomGlow] no room: run Space Setup on the headset."); return; }

            foreach (var anchor in room.Anchors)
            {
                // Volumes (tables, couches, storage) become glowing boxes; planes (walls, floor,
                // ceiling, doors, windows) become glowing quads, nudged off the surface to avoid z-fighting.
                if (anchor.VolumeBounds.HasValue)
                {
                    var box = GameObject.CreatePrimitive(PrimitiveType.Cube);
                    Prepare(box, anchor, ColourFor(anchor));
                    var b = anchor.VolumeBounds.Value;
                    box.transform.localScale = b.size;
                    box.transform.localPosition = b.center;
                }
                else if (anchor.PlaneRect.HasValue)
                {
                    var quad = GameObject.CreatePrimitive(PrimitiveType.Quad);
                    Prepare(quad, anchor, ColourFor(anchor));
                    var rect = anchor.PlaneRect.Value;
                    quad.transform.localScale = new Vector3(rect.size.x, rect.size.y, 1f);
                    quad.transform.localPosition = new Vector3(rect.center.x, rect.center.y, 0.005f);
                }
            }
            Pulse();
            Debug.Log($"[RoomGlow] overlay built: {_spawned.Count} surfaces glowing.");
        }

        private void Prepare(GameObject go, MRUKAnchor anchor, Color tint)
        {
            go.name = $"[RoomGlow] {anchor.Label}";
            go.transform.SetParent(anchor.transform, false);
            Destroy(go.GetComponent<Collider>()); // overlay only; must never eat the controller ray that selects parts
            var r = go.GetComponent<MeshRenderer>();
            r.sharedMaterial = glowMaterial;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            var props = new MaterialPropertyBlock();
            props.SetColor(TintId, tint);
            r.SetPropertyBlock(props);
            _spawned.Add(go);
        }

        private Color ColourFor(MRUKAnchor anchor)
        {
            var label = anchor.Label;
            if ((label & (MRUKAnchor.SceneLabels.WALL_FACE | MRUKAnchor.SceneLabels.CEILING | MRUKAnchor.SceneLabels.FLOOR)) != 0) return wallColour;
            if ((label & MRUKAnchor.SceneLabels.TABLE) != 0) return tableColour;
            return baseColour;
        }
    }
}
