using System;
using UnityEngine;

namespace CutOnce.Copilot
{
    /// <summary>One camera frame, already encoded, with everything needed to project 3D into it.</summary>
    public readonly struct CameraFrame
    {
        public readonly byte[] Jpeg;
        public readonly Vector3 Position;
        public readonly Quaternion Rotation;
        public readonly CameraIntrinsics Intrinsics;
        public readonly DateTime CapturedAtUtc;

        public CameraFrame(byte[] jpeg, Vector3 position, Quaternion rotation, CameraIntrinsics intrinsics, DateTime capturedAtUtc)
        {
            Jpeg = jpeg; Position = position; Rotation = rotation; Intrinsics = intrinsics; CapturedAtUtc = capturedAtUtc;
        }

        public bool IsValid => Jpeg != null && Jpeg.Length > 0 && Intrinsics.Width > 0;
    }

    [Serializable]
    public struct CameraIntrinsics
    {
        public int width, height;
        public float fx, fy, cx, cy;

        public int Width => width;
        public int Height => height;

        /// <summary>Falls back to a pinhole model from the vertical field of view when the device does not report intrinsics.</summary>
        public static CameraIntrinsics FromFov(int width, int height, float verticalFovDegrees)
        {
            float fy = height * 0.5f / Mathf.Tan(verticalFovDegrees * 0.5f * Mathf.Deg2Rad);
            return new CameraIntrinsics { width = width, height = height, fx = fy, fy = fy, cx = width * 0.5f, cy = height * 0.5f };
        }
    }

    /// <summary>
    /// Where frames come from. Two implementations on purpose: <see cref="Capture.PcaFrameSource"/> on the
    /// device and <see cref="Capture.FixtureFrameSource"/> in the Editor, so the copilot can be built and
    /// debugged without the one headset.
    /// </summary>
    public interface ICameraFrameSource
    {
        bool IsReady { get; }
        /// <summary>Grabs the newest frame. Called on the main thread; JPEG encoding may happen off it.</summary>
        CameraFrame Capture();
    }

    /// <summary>A part as the headset knows it, for projection. Implemented over A2's part index.</summary>
    public interface IProjectablePart
    {
        string PartId { get; }
        string State { get; }        // missing | built | wrong
        Bounds WorldBounds { get; }  // axis-aligned world bounds of the part's renderer
    }

    /// <summary>
    /// The four things the copilot needs from the rest of the app. A2 owns the real implementation;
    /// this interface exists so pillar C compiles and runs against a stub until that lands.
    /// </summary>
    public interface ICopilotHost
    {
        string AssemblyId { get; }
        int PlanRevision { get; }
        int StateVersion { get; }
        string Mode { get; }              // upload | overlay
        string SelectedPartId { get; }    // null when the ray hits nothing
        string SelectionSource { get; }   // controller_ray | gaze | none
        string CurrentStepId { get; }

        System.Collections.Generic.IReadOnlyList<IProjectablePart> PartsForProjection();

        /// <summary>Pulse or path-highlight these parts. Called the moment the answer arrives, before the audio.</summary>
        void Highlight(string[] partIds, string style);

        /// <summary>Show the answer text and the source card on the HUD.</summary>
        void ShowAnswer(CopilotResponseDto response);

        /// <summary>A spoken command already applied by the server. Show a 2 s Undo toast, do NOT append an event.</summary>
        void OnActionApplied(CopilotActionDto action);

        /// <summary>Spoken "next" / "back". Headset-local: move the step view, write nothing.</summary>
        void StepNav(string direction);
    }
}
