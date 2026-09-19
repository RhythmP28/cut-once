using System;
using CutOnce.Copilot;
using UnityEngine;

namespace CutOnce.Device.PlayTests
{
    /// <summary>
    /// A camera that always has a picture, for scan tests: a head 1.6 m up, a metre back, looking down at a table. The
    /// copilot's FixtureFrameSource only has one after `pnpm sync:fixtures`, and a test that silently skips the ray
    /// casting when it is missing proves nothing. In its own file because build mode reads the camera from a MonoBehaviour field.
    /// </summary>
    public sealed class StubFrames : MonoBehaviour, ICameraFrameSource
    {
        public int Captures;
        public bool IsReady => true;

        public CameraFrame Capture()
        {
            Captures++;
            return new CameraFrame(new byte[] { 0xFF, 0xD8, 0xFF, 0xD9 }, new Vector3(0f, 1.6f, -1f), Quaternion.Euler(35f, 0f, 0f),
                CameraIntrinsics.FromFov(1280, 960, 60f), DateTime.UtcNow, p => default);
        }
    }
}
