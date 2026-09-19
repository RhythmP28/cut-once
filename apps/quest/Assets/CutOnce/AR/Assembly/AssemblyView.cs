using System.Collections.Generic;
using CutOnce.Core;
using UnityEngine;

namespace CutOnce.AR
{
    /// <summary>
    /// The hologram: one PartView per plan part under this transform, which is AssemblyRoot. This transform's pose
    /// is the alignment and only the alignment code moves it. Looks are pushed in from outside (Show), so this class
    /// never decides what state a part is in.
    /// </summary>
    public sealed class AssemblyView : MonoBehaviour
    {
        readonly Dictionary<string, PartView> _views = new Dictionary<string, PartView>();
        readonly Dictionary<Collider, PartView> _byCollider = new Dictionary<Collider, PartView>();
        Material _material;

        public PlanDto Plan { get; private set; }
        public IReadOnlyDictionary<string, PartView> Views => _views;
        /// <summary>The model's bounds in this transform's own frame. Worked out once per Build, because placement reads it every frame.</summary>
        public Bounds LocalBounds { get; private set; }

        /// <summary>Throws away the old hologram and builds the plan's parts. Parts the factory cannot draw are skipped and reported.</summary>
        public List<string> Build(PlanDto plan)
        {
            foreach (var view in _views.Values) if (view != null) Objects.Discard(view.gameObject);
            _views.Clear(); _byCollider.Clear();
            Plan = plan;
            if (_material == null) _material = HologramMaterial.Create();

            var skipped = new List<string>();
            var bounds = new Bounds(); bool any = false;
            foreach (var part in plan.parts)
            {
                var built = ShapeFactory.Build(part);
                if (built?.Mesh == null) { skipped.Add(part.part_id); continue; }
                var view = PartView.Create(part, built, transform, _material);
                _views[part.part_id] = view;
                _byCollider[view.GetComponent<Collider>()] = view;
                Grow(ref bounds, ref any, view.transform, built.Mesh.bounds);
            }
            LocalBounds = bounds;
            return skipped;
        }

        /// <summary>Pushes one look to every part. Estimated parts (accuracy tags) draw dashed whatever their state.</summary>
        public void Show(IReadOnlyDictionary<string, PartVisual> visuals, HologramPalette palette)
        {
            foreach (var pair in _views)
            {
                if (!visuals.TryGetValue(pair.Key, out var visual)) continue;
                var style = palette.StyleFor(visual);
                style.dashed = pair.Value.Accuracy.IsApproximate;
                pair.Value.Apply(style);
            }
        }

        /// <summary>The part a physics hit landed on, without a GetComponent in the frame loop. Null for anything that is not a part.</summary>
        public PartView ViewOf(Collider collider) => collider != null && _byCollider.TryGetValue(collider, out var view) ? view : null;

        static void Grow(ref Bounds total, ref bool any, Transform part, Bounds mesh)
        {
            for (int i = 0; i < 8; i++)
            {
                var corner = mesh.center + Vector3.Scale(mesh.extents, new Vector3((i & 1) == 0 ? -1 : 1, (i & 2) == 0 ? -1 : 1, (i & 4) == 0 ? -1 : 1));
                var p = part.localPosition + part.localRotation * corner;
                if (!any) { total = new Bounds(p, Vector3.zero); any = true; } else total.Encapsulate(p);
            }
        }

        public PartView ViewOf(string partId) => partId != null && _views.TryGetValue(partId, out var view) ? view : null;
    }
}
