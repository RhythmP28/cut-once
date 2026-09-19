using System;
using System.IO;
using UnityEngine;

namespace CutOnce.Scanner
{
    /// <summary>
    /// A stored photo standing in for the camera, for the Editor: Meta XR Simulator gives the passthrough camera a pose
    /// but no pixels on a Mac. By default it is the same recorded frame the copilot's FixtureFrameSource replays
    /// (StreamingAssets/frame_0001.jpg, put there by `pnpm sync:fixtures`), with the pose and intrinsics from the
    /// .pose.json beside it, so both see the desk from the same place. Editor only: it reads files by path, which
    /// StreamingAssets does not allow on Android (AGENTS rule 2).
    /// </summary>
    public sealed class PhotoFrameSource : MonoBehaviour, IScannerFrameSource
    {
        [Tooltip("A file name inside StreamingAssets, or a full path to any .jpg/.png.")]
        public string photo = "frame_0001.jpg";
        [Tooltip("Used when there is no <name>.pose.json beside the photo.")]
        public float verticalFieldOfView = 60f;

        [Serializable] class PoseFile { public Intrinsics camera; public float[] position; public float[] rotation_quat; }
        [Serializable] struct Intrinsics { public int width, height; public float fx, fy, cx, cy; }

        Texture2D _texture;
        Pose _pose = new Pose(new Vector3(0f, 1.5f, 0f), Quaternion.identity);
        Intrinsics _k;

        public string Status { get; private set; } = "Loading the photo…";
        public Texture2D Texture => _texture;

        void Awake() => Load();

        public void Load()
        {
            string path = Path.IsPathRooted(photo) ? photo : Path.Combine(Application.streamingAssetsPath, photo);
            if (!File.Exists(path)) { Status = $"No photo at {path}. Run `pnpm sync:fixtures`, or point 'photo' at any .jpg."; Debug.LogWarning("[Scanner] " + Status); return; }

            if (_texture != null) Destroy(_texture);
            _texture = new Texture2D(2, 2, TextureFormat.RGBA32, false) { name = Path.GetFileName(path) };
            if (!_texture.LoadImage(File.ReadAllBytes(path))) { Status = $"{path} is not an image Unity can read"; Debug.LogWarning("[Scanner] " + Status); return; }

            string posePath = Path.ChangeExtension(path, null) + ".pose.json";
            var file = File.Exists(posePath) ? JsonUtility.FromJson<PoseFile>(File.ReadAllText(posePath)) : null;
            if (file?.position is { Length: 3 } p && file.rotation_quat is { Length: 4 } r)
                _pose = new Pose(new Vector3(p[0], p[1], p[2]), new Quaternion(r[0], r[1], r[2], r[3]));
            _k = file != null && file.camera.width > 0 ? file.camera : FromFieldOfView(_texture.width, _texture.height, verticalFieldOfView);
            Status = null;
        }

        public bool TryGetFrame(out ScannerFrame frame)
        {
            frame = _texture == null ? default : new ScannerFrame(_texture, _pose, new Vector2Int(_texture.width, _texture.height));
            return _texture != null;
        }

        /// <summary>A plain pinhole. Intrinsics are in image pixels with the origin top-left, so the viewport's y is flipped first.</summary>
        public Ray ViewportPointToRay(Vector2 viewportPoint, Pose cameraPose)
        {
            float x = viewportPoint.x * _k.width, y = (1f - viewportPoint.y) * _k.height;
            var direction = new Vector3((x - _k.cx) / _k.fx, -(y - _k.cy) / _k.fy, 1f);
            return new Ray(cameraPose.position, cameraPose.rotation * direction.normalized);
        }

        public bool IsInView(Vector3 worldPoint, Pose cameraPose)
        {
            if (_texture == null || !ScannerView.InFront(worldPoint, cameraPose, out _)) return false;
            Vector3 local = Quaternion.Inverse(cameraPose.rotation) * (worldPoint - cameraPose.position);
            float x = local.x / local.z * _k.fx + _k.cx, y = -local.y / local.z * _k.fy + _k.cy;      // image pixels, origin top-left
            return ScannerView.InsideImage(new Vector2(x / _k.width, 1f - y / _k.height));
        }

        static Intrinsics FromFieldOfView(int width, int height, float verticalDegrees)
        {
            float f = height * 0.5f / Mathf.Tan(verticalDegrees * 0.5f * Mathf.Deg2Rad);
            return new Intrinsics { width = width, height = height, fx = f, fy = f, cx = width * 0.5f, cy = height * 0.5f };
        }

        void OnDestroy()
        {
            if (_texture != null) Destroy(_texture);
        }
    }
}
