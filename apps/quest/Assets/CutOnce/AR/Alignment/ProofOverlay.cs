using System.Collections.Generic;
using CutOnce.Core;
using UnityEngine;

namespace CutOnce.AR
{
    /// <summary>
    /// Shows the operator whether the hologram sits where it should before they trust it: the model's footprint
    /// drawn on the surface, a marker on each of the plan's touch points (they should sit on the real corners), and
    /// the point the controller would record. Visible while placing and for a few seconds after the lock.
    /// </summary>
    public sealed class ProofOverlay : MonoBehaviour
    {
        const float LineThickness = 0.004f, MarkerSize = 0.014f, LingerSeconds = 4f;
        static readonly VisualStyle Line = new VisualStyle { fill = "#FFFFFF", fillAlpha = 0.9, edge = "#FFFFFF", edgeAlpha = 0 };
        static readonly VisualStyle Marker = new VisualStyle { fill = "#FFD84D", fillAlpha = 0.95, edge = "#FFFFFF", edgeAlpha = 1, edgeWidthPx = 1 };

        AlignmentController _alignment; IOperatorInput _input;
        readonly List<GameObject> _owned = new List<GameObject>();
        Transform _tip; float _hideAt;

        public void Init(AlignmentController alignment, IOperatorInput input) { _alignment = alignment; _input = input; }

        /// <summary>Call after AssemblyView.Build: the overlay is part of the model, so it moves with AssemblyRoot.</summary>
        public void Rebuild(AssemblyView assembly, Material material)
        {
            foreach (var go in _owned) Objects.Discard(go);
            _owned.Clear();

            var b = _alignment.LocalBounds();
            float y = b.min.y + LineThickness * 0.5f;
            AddBox(assembly.transform, material, new Vector3(b.center.x, y, b.min.z), new Vector3(b.size.x, LineThickness, LineThickness), Line);
            AddBox(assembly.transform, material, new Vector3(b.center.x, y, b.max.z), new Vector3(b.size.x, LineThickness, LineThickness), Line);
            AddBox(assembly.transform, material, new Vector3(b.min.x, y, b.center.z), new Vector3(LineThickness, LineThickness, b.size.z), Line);
            AddBox(assembly.transform, material, new Vector3(b.max.x, y, b.center.z), new Vector3(LineThickness, LineThickness, b.size.z), Line);
            foreach (var tp in assembly.Plan.touch_points ?? new List<TouchPointDto>())
                AddBox(assembly.transform, material, ModelSpace.Point(tp.position), Vector3.one * MarkerSize, Marker).name = "proof " + tp.point_id;

            _tip = AddBox(null, material, Vector3.zero, Vector3.one * MarkerSize * 0.7f, Marker).transform;
            _tip.name = "controller tip";
        }

        GameObject AddBox(Transform parent, Material material, Vector3 localPosition, Vector3 size, VisualStyle style)
        {
            var part = new PartDto { part_id = "proof", name = "proof" };
            var built = new ShapeFactory.Built { Mesh = ShapeFactory.Box(size), LocalPosition = localPosition, HalfSize = size * 0.5f, EdgeMode = ShapeFactory.EdgeBox };
            var view = PartView.Create(part, built, parent, material, pickable: false);   // the overlay must never catch the selection ray
            view.Apply(style);
            _owned.Add(view.gameObject);
            return view.gameObject;
        }

        void Update()
        {
            if (_alignment == null) return;
            if (_alignment.State == AlignmentState.Placing) _hideAt = Time.time + LingerSeconds;
            bool show = _alignment.State == AlignmentState.Placing ? _alignment.HasSurfaceHit || _alignment.TouchesRecorded > 0 : Time.time < _hideAt;
            foreach (var go in _owned) if (go != null && go.transform != _tip) go.SetActive(show);
            if (_tip != null)
            {
                _tip.gameObject.SetActive(_alignment.State == AlignmentState.Placing && _input != null);
                if (_input != null) _tip.position = _input.TipWorld;
            }
        }
    }
}
