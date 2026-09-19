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

        /// <summary>
        /// Could an image taken from cameraPose have shown this point? The tracker only counts a missed detection against
        /// an object the camera was actually looking at.
        /// </summary>
        bool IsInView(Vector3 worldPoint, Pose cameraPose);
    }

    /// <summary>What "in view" means, shared by both frame sources so the headset and the Editor agree.</summary>
    public static class ScannerView
    {
        /// <summary>An object cut off by the image's edge is often not detected: the outer band does not count as "seen and missed".</summary>
        public const float EdgeMargin = 0.08f;
        /// <summary>Past this a small object is a few pixels to a 640-pixel model: not detecting it says nothing.</summary>
        public const float FarthestMetres = 4f, NearestMetres = 0.15f;

        public static bool InFront(Vector3 worldPoint, Pose cameraPose, out float metresAhead)
        {
            metresAhead = Vector3.Dot(worldPoint - cameraPose.position, cameraPose.rotation * Vector3.forward);
            return metresAhead > NearestMetres && metresAhead < FarthestMetres;
        }

        public static bool InsideImage(Vector2 viewportPoint) =>
            viewportPoint.x > EdgeMargin && viewportPoint.x < 1f - EdgeMargin && viewportPoint.y > EdgeMargin && viewportPoint.y < 1f - EdgeMargin;
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
