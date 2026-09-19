using CutOnce.AR;
using CutOnce.Scanner;
using NUnit.Framework;
using UnityEngine;

namespace CutOnce.Scanner.Tests
{
    /// <summary>A 2D box becomes a place in the room: through the camera's pose WHEN THE IMAGE WAS TAKEN, onto real depth, or not at all.</summary>
    public class Object3DLocatorTests
    {
        /// <summary>A 60-degree, 4:3 pinhole: what PhotoFrameSource is, without needing a photo on disk.</summary>
        sealed class Pinhole : IScannerFrameSource
        {
            const float Aspect = 4f / 3f;
            static readonly float HalfHeight = Mathf.Tan(30f * Mathf.Deg2Rad);
            public string Status => null;
            public bool TryGetFrame(out ScannerFrame frame) { frame = default; return false; }
            public Ray ViewportPointToRay(Vector2 v, Pose pose) =>
                new Ray(pose.position, pose.rotation * new Vector3((v.x * 2f - 1f) * HalfHeight * Aspect, (v.y * 2f - 1f) * HalfHeight, 1f).normalized);
            public bool IsInView(Vector3 worldPoint, Pose cameraPose) => true;
        }

        /// <summary>A wall facing -Z at a given z, or nothing at all.</summary>
        sealed class Wall : ISurfaceRaycaster
        {
            readonly Plane? _plane;
            public Ray? FirstRay;                      // the centre pixel's: the samples around it follow
            public Wall(float? z) => _plane = z.HasValue ? new Plane(Vector3.back, new Vector3(0f, 0f, z.Value)) : (Plane?)null;
            public bool Raycast(Ray ray, out Vector3 point)
            {
                FirstRay ??= ray;
                point = default;
                if (_plane == null || !_plane.Value.Raycast(ray, out float distance)) return false;
                point = ray.GetPoint(distance);
                return true;
            }
        }

        /// <summary>A chair: something 2 m away with a gap in the middle that a ray goes straight through, to the wall at 4 m.</summary>
        sealed class ThingWithAGap : ISurfaceRaycaster
        {
            public int Rays;
            public bool Raycast(Ray ray, out Vector3 point)
            {
                Rays++;
                bool throughTheGap = Vector3.Angle(ray.direction, Vector3.forward) < 1f;
                new Plane(Vector3.back, new Vector3(0f, 0f, throughTheGap ? 4f : 2f)).Raycast(ray, out float distance);
                point = ray.GetPoint(distance);
                return true;
            }
        }

        static DetectedObject Box(float xMin, float yMin, float xMax, float yMax) =>
            new DetectedObject(39, "bottle", 0.8f, Rect.MinMaxRect(xMin, yMin, xMax, yMax), Vector2Int.zero);

        static readonly Pose AtEyeHeight = new Pose(new Vector3(0f, 1.5f, 0f), Quaternion.identity);

        [Test]
        public void ABoxInTheMiddleOfTheImage_IsStraightAhead_AtTheDepthOfTheSurface()
        {
            var locator = new Object3DLocator(new Pinhole(), new Wall(2f));
            Assert.IsTrue(locator.TryLocate(Box(0.4f, 0.4f, 0.6f, 0.6f), AtEyeHeight, out var located));
            Assert.AreEqual(0f, located.WorldPosition.x, 1e-4f);
            Assert.AreEqual(1.5f, located.WorldPosition.y, 1e-4f);
            Assert.AreEqual(2f, located.WorldPosition.z, 1e-4f);
            Assert.AreEqual(Vector3.forward, located.Facing);
        }

        [Test]
        public void ABoxHighInTheImage_IsAboveEyeHeight()
        {
            // The viewport's y runs up. If this lands BELOW eye height, the flip has been applied twice (or not at all).
            var locator = new Object3DLocator(new Pinhole(), new Wall(2f));
            Assert.IsTrue(locator.TryLocate(Box(0.45f, 0.8f, 0.55f, 0.9f), AtEyeHeight, out var located));
            Assert.Greater(located.WorldPosition.y, 1.5f + 0.5f);
        }

        [Test]
        public void Size_IsTheBoxesExtentAtThatDistance_InMetres()
        {
            // Half the image's height, 2 m away, through a 60-degree lens: 2 * tan(30) = 1.155 m. Twice as far, twice as big.
            var box = Box(0.25f, 0.25f, 0.75f, 0.75f);
            Assert.IsTrue(new Object3DLocator(new Pinhole(), new Wall(2f)).TryLocate(box, AtEyeHeight, out var near));
            Assert.IsTrue(new Object3DLocator(new Pinhole(), new Wall(4f)).TryLocate(box, AtEyeHeight, out var far));
            Assert.AreEqual(2f * Mathf.Tan(30f * Mathf.Deg2Rad), near.WorldSize.y, 1e-3f);
            Assert.AreEqual(near.WorldSize.y * 4f / 3f, near.WorldSize.x, 1e-3f, "a 4:3 image is a third wider than it is tall");
            Assert.AreEqual(near.WorldSize.y * 2f, far.WorldSize.y, 1e-3f);
        }

        [Test]
        public void ARayThroughAGapInTheObject_DoesNotPutTheLabelOnTheWallBehind()
        {
            var chair = new ThingWithAGap();
            var box = Box(0.3f, 0.3f, 0.7f, 0.7f);

            var centreOnly = new Object3DLocator(new Pinhole(), chair) { DepthSamples = 1 };
            Assert.IsTrue(centreOnly.TryLocate(box, AtEyeHeight, out var fooled));
            Assert.AreEqual(4f, fooled.WorldPosition.z, 1e-3f, "the centre pixel alone measures the wall");

            chair.Rays = 0;
            var sampled = new Object3DLocator(new Pinhole(), chair);
            Assert.IsTrue(sampled.TryLocate(box, AtEyeHeight, out var located));
            Assert.AreEqual(5, chair.Rays, "five depth rays, no more");
            Assert.AreEqual(2f, located.WorldPosition.z, 0.05f, "a near distance among the samples: the chair, not the wall");
            Assert.AreEqual(0f, located.WorldPosition.x, 1e-3f, "and still on the centre pixel's ray");
            Assert.AreEqual(1.5f, located.WorldPosition.y, 1e-3f);
        }

        [Test]
        public void NoDepth_IsNoObject()
        {
            var locator = new Object3DLocator(new Pinhole(), new Wall(null));
            Assert.IsFalse(locator.TryLocate(Box(0.4f, 0.4f, 0.6f, 0.6f), AtEyeHeight, out _), "a guessed depth is a label floating somewhere convincing and wrong");
        }

        [Test]
        public void TheRay_StartsWhereTheCameraWasWhenTheImageWasTaken()
        {
            // Inference takes ~100 ms and the head keeps moving: the pose handed in is the one to use, whatever "now" is.
            var wall = new Wall(3f);
            var then = new Pose(new Vector3(0.4f, 1.2f, -0.3f), Quaternion.Euler(0f, 20f, 0f));
            Assert.IsTrue(new Object3DLocator(new Pinhole(), wall).TryLocate(Box(0.4f, 0.4f, 0.6f, 0.6f), then, out var located));
            Assert.AreEqual(then.position, wall.FirstRay.Value.origin);
            Assert.Less(Vector3.Angle(then.rotation * Vector3.forward, wall.FirstRay.Value.direction), 0.01f);
            Assert.Greater(located.WorldPosition.x, then.position.x, "turned 20 degrees to the right, so the hit is to the right");
        }
    }
}
