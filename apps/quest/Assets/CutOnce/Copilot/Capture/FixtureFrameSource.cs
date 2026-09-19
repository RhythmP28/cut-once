using System;
using System.IO;
using UnityEngine;

namespace CutOnce.Copilot.Capture
{
    /// <summary>
    /// Replays the recorded frame from data/fixtures (copied into StreamingAssets by `pnpm sync:fixtures`).
    /// This is what lets the whole copilot be built in the Editor while A1 has the headset: the same
    /// bytes, pose and intrinsics every run, so a projection bug is reproducible.
    /// </summary>
    public class FixtureFrameSource : MonoBehaviour, ICameraFrameSource
    {
        [Tooltip("File name inside StreamingAssets. Its pose comes from <name>.pose.json beside it.")]
        public string fixtureName = "frame_0001.jpg";

        private byte[] _jpeg;
        private PoseFile _pose;

        [Serializable]
        private class PoseFile
        {
            public CameraIntrinsics camera;
            public float[] position;
            public float[] rotation_quat;
        }

        public bool IsReady => _jpeg != null;

        private void Awake()
        {
            string jpegPath = Path.Combine(Application.streamingAssetsPath, fixtureName);
            string posePath = Path.ChangeExtension(jpegPath, null) + ".pose.json";
            if (!File.Exists(jpegPath))
            {
                Debug.LogWarning($"[Copilot] no fixture frame at {jpegPath}. Run `pnpm copilot:fixtures && pnpm sync:fixtures`.");
                return;
            }
            _jpeg = File.ReadAllBytes(jpegPath);
            _pose = File.Exists(posePath) ? JsonUtility.FromJson<PoseFile>(File.ReadAllText(posePath)) : null;
        }

        public CameraFrame Capture()
        {
            if (_jpeg == null) return default;
            Vector3 position = _pose?.position is { Length: 3 } p ? new Vector3(p[0], p[1], p[2]) : Vector3.zero;
            Quaternion rotation = _pose?.rotation_quat is { Length: 4 } r ? new Quaternion(r[0], r[1], r[2], r[3]) : Quaternion.identity;
            CameraIntrinsics k = _pose != null && _pose.camera.width > 0 ? _pose.camera : CameraIntrinsics.FromFov(1280, 960, 60f);
            return new CameraFrame(_jpeg, position, rotation, k, DateTime.UtcNow);
        }
    }
}
