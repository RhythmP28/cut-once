using CutOnce.AR;
using UnityEngine;

namespace CutOnce.Scanner
{
    /// <summary>A detection, and where in the room it is.</summary>
    public readonly struct LocatedObject
    {
        public readonly DetectedObject Detection;
        /// <summary>Where the ray through the box's centre met a real surface: the FRONT of the object, not its middle.</summary>
        public readonly Vector3 WorldPosition;
        /// <summary>Width and height in metres: the box's extent at that distance.</summary>
        public readonly Vector2 WorldSize;
        /// <summary>From the camera towards the object, flattened to the floor plane: which way a box around it should face.</summary>
        public readonly Vector3 Facing;

        public LocatedObject(DetectedObject detection, Vector3 worldPosition, Vector2 worldSize, Vector3 facing)
        {
            Detection = detection;
            WorldPosition = worldPosition;
            WorldSize = worldSize;
            Facing = facing;
        }
    }

    /// <summary>
    /// 2D box to a point in the room: the centre of the box, as a ray from where the camera WAS when the image was
    /// taken, against the headset's depth sensing. The ray comes from Meta's own projection
    /// (PassthroughCameraAccess.ViewportPointToRay with the cached pose) and the hit from the app's existing
    /// ISurfaceRaycaster (QuestSurfaceRaycaster over EnvironmentRaycastManager): nothing here re-derives either.
    ///
    /// The object is always placed ON the centre pixel's ray. How far along it is the one refinement over the sample:
    /// a box around a chair or a plant has gaps in the middle, and a single ray through a gap measures the wall behind,
    /// so the label lands metres past the object. With DepthSamples above 1, four more rays are cast a quarter of the
    /// way in from each side and the distance used is a NEAR one among them (the lower quartile, not the median): a box
    /// always contains some background and never contains anything in front of the object.
    ///
    /// No hit means no object, exactly as in Meta's sample: a label with a guessed depth floats somewhere convincing
    /// and wrong. Glass, a dark corner, or anything past the depth sensor's reach simply does not get a label.
    /// </summary>
    public sealed class Object3DLocator
    {
        const float SmallestSizeMetres = 0.03f, LargestSizeMetres = 3f, SampleInset = 0.25f;

        /// <summary>1 = the centre pixel only, as Meta's sample does. 5 = centre plus one ray towards each side of the box.</summary>
        public int DepthSamples = 5;

        readonly IScannerFrameSource _frames;
        readonly ISurfaceRaycaster _surface;
        readonly float[] _distances = new float[5];

        public Object3DLocator(IScannerFrameSource frames, ISurfaceRaycaster surface)
        {
            _frames = frames;
            _surface = surface;
        }

        public bool TryLocate(in DetectedObject found, Pose cameraPose, out LocatedObject located)
        {
            located = default;
            Ray centre = _frames.ViewportPointToRay(found.Center, cameraPose);
            Vector3 forward = cameraPose.rotation * Vector3.forward;
            float alongCentre = Vector3.Dot(centre.direction, forward);             // how much of the centre ray points straight ahead
            if (alongCentre <= 1e-4f || !TryMeasureDepth(found.Box, centre, cameraPose, forward, out float depth)) return false;
            Vector3 hit = centre.GetPoint(depth / alongCentre);                     // the point on the centre ray at that depth

            // Size, as Meta's sample measures it: where the rays through the box's edges cross the plane that faces the
            // camera at the hit's distance. Four plane intersections, no more depth rays.
            var plane = new Plane(-forward, hit);
            Rect box = found.Box;
            if (!OnPlane(plane, new Vector2(box.xMin, box.center.y), cameraPose, out Vector3 left) || !OnPlane(plane, new Vector2(box.xMax, box.center.y), cameraPose, out Vector3 right)
                || !OnPlane(plane, new Vector2(box.center.x, box.yMin), cameraPose, out Vector3 bottom) || !OnPlane(plane, new Vector2(box.center.x, box.yMax), cameraPose, out Vector3 top))
                return false;
            var size = new Vector2(Mathf.Clamp(Vector3.Distance(left, right), SmallestSizeMetres, LargestSizeMetres), Mathf.Clamp(Vector3.Distance(bottom, top), SmallestSizeMetres, LargestSizeMetres));

            Vector3 facing = Vector3.ProjectOnPlane(hit - cameraPose.position, Vector3.up);
            facing = facing.sqrMagnitude > 1e-6f ? facing.normalized : Vector3.forward;
            located = new LocatedObject(found, hit, size, facing);
            return true;
        }

        /// <summary>
        /// How far in front of the camera the object is: a near depth among the rays that found a surface. Depth is measured
        /// straight ahead (along the camera's forward axis), not along each ray: rays point in different directions, and
        /// against a flat wall the off-centre ones are simply longer, which says nothing about what is nearer.
        /// </summary>
        bool TryMeasureDepth(Rect box, Ray centre, Pose cameraPose, Vector3 forward, out float depth)
        {
            int hits = 0;
            Sample(centre, forward, ref hits);
            if (DepthSamples > 1)
            {
                float dx = box.width * SampleInset, dy = box.height * SampleInset;
                Sample(_frames.ViewportPointToRay(box.center + new Vector2(-dx, 0f), cameraPose), forward, ref hits);
                Sample(_frames.ViewportPointToRay(box.center + new Vector2(dx, 0f), cameraPose), forward, ref hits);
                Sample(_frames.ViewportPointToRay(box.center + new Vector2(0f, -dy), cameraPose), forward, ref hits);
                Sample(_frames.ViewportPointToRay(box.center + new Vector2(0f, dy), cameraPose), forward, ref hits);
            }
            depth = 0f;
            if (hits == 0) return false;
            for (int i = 1; i < hits; i++)                                  // at most five: an insertion sort, no allocation
                for (int j = i; j > 0 && _distances[j] < _distances[j - 1]; j--) (_distances[j], _distances[j - 1]) = (_distances[j - 1], _distances[j]);
            depth = _distances[(hits - 1) / 4];                              // lower quartile: the 2nd nearest of five, the nearest of fewer
            return true;
        }

        void Sample(Ray ray, Vector3 forward, ref int hits)
        {
            if (ray.direction == Vector3.zero || !_surface.Raycast(ray, out Vector3 point)) return;
            float ahead = Vector3.Dot(point - ray.origin, forward);
            if (ahead > 0f) _distances[hits++] = ahead;
        }

        bool OnPlane(Plane plane, Vector2 viewportPoint, Pose cameraPose, out Vector3 point)
        {
            Ray ray = _frames.ViewportPointToRay(viewportPoint, cameraPose);
            bool crosses = plane.Raycast(ray, out float distance);
            point = crosses ? ray.GetPoint(distance) : default;
            return crosses;
        }
    }
}
