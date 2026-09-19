using System.Collections.Generic;
using CutOnce.AR;
using CutOnce.UI;
using UnityEngine;

namespace CutOnce.Scanner
{
    /// <summary>
    /// What you see: every confirmed object gets a see-through blue box with corner brackets and its name floating above
    /// it, both fixed to the object in the room, not to your view.
    ///
    /// Nothing here is new rendering. The box is the app's own hologram (CutOnce/Hologram through HologramMaterial:
    /// already single-pass-instanced and already blending alpha the way passthrough needs, AGENTS rules 4 and 5, and
    /// already proven on the headset) and the name is the app's own WorldLabel. The name is whatever YOLO called it:
    /// no size or room-geometry guessing.
    /// </summary>
    public sealed class ObjectVisualizer : MonoBehaviour
    {
        static readonly int FillColor = Shader.PropertyToID("_FillColor"), EdgeColor = Shader.PropertyToID("_EdgeColor"), EdgeWidthPx = Shader.PropertyToID("_EdgeWidthPx"),
            PulseHz = Shader.PropertyToID("_PulseHz"), Brackets = Shader.PropertyToID("_Brackets"), HalfSize = Shader.PropertyToID("_HalfSize"), EdgeMode = Shader.PropertyToID("_EdgeMode");

        [Tooltip("Scanner blue. Alpha is the fill's opacity: the real object must stay visible through it.")]
        public Color fill = new Color(0.10f, 0.50f, 1f, 0.16f);
        public Color edge = new Color(0.25f, 0.70f, 1f, 0.95f);
        public float edgeWidthPixels = 2.5f;
        [Tooltip("Corner brackets read as a scanner's target box; off draws the full edges.")]
        public bool cornerBrackets = true;
        [Tooltip("How quickly a box closes the gap to its object's latest position, per second. Higher is snappier, lower is calmer.")]
        public float followSpeed = 8f;
        public bool showConfidence;
        [Tooltip("How far the mesh's size may drift from the object's before the mesh is rebuilt (the shader measures edges in true metres).")]
        [Range(0.05f, 0.5f)] public float resizeTolerance = 0.15f;

        const float LabelGapMetres = 0.05f, SmallestDepthMetres = 0.04f, LargestDepthMetres = 0.35f;

        sealed class Visual
        {
            public TrackedObject Object;
            public Transform Root;
            public MeshFilter Filter;
            public MeshRenderer Renderer;
            public WorldLabel Label;
            public Vector3 MeshSize;
            public string Shown;
            public int ShownPercent = -1;
        }

        readonly List<Visual> _visuals = new List<Visual>(32);
        TrackedObjectManager _tracker;
        Material _material;
        MaterialPropertyBlock _block;

        public int Count => _visuals.Count;

        public void Init(TrackedObjectManager tracker)
        {
            _tracker = tracker;
            _material = HologramMaterial.Create();
            _block = new MaterialPropertyBlock();
            tracker.Confirmed += Show;
            tracker.Lost += Hide;
        }

        void Show(TrackedObject confirmed)
        {
            var root = new GameObject($"[Scanned] {confirmed.ClassName}").transform;
            root.SetParent(transform, false);
            var visual = new Visual { Object = confirmed, Root = root, Filter = root.gameObject.AddComponent<MeshFilter>(), Renderer = root.gameObject.AddComponent<MeshRenderer>() };
            visual.Renderer.sharedMaterial = _material;
            visual.Renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            visual.Renderer.receiveShadows = false;
            visual.Label = WorldLabel.Create(transform, "", confirmed.SmoothedWorldPosition);
            Place(visual, snap: true);
            _visuals.Add(visual);
        }

        void Hide(TrackedObject lost)
        {
            for (int i = _visuals.Count - 1; i >= 0; i--)
            {
                if (_visuals[i].Object != lost) continue;
                if (_visuals[i].Filter.sharedMesh != null) Destroy(_visuals[i].Filter.sharedMesh);
                Destroy(_visuals[i].Label.gameObject);
                Destroy(_visuals[i].Root.gameObject);
                _visuals.RemoveAt(i);
            }
        }

        void Update()
        {
            for (int i = 0; i < _visuals.Count; i++) Place(_visuals[i], snap: false);
        }

        void Place(Visual visual, bool snap)
        {
            TrackedObject tracked = visual.Object;
            // Depth hit the FRONT of the object, so the box is pushed back by half its depth to sit around the object
            // rather than straddle its front face. Depth itself is a guess: a box is as deep as its smaller side, within reason.
            float depth = Mathf.Clamp(Mathf.Min(tracked.WorldSize.x, tracked.WorldSize.y), SmallestDepthMetres, LargestDepthMetres);
            var size = new Vector3(tracked.WorldSize.x, tracked.WorldSize.y, depth);
            Vector3 facing = tracked.Facing.sqrMagnitude > 1e-6f ? tracked.Facing : Vector3.forward;
            Vector3 centre = tracked.SmoothedWorldPosition + facing * (depth * 0.5f);

            float t = snap ? 1f : 1f - Mathf.Exp(-followSpeed * Time.deltaTime);
            visual.Root.SetPositionAndRotation(Vector3.Lerp(visual.Root.position, centre, t), Quaternion.Slerp(visual.Root.rotation, Quaternion.LookRotation(facing, Vector3.up), t));

            if (visual.Filter.sharedMesh == null || Drifted(visual.MeshSize, size))
            {
                if (visual.Filter.sharedMesh != null) Destroy(visual.Filter.sharedMesh);
                visual.Filter.sharedMesh = ShapeFactory.Box(size);        // true size in metres: the shader's edge maths depends on it
                visual.MeshSize = size;
                _block.SetColor(FillColor, fill);
                _block.SetColor(EdgeColor, edge);
                _block.SetFloat(EdgeWidthPx, edgeWidthPixels);
                _block.SetFloat(PulseHz, 0f);
                _block.SetFloat(Brackets, cornerBrackets ? 1f : 0f);
                _block.SetFloat(EdgeMode, ShapeFactory.EdgeBox);
                _block.SetVector(HalfSize, size * 0.5f);
                visual.Renderer.SetPropertyBlock(_block);
            }

            visual.Label.transform.position = visual.Root.position + Vector3.up * (visual.MeshSize.y * 0.5f + LabelGapMetres);
            int percent = showConfidence ? Mathf.RoundToInt(tracked.Confidence * 100f) : -1;
            if (visual.Shown == tracked.ClassName && visual.ShownPercent == percent) return;   // a new string only when the text changes (AGENTS rule 10)
            visual.Shown = tracked.ClassName;
            visual.ShownPercent = percent;
            string name = tracked.ClassName.ToUpperInvariant();
            visual.Label.Set(showConfidence ? $"{name}  {percent}%" : name);
        }

        bool Drifted(Vector3 mesh, Vector3 wanted) =>
            Mathf.Abs(mesh.x - wanted.x) > mesh.x * resizeTolerance || Mathf.Abs(mesh.y - wanted.y) > mesh.y * resizeTolerance || Mathf.Abs(mesh.z - wanted.z) > mesh.z * resizeTolerance;

        void OnDestroy()
        {
            if (_tracker != null) { _tracker.Confirmed -= Show; _tracker.Lost -= Hide; }
            foreach (var visual in _visuals) if (visual.Filter != null && visual.Filter.sharedMesh != null) Destroy(visual.Filter.sharedMesh);
            if (_material != null) Destroy(_material);
        }
    }
}
