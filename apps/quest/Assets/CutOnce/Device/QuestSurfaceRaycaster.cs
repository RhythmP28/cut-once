using CutOnce.AR;
using Meta.XR;
using UnityEngine;

namespace CutOnce.Device
{
    /// <summary>
    /// The real surface under the pointer, from the Quest 3's depth sensing (MRUK's EnvironmentRaycastManager). No room
    /// scan is needed. Where it is unsupported (the Mac simulator, a Quest 2) it reports a miss and placement falls
    /// back to the floor plane.
    /// </summary>
    public sealed class QuestSurfaceRaycaster : MonoBehaviour, ISurfaceRaycaster
    {
        EnvironmentRaycastManager _manager;

        void Awake()
        {
            if (!EnvironmentRaycastManager.IsSupported) return;
            _manager = FindFirstObjectByType<EnvironmentRaycastManager>();
            if (_manager == null) _manager = gameObject.AddComponent<EnvironmentRaycastManager>();
        }

        public bool Raycast(Ray ray, out Vector3 point)
        {
            point = default;
            if (_manager == null || !_manager.Raycast(ray, out var hit, AlignmentController.PointerReach)) return false;
            if (hit.status != EnvironmentRaycastHitStatus.Hit) return false;
            point = hit.point;
            return true;
        }
    }
}
