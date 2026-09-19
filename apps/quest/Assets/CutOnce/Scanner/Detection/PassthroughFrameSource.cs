using Meta.XR;
using UnityEngine;
#if UNITY_ANDROID && !UNITY_EDITOR
using UnityEngine.Android;
#endif

namespace CutOnce.Scanner
{
    /// <summary>
    /// The headset's colour camera, through the same Meta PassthroughCameraAccess the copilot's PcaFrameSource uses.
    ///
    /// MRUK allows ONE PassthroughCameraAccess per camera (a second one for the same eye refuses to start), so this
    /// looks for the one CutOnceApp already made for the copilot and only creates its own if, a few seconds in, there
    /// is none. It reads GetTexture(), the image as it sits on the GPU: no GetColors readback, no JPEG. That path
    /// stays the copilot's, untouched.
    /// </summary>
    public sealed class PassthroughFrameSource : MonoBehaviour, IScannerFrameSource
    {
        const float LookForTheAppsCameraSeconds = 3f, LookEverySeconds = 0.5f, AskForPermissionAfterSeconds = 2f;
        const string CameraPermission = "horizonos.permission.HEADSET_CAMERA", ScenePermission = "com.oculus.permission.USE_SCENE";

        PassthroughCameraAccess _camera;
        float _startedAt, _nextLook;
        bool _askedForPermission;

        public string Status { get; private set; } = "Starting the camera…";

        void OnEnable() => _startedAt = Time.unscaledTime;

        public bool TryGetFrame(out ScannerFrame frame)
        {
            frame = default;
            if (_camera == null && !FindCamera()) return false;
            if (!_camera.IsPlaying)
            {
                bool allowed = HasCameraPermission();
                Status = allowed ? "Waiting for the passthrough camera…" : "Object scanning needs the headset camera: allow camera access";
                if (!allowed) AskForPermissionOnce();
                return false;
            }
            // Meta's sample skips the image when the head pose is not valid: GetCameraPose is built on it, and a box
            // projected from a bad pose lands somewhere else in the room. (They P/Invoke OVRPlugin for this; the same
            // answer is available from its public API.)
            if (!HeadPoseIsValid()) { Status = "Head tracking lost"; return false; }

            Texture texture = _camera.GetTexture();
            if (texture == null) return false;
            frame = new ScannerFrame(texture, _camera.GetCameraPose(), _camera.CurrentResolution);   // pose and pixels in one step
            Status = null;
            return true;
        }

        public Ray ViewportPointToRay(Vector2 viewportPoint, Pose cameraPose) => _camera.ViewportPointToRay(viewportPoint, cameraPose);

        bool FindCamera()
        {
            if (Time.unscaledTime < _nextLook) return false;   // AGENTS rule 10: a Find every frame is a GC spike every frame
            _nextLook = Time.unscaledTime + LookEverySeconds;
            _camera = FindAnyObjectByType<PassthroughCameraAccess>(FindObjectsInactive.Include);
            if (_camera == null && Time.unscaledTime - _startedAt > LookForTheAppsCameraSeconds)
            {
                Debug.Log("[Scanner] No PassthroughCameraAccess in the scene (no copilot?): the scanner is starting its own.");
                _camera = gameObject.AddComponent<PassthroughCameraAccess>();
            }
            return _camera != null;
        }

#if UNITY_ANDROID && !UNITY_EDITOR
        static bool HasCameraPermission() => Permission.HasUserAuthorizedPermission(CameraPermission);

        /// <summary>
        /// CutOnceApp asks for the camera only when it has a copilot. If nobody has asked by now, ask: camera and
        /// spatial data in ONE request, because Android drops a second permission dialog raised while one is open.
        /// </summary>
        void AskForPermissionOnce()
        {
            if (_askedForPermission || Time.unscaledTime - _startedAt < AskForPermissionAfterSeconds) return;
            _askedForPermission = true;
            Permission.RequestUserPermissions(new[] { CameraPermission, ScenePermission });
        }

        static bool HeadPoseIsValid() => OVRPlugin.GetNodePositionValid(OVRPlugin.Node.Head) && OVRPlugin.GetNodeOrientationValid(OVRPlugin.Node.Head);
#else
        static bool HasCameraPermission() => true;
        void AskForPermissionOnce() => _askedForPermission = true;
        static bool HeadPoseIsValid() => true;
#endif
    }
}
