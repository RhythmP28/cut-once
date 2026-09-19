using CutOnce.Core;
using UnityEngine;

namespace CutOnce.AR
{
    /// <summary>
    /// One part of the hologram. It owns nothing but its renderer's look: VisualStateResolver decides the look,
    /// the palette turns it into numbers, and this writes them to a MaterialPropertyBlock (one shared material,
    /// no per-part material instances).
    /// </summary>
    public sealed class PartView : MonoBehaviour
    {
        /// <summary>The collider is a little larger than the part, so pointing at a 4 cm leg from 2 m away is forgiving.</summary>
        public const float ColliderPadding = 0.01f;

        static readonly int FillColor = Shader.PropertyToID("_FillColor"), EdgeColor = Shader.PropertyToID("_EdgeColor"),
            EdgeWidthPx = Shader.PropertyToID("_EdgeWidthPx"), PulseHz = Shader.PropertyToID("_PulseHz"), Brackets = Shader.PropertyToID("_Brackets"),
            Grid = Shader.PropertyToID("_Grid"), Dashed = Shader.PropertyToID("_Dashed"), HalfSize = Shader.PropertyToID("_HalfSize"),
            EdgeMode = Shader.PropertyToID("_EdgeMode");

        MeshRenderer _renderer;
        MaterialPropertyBlock _block;
        Vector3 _halfSize;
        int _edgeMode;

        public PartDto Part { get; private set; }
        public string PartId => Part.part_id;
        public PartAccuracy Accuracy { get; private set; }
        public Bounds WorldBounds => _renderer.bounds;
        public VisualStyle Style { get; private set; }

        /// <param name="pickable">False for markers (pointer, proof overlay): they get no collider, so the selection ray can never land on them.</param>
        public static PartView Create(PartDto part, ShapeFactory.Built built, Transform parent, Material shared, bool pickable = true)
        {
            var go = new GameObject(part.part_id);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = built.LocalPosition;
            go.transform.localRotation = built.LocalRotation;
            go.AddComponent<MeshFilter>().sharedMesh = built.Mesh;

            var view = go.AddComponent<PartView>();
            view.Part = part;
            view.Accuracy = PartAccuracy.Of(part);
            view._halfSize = built.HalfSize;
            view._edgeMode = built.EdgeMode;
            view._block = new MaterialPropertyBlock();
            view._renderer = go.AddComponent<MeshRenderer>();
            view._renderer.sharedMaterial = shared;
            view._renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            view._renderer.receiveShadows = false;

            if (!pickable) return view;
            var box = go.AddComponent<BoxCollider>();
            box.center = built.Mesh.bounds.center;
            box.size = built.Mesh.bounds.size + Vector3.one * (ColliderPadding * 2f);
            return view;
        }

        public void Apply(VisualStyle style)
        {
            Style = style;
            var (fr, fg, fb) = HologramPalette.Rgb(style.fill);
            var (er, eg, eb) = HologramPalette.Rgb(style.edge);
            _block.SetColor(FillColor, new Color(fr, fg, fb, (float)style.fillAlpha));
            _block.SetColor(EdgeColor, new Color(er, eg, eb, (float)style.edgeAlpha));
            _block.SetFloat(EdgeWidthPx, (float)style.edgeWidthPx);
            _block.SetFloat(PulseHz, (float)style.pulseHz);
            _block.SetFloat(Brackets, style.brackets ? 1f : 0f);
            _block.SetFloat(Grid, style.grid ? 1f : 0f);
            _block.SetFloat(Dashed, style.dashed ? 1f : 0f);
            _block.SetVector(HalfSize, _halfSize);
            _block.SetFloat(EdgeMode, _edgeMode);
            _renderer.SetPropertyBlock(_block);
        }

        /// <summary>Bottom-up reveal, t in 0..1 (Reveal.CutHeight works in world height, whatever the pivot).</summary>
        public void SetReveal(float t)
        {
            _block.SetFloat(Reveal.RevealY, t >= 1f ? Reveal.FullyShown : Reveal.CutHeight(WorldBounds, t));
            _renderer.SetPropertyBlock(_block);
        }
    }
}
