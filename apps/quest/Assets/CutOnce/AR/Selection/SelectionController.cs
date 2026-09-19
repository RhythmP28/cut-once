using System;
using UnityEngine;

namespace CutOnce.AR
{
    /// <summary>
    /// What the operator is pointing at. Part colliders are padded and parts nest (a power strip inside a tray), so
    /// the nearest hit is not always the intended one: among hits within a few centimetres of the nearest, the
    /// smallest part wins, because a small part inside a big one can only be reached that way.
    /// </summary>
    public sealed class SelectionController : MonoBehaviour
    {
        public const float Reach = 6f, NearTie = 0.03f;
        static readonly RaycastHit[] Hits = new RaycastHit[16];

        IOperatorInput _input;
        Func<bool> _enabled;
        Transform _beam, _dot;

        public string SelectedPartId { get; private set; }
        public Vector3 HitPoint { get; private set; }
        public event Action<string> Changed;

        public void Init(IOperatorInput input, Func<bool> enabled, Material material)
        {
            _input = input; _enabled = enabled;
            _beam = Marker("pointer beam", material, new Vector3(0.002f, 0.002f, 1f), 0.5);
            _dot = Marker("pointer dot", material, Vector3.one * 0.01f, 0.95);
        }

        Transform Marker(string name, Material material, Vector3 size, double alpha)
        {
            var built = new ShapeFactory.Built { Mesh = ShapeFactory.Box(size), HalfSize = size * 0.5f, EdgeMode = ShapeFactory.EdgeNone };
            var view = PartView.Create(new Core.PartDto { part_id = name, name = name }, built, transform, material, pickable: false);
            view.Apply(new Core.VisualStyle { fill = "#FFFFFF", fillAlpha = alpha, edge = "#FFFFFF", edgeAlpha = 0 });
            return view.transform;
        }

        void Update()
        {
            if (_input == null) return;
            bool hasRay = _input.TryGetPointer(out var ray);
            float length = Reach * 0.5f;
            string picked = null;

            if (hasRay && (_enabled == null || _enabled()))
            {
                int n = Physics.RaycastNonAlloc(ray, Hits, Reach);
                float nearest = float.MaxValue;
                for (int i = 0; i < n; i++) if (Hits[i].collider.GetComponent<PartView>() != null) nearest = Mathf.Min(nearest, Hits[i].distance);
                float bestVolume = float.MaxValue;
                for (int i = 0; i < n; i++)
                {
                    var view = Hits[i].collider.GetComponent<PartView>();
                    if (view == null || Hits[i].distance > nearest + NearTie) continue;
                    var size = view.WorldBounds.size; float volume = size.x * size.y * size.z;
                    if (volume < bestVolume) { bestVolume = volume; picked = view.PartId; HitPoint = Hits[i].point; length = Hits[i].distance; }
                }
            }

            _beam.gameObject.SetActive(hasRay);
            _dot.gameObject.SetActive(hasRay && picked != null);
            if (hasRay)
            {
                _beam.SetPositionAndRotation(ray.origin + ray.direction * (length * 0.5f), Quaternion.LookRotation(ray.direction));
                _beam.localScale = new Vector3(1f, 1f, length);
                _dot.position = ray.origin + ray.direction * length;
            }
            if (picked != SelectedPartId) { SelectedPartId = picked; Changed?.Invoke(picked); }
        }
    }
}
