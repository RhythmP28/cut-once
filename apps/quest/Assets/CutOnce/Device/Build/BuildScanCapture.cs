using System;
using System.Collections;
using System.Diagnostics;
using CutOnce.AR;
using CutOnce.Copilot;
using CutOnce.Core;
using UnityEngine;
using Debug = UnityEngine.Debug;

namespace CutOnce.Device
{
    /// <summary>
    /// One build-mode scan: grab the passthrough photo, then cast a grid of depth rays through that photo's pixels from
    /// the pose it was taken at, so each point lines up with its pixel. The rays are spread over frames (AGENTS rule 10):
    /// a frame stops at raysPerFrame rays or millisecondsPerFrame of casting, whichever comes first, so a slow depth ray
    /// costs scan time, not frame rate. Both are tuned on the headset (M1). In the Editor there is no depth, so a scan
    /// fails with "no depth"; use a Director replay there instead.
    /// </summary>
    public sealed class BuildScanCapture : MonoBehaviour
    {
        /// <summary>The clock is read once per this many rays: often enough to hold the budget, rare enough to cost nothing.</summary>
        const int RaysPerClockCheck = 32;

        public int cols = 128, rows = 96, raysPerFrame = 1024;
        public float millisecondsPerFrame = 4f;
        public bool Busy { get; private set; }

        public IEnumerator Capture(ICameraFrameSource frames, ISurfaceRaycaster surface, string sessionId, string deviceId,
                                   Action<BuildScanUploadDto> done, Action<string> failed)
        {
            if (Busy) { failed("already scanning"); yield break; }
            if (frames == null || !frames.IsReady) { failed("the camera is not ready"); yield break; }
            var frame = frames.Capture();
            if (!frame.IsValid) { failed("the camera gave no picture"); yield break; }
            Busy = true;
            BuildScanUploadDto dto = null;
            try
            {
                var k = frame.Intrinsics;
                var enc = new ScanEncoder(cols, rows);
                var clock = Stopwatch.StartNew();
                int castThisFrame = 0;
                for (int i = 0; i < enc.Count; i++)
                {
                    ScanEncoder.CellDirection(i, cols, rows, k.width, k.height, k.fx, k.fy, k.cx, k.cy, out double x, out double y, out double z);
                    var direction = frame.Rotation * new Vector3((float)x, (float)y, (float)z);
                    if (surface != null && surface.Raycast(new Ray(frame.Position, direction), out var p)) enc.HitUnity(i, p.x, p.y, p.z);
                    castThisFrame++;
                    bool outOfTime = castThisFrame % RaysPerClockCheck == 0 && clock.Elapsed.TotalMilliseconds >= millisecondsPerFrame;
                    if (castThisFrame >= raysPerFrame || outOfTime)
                    {
                        yield return null;
                        castThisFrame = 0; clock.Restart();
                    }
                }
                Debug.Log($"[CutOnce] Scan: {enc.Hits}/{enc.Count} depth hits");
                if (enc.Hits > 0)
                {
                    var forward = frame.Rotation * Vector3.forward;
                    dto = new BuildScanUploadDto
                    {
                        session_id = sessionId, device_id = deviceId, grid = new BuildGridDto { cols = cols, rows = rows },
                        points_mm = enc.PointsMm, hit = enc.HitMask,
                        camera = new BuildCameraDto
                        {
                            position = ScanEncoder.PlanFromUnity(frame.Position.x, frame.Position.y, frame.Position.z),
                            forward = ScanEncoder.PlanFromUnity(forward.x, forward.y, forward.z),
                            intrinsics = new BuildIntrinsicsDto { width = k.width, height = k.height, fx = k.fx, fy = k.fy, cx = k.cx, cy = k.cy },
                        },
                        photo_b64 = Convert.ToBase64String(frame.Jpeg),
                    };
                }
            }
            finally { Busy = false; }
            // A scan with no points is no use to the server: there is no depth in the Editor, and none on the headset until
            // spatial data is allowed and the depth sensor has started.
            if (dto == null) failed("no depth here yet (on the headset, allow spatial data; in the Editor, replay a scan from the Director page)");
            else done(dto);
        }
    }
}
