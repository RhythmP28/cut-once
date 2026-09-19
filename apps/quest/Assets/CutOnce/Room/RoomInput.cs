using UnityEngine;
using UnityEngine.InputSystem;

namespace CutOnce.Room
{
    public interface IRoomInput
    {
        bool Toggle { get; }
        bool Scan { get; }
        bool Cycle { get; }
        bool Undo { get; }
        bool TriggerDown { get; }
        bool TriggerHeld { get; }
        bool Surface { get; }
        float HeightAxis { get; }
        bool TryPose(out Ray ray, out Vector3 tip);
    }

    public class QuestRoomInput : IRoomInput
    {
        readonly Transform _tracking;
        public QuestRoomInput(Transform tracking) { _tracking = tracking; }
        public virtual bool Toggle => OVRInput.GetDown(OVRInput.RawButton.X);
        public virtual bool Scan => OVRInput.GetDown(OVRInput.RawButton.Y);
        public virtual bool Cycle => OVRInput.GetDown(OVRInput.RawButton.LThumbstick);
        public virtual bool Undo => OVRInput.GetDown(OVRInput.RawButton.B);
        public virtual bool TriggerDown => OVRInput.GetDown(OVRInput.RawButton.RIndexTrigger);
        public virtual bool TriggerHeld => OVRInput.Get(OVRInput.RawButton.RIndexTrigger);
        public virtual bool Surface => OVRInput.Get(OVRInput.RawButton.LHandTrigger);
        public virtual float HeightAxis => OVRInput.Get(OVRInput.RawAxis2D.RThumbstick).y;
        public virtual bool TryPose(out Ray ray, out Vector3 tip)
        {
            var p = OVRInput.GetLocalControllerPosition(OVRInput.Controller.RTouch);
            var q = OVRInput.GetLocalControllerRotation(OVRInput.Controller.RTouch);
            if (_tracking != null) { p = _tracking.TransformPoint(p); q = _tracking.rotation * q; }
            ray = new Ray(p, q * Vector3.forward);
            tip = p + q * new Vector3(0, -.01f, .05f);
            return OVRInput.IsControllerConnected(OVRInput.Controller.RTouch) && OVRInput.GetControllerPositionTracked(OVRInput.Controller.RTouch)
                && OVRInput.GetControllerOrientationTracked(OVRInput.Controller.RTouch);
        }
    }

    /// <summary>Keyboard fallback for the fixture when a simulated controller is not tracked.</summary>
    public sealed class EditorRoomInput : QuestRoomInput
    {
        readonly Transform _head;
        Vector3 _offset = new Vector3(.2f, -.2f, .65f);
        Keyboard Keys => Keyboard.current;
        public EditorRoomInput(Transform tracking, Transform head) : base(tracking) { _head = head; }
        public override bool Toggle => base.Toggle || (Keys?.xKey.wasPressedThisFrame ?? false);
        public override bool Scan => base.Scan || (Keys?.yKey.wasPressedThisFrame ?? false);
        public override bool Cycle => base.Cycle || (Keys?.tabKey.wasPressedThisFrame ?? false);
        public override bool Undo => base.Undo || (Keys?.backspaceKey.wasPressedThisFrame ?? false);
        public override bool TriggerDown => base.TriggerDown || (Keys?.spaceKey.wasPressedThisFrame ?? false);
        public override bool TriggerHeld => base.TriggerHeld || (Keys?.spaceKey.isPressed ?? false);
        public override bool Surface => base.Surface || (Keys?.leftShiftKey.isPressed ?? false);
        public override float HeightAxis => Keys == null ? base.HeightAxis : (Keys.upArrowKey.isPressed ? 1 : Keys.downArrowKey.isPressed ? -1 : base.HeightAxis);
        public override bool TryPose(out Ray ray, out Vector3 tip)
        {
            if (base.TryPose(out ray, out tip)) return true;
            if (_head == null || Keys == null) return false;
            float step = Time.unscaledDeltaTime * .5f;
            _offset.x += ((Keys.dKey.isPressed ? 1 : 0) - (Keys.aKey.isPressed ? 1 : 0)) * step;
            _offset.y += ((Keys.rKey.isPressed ? 1 : 0) - (Keys.fKey.isPressed ? 1 : 0)) * step;
            _offset.z += ((Keys.wKey.isPressed ? 1 : 0) - (Keys.sKey.isPressed ? 1 : 0)) * step;
            tip = _head.TransformPoint(_offset);
            ray = new Ray(_head.position, (tip - _head.position).normalized);
            return true;
        }
    }
}
