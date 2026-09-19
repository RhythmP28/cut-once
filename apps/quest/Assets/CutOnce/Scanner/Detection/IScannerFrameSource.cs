using UnityEngine;

namespace CutOnce.Scanner
{
    /// <summary>
    /// Where the detector's images come from (AGENTS rule 1: what differs between headset and laptop goes behind an
    /// interface with two implementations). On the headset it is the passthrough camera; in the Editor, where that
    /// camera gives a pose but no pixels, it is a stored photo. Everything after this interface runs identically.
    /// </summary>
    public interface IScannerFrameSource
    {
        /// <summary>Why there is no image yet, in words a person can act on ("allow camera access"); null once images flow.</summary>
        string Status { get; }

        /// <summary>The newest image and the pose the camera had when it was taken, read in the same step so they match.</summary>
        bool TryGetFrame(out ScannerFrame frame);

        /// <summary>A world ray through a viewport point (0..1, origin bottom-left) of an image taken from cameraPose.</summary>
        Ray ViewportPointToRay(Vector2 viewportPoint, Pose cameraPose);
    }

    public readonly struct ScannerFrame
    {
        public readonly Texture Texture;
        public readonly Pose CameraPose;
        public readonly Vector2Int Size;

        public ScannerFrame(Texture texture, Pose cameraPose, Vector2Int size)
        {
            Texture = texture;
            CameraPose = cameraPose;
            Size = size;
        }
    }
}
