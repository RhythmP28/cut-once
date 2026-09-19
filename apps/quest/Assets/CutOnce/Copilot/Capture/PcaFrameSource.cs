using System;
using UnityEngine;

namespace CutOnce.Copilot.Capture
{
    /// <summary>
    /// The real thing: Meta's Passthrough Camera API, which surfaces on Quest 3 / 3S (Horizon OS v74+)
    /// as a normal WebCamTexture once the app holds the horizonos.permission.HEADSET_CAMERA permission.
    /// This mirrors QuestCameraKit's ImageLLM sample.
    ///
    /// G2 is the gate that proves this works. Until it passes, keep FixtureFrameSource wired up —
    /// the copilot answers from geometry and documents without pixels, just less well.
    ///
    /// The pose is taken from the tracking camera transform at the moment of capture. If that transform
    /// is not the physical colour camera, the projected boxes will sit at a constant offset; A1's proof
    /// overlay is how you spot that, and the fix is an offset on `cameraRigOverride`, not new maths.
    /// </summary>
    public class PcaFrameSource : MonoBehaviour, ICameraFrameSource
    {
        [Tooltip("Leave empty to use Camera.main's transform as the capture pose.")]
        public Transform cameraRigOverride;
        [Range(1, 100)] public int jpegQuality = 75;
        public int requestedWidth = 1280;
        public int requestedHeight = 960;
        public int requestedFps = 30;

        private WebCamTexture _texture;
        private Texture2D _readback;

        public bool IsReady => _texture != null && _texture.isPlaying && _texture.width > 16;

        private void OnEnable()
        {
            if (WebCamTexture.devices.Length == 0)
            {
                Debug.LogError("[Copilot] no camera device. Check Horizon OS v74+ and the headset camera permission.");
                return;
            }
            _texture = new WebCamTexture(WebCamTexture.devices[0].name, requestedWidth, requestedHeight, requestedFps);
            _texture.Play();
        }

        private void OnDisable()
        {
            if (_texture != null) { _texture.Stop(); Destroy(_texture); _texture = null; }
            if (_readback != null) { Destroy(_readback); _readback = null; }
        }

        public CameraFrame Capture()
        {
            if (!IsReady) return default;

            if (_readback == null || _readback.width != _texture.width || _readback.height != _texture.height)
            {
                if (_readback != null) Destroy(_readback);
                _readback = new Texture2D(_texture.width, _texture.height, TextureFormat.RGB24, false);
            }
            _readback.SetPixels32(_texture.GetPixels32());
            _readback.Apply(false);

            // EncodeToJPG blocks for a few milliseconds at this size. It runs on release of the button,
            // while the user is already seeing "Thinking", so it is not on the perceived critical path.
            byte[] jpeg = _readback.EncodeToJPG(jpegQuality);

            Transform pose = cameraRigOverride != null ? cameraRigOverride
                : Camera.main != null ? Camera.main.transform : transform;

            // Meta does not expose intrinsics through WebCamTexture, so they are derived from the
            // vertical field of view. Replace with the reported values if a later SDK exposes them.
            float fov = Camera.main != null ? Camera.main.fieldOfView : 60f;
            var k = CameraIntrinsics.FromFov(_texture.width, _texture.height, fov);

            return new CameraFrame(jpeg, pose.position, pose.rotation, k, DateTime.UtcNow);
        }
    }
}
