using CutOnce.AR;
using UnityEngine;

namespace CutOnce.Device
{
    /// <summary>
    /// The operator's right Touch controller through OVRInput (which the Meta XR Simulator also drives, so the same
    /// code runs on the laptop). A is the copilot's push-to-talk (QuestPushToTalk); everything else is here:
    /// trigger locks, B marks, grip nudges, holding the stick button places again.
    /// </summary>
    public sealed class QuestInput : MonoBehaviour, IOperatorInput
    {
        const OVRInput.Controller Hand = OVRInput.Controller.RTouch;
        /// <summary>The recorded touch point sits this far along the pointer from the controller's origin, where the marker is drawn.</summary>
        public Vector3 tipOffset = new Vector3(0f, -0.01f, 0.05f);

        Transform _trackingSpace;

        void Awake()
        {
            var rig = FindFirstObjectByType<OVRCameraRig>();
            _trackingSpace = rig != null ? rig.trackingSpace : null;
        }

        Pose ControllerWorld()
        {
            var local = new Pose(OVRInput.GetLocalControllerPosition(Hand), OVRInput.GetLocalControllerRotation(Hand));
            return _trackingSpace == null ? local : new Pose(_trackingSpace.TransformPoint(local.position), _trackingSpace.rotation * local.rotation);
        }

        public bool TryGetPointer(out Ray ray)
        {
            var pose = ControllerWorld();
            ray = new Ray(pose.position, pose.rotation * Vector3.forward);
            return OVRInput.IsControllerConnected(Hand) && OVRInput.GetControllerPositionTracked(Hand);
        }

        public Vector3 TipWorld { get { var pose = ControllerWorld(); return pose.position + pose.rotation * tipOffset; } }
        public Vector2 Stick => OVRInput.Get(OVRInput.RawAxis2D.RThumbstick);
        public bool TriggerDown => OVRInput.GetDown(OVRInput.RawButton.RIndexTrigger);
        public bool TriggerHeld => OVRInput.Get(OVRInput.RawButton.RIndexTrigger);
        public bool GripHeld => OVRInput.Get(OVRInput.RawButton.RHandTrigger);
        public bool MarkDown => OVRInput.GetDown(OVRInput.RawButton.B);
        public bool MarkHeld => OVRInput.Get(OVRInput.RawButton.B);
        public bool MarkUp => OVRInput.GetUp(OVRInput.RawButton.B);
        public bool StickClickHeld => OVRInput.Get(OVRInput.RawButton.RThumbstick);
    }
}
