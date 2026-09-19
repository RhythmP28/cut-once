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
        Material _material;

        public PlanDto Plan { get; private set; }
        public IReadOnlyDictionary<string, PartView> Views => _views;

        /// <summary>Throws away the old hologram and builds the plan's parts. Parts the factory cannot draw are skipped and reported.</summary>
        public List<string> Build(PlanDto plan)
        {
            foreach (var view in _views.Values) if (view != null) Objects.Discard(view.gameObject);
            _views.Clear();
            Plan = plan;
            if (_material == null) _material = HologramMaterial.Create();

            var skipped = new List<string>();
            foreach (var part in plan.parts)
            {
                var built = ShapeFactory.Build(part);
                if (built?.Mesh == null) { skipped.Add(part.part_id); continue; }
                _views[part.part_id] = PartView.Create(part, built, transform, _material);
            }
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

        public PartView ViewOf(string partId) => partId != null && _views.TryGetValue(partId, out var view) ? view : null;
    }
}
