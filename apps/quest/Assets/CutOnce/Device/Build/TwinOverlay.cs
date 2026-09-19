using System;
using System.Collections.Generic;
using System.Globalization;
using CutOnce.AR;
using CutOnce.Core;
using CutOnce.UI;
using UnityEngine;

namespace CutOnce.Device
{
    /// <summary>
    /// Outlines and labels over the real objects build mode found: dim while unnamed, glowing once labelled. The root sits
    /// at the world origin, so a twin's plan-frame position becomes its Unity position through ModelSpace alone. Rebuilt
    /// once per inventory message (at most 40 twins), never per frame.
    /// </summary>
    public sealed class TwinOverlay : MonoBehaviour
    {
        public const int MaxShown = 40;
        readonly Dictionary<string, TwinDto> _twins = new Dictionary<string, TwinDto>();
        Material _material; HologramPalette _palette;

        public void Init(Material material, HologramPalette palette) { _material = material; _palette = palette; }

        public void Show(InventoryDto inventory)
        {
            Clear();
            if (inventory?.twins == null) return;
            var named = _palette.StyleFor(new PartVisual { Base = BaseVisual.CURRENT_STEP });
            var unnamed = _palette.StyleFor(new PartVisual { Base = BaseVisual.FUTURE });
            foreach (var t in inventory.twins)
            {
                if (_twins.Count >= MaxShown) break;
                if (t?.twin_id == null || !Drawable(t.shape) || t.position == null || t.position.Length != 3) continue;
                var part = AsPart(t);
                var built = ShapeFactory.Build(part);
                if (built?.Mesh == null) continue;                              // a shape the headset cannot draw
                _twins[t.twin_id] = t;
                PartView.Create(part, built, transform, _material, pickable: false).Apply(inventory.labelled && IsNamed(t) ? named : unnamed);
                WorldLabel.Create(transform, Caption(t), ModelSpace.Point(t.position) + Vector3.up * (float)(Height(t.shape) / 2 + 0.05));
            }
        }

        public void Clear()
        {
            _twins.Clear();
            DestroyChildren(transform);
        }

        /// <summary>Destroys everything under a build-mode root, and the meshes made for it (a generated mesh outlives its object otherwise).</summary>
        public static void DestroyChildren(Transform root)
        {
            foreach (var filter in root.GetComponentsInChildren<MeshFilter>(true)) if (filter.sharedMesh != null) Destroy(filter.sharedMesh);
            for (int i = root.childCount - 1; i >= 0; i--) Destroy(root.GetChild(i).gameObject);
        }

        public bool TryGetWorldPose(string twinId, out Vector3 position, out Quaternion rotation)
        {
            position = default; rotation = Quaternion.identity;
            if (twinId == null || !_twins.TryGetValue(twinId, out var t)) return false;
            position = ModelSpace.Point(t.position);
            rotation = ModelSpace.Rotation(YawQuat(t.yaw_deg));
            return true;
        }

        /// <summary>
        /// Where a design part has to start so that it lies exactly on its real object. A build plan never rotates a part:
        /// it reorders a box's size (a book stood upright swaps x and y), so the start is the real object's turn times the
        /// turn that puts each of the design's axes back on the real axis of that length. The flight undoes it on the way.
        /// </summary>
        public bool TryGetStartPose(string twinId, PartDto part, out Vector3 position, out Quaternion rotation)
        {
            if (!TryGetWorldPose(twinId, out position, out rotation)) return false;
            var real = _twins[twinId].shape; var design = part?.shape;
            if (design == null || design.type != real.type) return true;
            if (real.type == "cylinder") rotation *= ModelSpace.AxisFromY(real.axis);      // the mesh runs along its own +Y
            else if (real.type == "box")
            {
                var order = FlyPath.MatchAxes(design.size, real.size);
                rotation *= Quaternion.LookRotation(Axis(order[2]), Axis(order[1]));      // x follows: a box looks the same either way round
            }
            return true;
        }

        /// <summary>The middle of the named objects (where the previews float), else of all of them. False when there are none.</summary>
        public bool TryGetCentre(out Vector3 centre)
        {
            Vector3 namedSum = Vector3.zero, sum = Vector3.zero; int named = 0, all = 0;
            foreach (var t in _twins.Values)
            {
                var p = ModelSpace.Point(t.position);
                sum += p; all++;
                if (IsNamed(t)) { namedSum += p; named++; }
            }
            centre = named > 0 ? namedSum / named : all > 0 ? sum / all : Vector3.zero;
            return all > 0;
        }

        /// <summary>A twin is a box or a cylinder (TwinShape). Anything else, or a box with no size, is skipped rather than thrown on.</summary>
        static bool Drawable(ShapeDto s) => s != null && (s.type == "box" ? s.size != null && s.size.Length == 3 : s.type == "cylinder" && s.diameter > 0 && s.length > 0);
        static bool IsNamed(TwinDto t) => !string.IsNullOrEmpty(t.name) && t.name != "unknown";
        static Vector3 Axis(int i) => i == 0 ? Vector3.right : i == 1 ? Vector3.up : Vector3.forward;

        static PartDto AsPart(TwinDto t) => new PartDto
        { part_id = "part_" + t.twin_id, name = t.label, kind = t.name, layer = "scan", shape = t.shape, position = t.position, rotation_quat = YawQuat(t.yaw_deg) };

        static double[] YawQuat(double deg) { double h = deg * Math.PI / 360.0; return new[] { 0.0, Math.Sin(h), 0.0, Math.Cos(h) }; }
        static double Height(ShapeDto s) => s.type == "box" ? s.size[1] : s.axis == "y" ? s.length : s.diameter;

        static string Caption(TwinDto t)
        {
            if (!IsNamed(t)) return "…";
            var c = CultureInfo.InvariantCulture;
            string size = t.shape.type == "cylinder"
                ? string.Format(c, "{0:0.#} × {1:0.#} cm", t.shape.diameter * 100, Height(t.shape) * 100)
                : string.Format(c, "{0:0.#} × {1:0.#} × {2:0.#} cm", t.shape.size[0] * 100, t.shape.size[2] * 100, t.shape.size[1] * 100);
            return $"{(string.IsNullOrEmpty(t.label) ? t.name : t.label)} · {(t.snapped ? "" : "≈")}{size}";
        }
    }
}
