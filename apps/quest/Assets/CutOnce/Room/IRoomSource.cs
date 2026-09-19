using System;
using System.Threading.Tasks;
using UnityEngine;

namespace CutOnce.Room
{
    public interface IRoomSource : IDisposable
    {
        RoomGeometry Geometry { get; }
        Transform Frame { get; }
        string Status { get; }
        bool IsFixture { get; }
        Task<bool> Load(bool rescan);
        bool Raycast(Ray ray, out Vector3 point, out string label);
        bool IsOccupied(Vector3 worldPoint);
    }

    /// <summary>Explicitly labelled laptop fixture; never a fallback on the headset.</summary>
    public sealed class FixtureRoomSource : IRoomSource
    {
        public RoomGeometry Geometry { get; private set; }
        public Transform Frame { get; }
        public string Status => "EDITOR FIXTURE  •  4 × 5 m  •  not a real scan";
        public bool IsFixture => true;
        public FixtureRoomSource(Transform parent)
        {
            Frame = new GameObject("Fixture room frame").transform;
            Frame.SetParent(parent, false);
        }
        public Task<bool> Load(bool rescan)
        {
            var floor = new[] { new Vector3(-2,0,-2.5f), new Vector3(2,0,-2.5f), new Vector3(2,0,2.5f), new Vector3(-2,0,2.5f) };
            var surfaces = new RoomSurface[6];
            surfaces[0] = new RoomSurface { label = "Floor", outline = floor };
            var ceiling = new Vector3[4];
            for (int i = 0; i < 4; i++) ceiling[i] = floor[i] + Vector3.up * 2.6f;
            surfaces[1] = new RoomSurface { label = "Ceiling", outline = ceiling };
            for (int i = 0; i < 4; i++)
            {
                var a = floor[i]; var b = floor[(i + 1) % 4];
                surfaces[i + 2] = new RoomSurface { label = "Wall " + (i + 1), outline = new[] { a, b, b + Vector3.up * 2.6f, a + Vector3.up * 2.6f } };
            }
            Geometry = new RoomGeometry { id = "editor-fixture-4x5-v1", floor = floor, height = 2.6f, surfaces = surfaces };
            return Task.FromResult(true);
        }
        public bool Raycast(Ray ray, out Vector3 point, out string label)
        {
            point = default; label = ""; float nearest = 20;
            if (Geometry == null) return false;
            foreach (var surface in Geometry.surfaces)
            {
                var v = surface.outline;
                var plane = new Plane(Frame.TransformPoint(v[0]), Frame.TransformPoint(v[1]), Frame.TransformPoint(v[2]));
                if (plane.Raycast(ray, out float distance) && distance > .02f && distance < nearest)
                {
                    var candidate = ray.GetPoint(distance);
                    if (!Geometry.Contains(Frame.InverseTransformPoint(candidate))) continue;
                    nearest = distance; point = candidate; label = surface.label;
                }
            }
            return label.Length > 0;
        }
        public bool IsOccupied(Vector3 worldPoint) => false;
        public void Dispose() { if (Frame != null) UnityEngine.Object.Destroy(Frame.gameObject); }
    }
}
