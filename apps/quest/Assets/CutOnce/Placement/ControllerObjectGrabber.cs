using UnityEngine;

namespace CutOnce.Placement
{
    /// <summary>
    /// Lightweight controller grabber for the fixture objects. It uses the Touch controller pose from OVRInput,
    /// so the same code is driven by a Quest 3, Quest Link, or Meta XR Simulator. This is deliberately separate
    /// from PlacementBinding: moving a fixture tests the same observation path that the real detector will replace.
    /// </summary>
    public sealed class ControllerObjectGrabber : MonoBehaviour
    {
        [Min(0.01f)] public float grabRadius = 0.16f;
        [Range(0.1f, 0.95f)] public float gripThreshold = 0.7f;
        [Range(0.05f, 0.5f)] public float releaseThreshold = 0.3f;
        public bool allowLeftController = true;
        public bool allowRightController = true;

        Transform[] objects;
        OVRInput.Controller grabbedController;
        Transform grabbedObject;
        Vector3 controllerToObject;
        Quaternion controllerToObjectRotation;
        Transform trackingSpace;

        public bool IsGrabbed => grabbedObject != null;
        public string GrabbedObjectId => grabbedObject == null ? string.Empty : grabbedObject.parent.name;

        public void Configure(Transform[] movableObjects, Transform space)
        {
            objects = movableObjects;
            trackingSpace = space;
        }

        void Update()
        {
            if (grabbedObject == null)
            {
                if (allowRightController) TryBegin(OVRInput.Controller.RTouch);
                if (grabbedObject == null && allowLeftController) TryBegin(OVRInput.Controller.LTouch);
                return;
            }

            if (!TryGetControllerPose(grabbedController, out var pose) ||
                OVRInput.Get(OVRInput.Axis1D.PrimaryHandTrigger, grabbedController) < releaseThreshold)
            {
                Release();
                return;
            }

            grabbedObject.SetPositionAndRotation(
                pose.position + pose.rotation * controllerToObject,
                pose.rotation * controllerToObjectRotation);
        }

        void TryBegin(OVRInput.Controller controller)
        {
            if (OVRInput.Get(OVRInput.Axis1D.PrimaryHandTrigger, controller) < gripThreshold ||
                !TryGetControllerPose(controller, out var pose) || objects == null) return;

            Transform nearest = null;
            float nearestDistance = grabRadius;
            for (int i = 0; i < objects.Length; i++)
            {
                var candidate = objects[i];
                if (candidate == null || !candidate.gameObject.activeInHierarchy) continue;
                float distance = Vector3.Distance(candidate.position, pose.position);
                if (distance <= nearestDistance) { nearest = candidate; nearestDistance = distance; }
            }
            if (nearest == null) return;

            grabbedController = controller;
            grabbedObject = nearest;
            controllerToObject = Quaternion.Inverse(pose.rotation) * (nearest.position - pose.position);
            controllerToObjectRotation = Quaternion.Inverse(pose.rotation) * nearest.rotation;
            Debug.Log($"[Placement] Grabbed {GrabbedObjectId} with {controller}.");
        }

        void Release()
        {
            if (grabbedObject != null) Debug.Log($"[Placement] Released {GrabbedObjectId}.");
            grabbedObject = null;
        }

        bool TryGetControllerPose(OVRInput.Controller controller, out Pose pose)
        {
            pose = default;
            if (!OVRInput.IsControllerConnected(controller) ||
                !OVRInput.GetControllerPositionTracked(controller) ||
                !OVRInput.GetControllerOrientationTracked(controller)) return false;
            Vector3 position = OVRInput.GetLocalControllerPosition(controller);
            Quaternion rotation = OVRInput.GetLocalControllerRotation(controller);
            pose = trackingSpace == null
                ? new Pose(position, rotation)
                : new Pose(trackingSpace.TransformPoint(position), trackingSpace.rotation * rotation);
            return true;
        }

        void OnDisable() => Release();
    }
}
