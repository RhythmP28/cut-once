using UnityEngine;
using CutOnce.Copilot;

namespace CutOnce.Device
{
    /// <summary>
    /// Push-to-talk on the right controller's A button (blueprint input map). Kept out of CutOnce.Copilot so that
    /// assembly needs no Meta reference; Unity's default assembly sees OVRInput as QuestCameraKit's scripts do.
    /// </summary>
    public class QuestPushToTalk : MonoBehaviour, IPushToTalk
    {
        public OVRInput.RawButton button = OVRInput.RawButton.A;

        public bool Down => OVRInput.GetDown(button);
        public bool Up => OVRInput.GetUp(button);
    }
}
