using System;
using Meta.XR;
using UnityEngine;
using CutOnce.Copilot;

namespace CutOnce.Device
{
    /// <summary>
    /// Frames from Meta's Passthrough Camera API (MRUK 205; Horizon OS v74+ and horizonos.permission.HEADSET_CAMERA).
    /// The pose is the colour camera's own pose at the image's timestamp (GetCameraPose: the head pose at that time
    /// plus the lens offset), and boxes are projected with Meta's WorldToViewportPoint using that same cached pose,
    /// as blueprint §5 requires. Camera.main is the eye-centre render camera and must not be used here.
    ///
    /// Lives outside CutOnce.Copilot (no asmdef here), so Unity's default assembly compiles it against Meta's
    /// packages the same way QuestCameraKit's own scripts are compiled.
    /// </summary>
    public class PcaFrameSource : MonoBehaviour, ICameraFrameSource
    {
        [Tooltip("The PassthroughCameraAccess component in the scene.")]
        public PassthroughCameraAccess cameraAccess;
        [Range(1, 100)] public int jpegQuality = 75;

        private Texture2D _readback;

        public bool IsReady => cameraAccess != null && cameraAccess.IsPlaying;

        public CameraFrame Capture()
        {
            if (!IsReady) return default;
            // Pose, then pixels, in the same main-thread step, so both describe the latest image.
            Pose pose = cameraAccess.GetCameraPose();
            Vector2Int size = cameraAccess.CurrentResolution;
            var colors = cameraAccess.GetColors(); // blocking GPU readback; rows bottom-up, as Texture2D expects
            if (!colors.IsCreated || colors.Length != size.x * size.y) return default;

            if (_readback == null || _readback.width != size.x || _readback.height != size.y)
            {
                if (_readback != null) Destroy(_readback);
                _readback = new Texture2D(size.x, size.y, TextureFormat.RGBA32, false);
            }
            _readback.SetPixelData(colors, 0);
            _readback.Apply(false);
            byte[] jpeg = _readback.EncodeToJPG(jpegQuality);

            var meta = cameraAccess.Intrinsics;
            var k = CameraIntrinsics.FromMeta(meta.FocalLength, meta.PrincipalPoint, meta.SensorResolution, size);
            var access = cameraAccess;
            return new CameraFrame(jpeg, pose.position, pose.rotation, k, DateTime.UtcNow,
                p => access.WorldToViewportPoint(p, pose));
        }

        private void OnDestroy()
        {
            if (_readback != null) Destroy(_readback);
        }
    }
}
