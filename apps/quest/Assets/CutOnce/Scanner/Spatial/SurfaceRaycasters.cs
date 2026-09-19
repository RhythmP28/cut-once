using CutOnce.AR;
using Meta.XR;
using UnityEngine;

namespace CutOnce.Scanner
{
    /// <summary>
    /// Only for a scene with no CutOnceApp in it (a test scene): the app's own QuestSurfaceRaycaster is what the scanner
    /// uses whenever there is one, and this does the same thing the same way, over the same EnvironmentRaycastManager.
    /// </summary>
    public sealed class DepthSurfaceRaycaster : MonoBehaviour, ISurfaceRaycaster
    {
        const float ReachMetres = 6f;   // AlignmentController.PointerReach
        EnvironmentRaycastManager _manager;

        void Awake()
        {
            if (!EnvironmentRaycastManager.IsSupported) return;
            _manager = FindAnyObjectByType<EnvironmentRaycastManager>();
            if (_manager == null) _manager = gameObject.AddComponent<EnvironmentRaycastManager>();
        }

        public bool Raycast(Ray ray, out Vector3 point)
        {
            point = default;
            if (_manager == null || !_manager.Raycast(ray, out var hit, ReachMetres) || hit.status != EnvironmentRaycastHitStatus.Hit) return false;
            point = hit.point;
            return true;
        }
    }

    /// <summary>
    /// The Editor's stand-in for depth (AGENTS rule 1): a laptop has no depth sensor, and a photo has no depth at all,
    /// so everything in it is taken to be on one wall a fixed distance in front of the camera. Enough to exercise
    /// locating, tracking and the visuals on a Mac; never used on the headset.
    /// </summary>
    public sealed class FlatBackdropRaycaster : ISurfaceRaycaster
    {
        readonly Plane _wall;

        public FlatBackdropRaycaster(Pose camera, float metresAway = 2f)
        {
            Vector3 forward = camera.rotation * Vector3.forward;
            _wall = new Plane(-forward, camera.position + forward * metresAway);
        }

        public bool Raycast(Ray ray, out Vector3 point)
        {
            bool hit = _wall.Raycast(ray, out float distance);
            point = hit ? ray.GetPoint(distance) : default;
            return hit;
        }
    }
}
