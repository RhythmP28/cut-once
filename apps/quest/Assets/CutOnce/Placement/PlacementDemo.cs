using CutOnce.AR;
using UnityEngine;
using UnityEngine.Rendering;

namespace CutOnce.Placement
{
    /// <summary>Three movable fixture objects; no camera, network, recognition, or real-world physics claims.</summary>
    public sealed class PlacementDemo : MonoBehaviour
    {
        public SimulatedObjectPoseSource Source { get; private set; }
        public PlacementBinding[] Bindings { get; private set; }
        public ControllerObjectGrabber Grabber { get; private set; }
        Material material;
        readonly Mesh[] meshes = new Mesh[3];
        readonly Vector3[] starts = { new Vector3(-0.4f, 0.85f, 0.55f), new Vector3(0.4f, 0.85f, 0.55f), new Vector3(0, 1.2f, 0.6f) };

        void Start()
        {
            material = HologramMaterial.Create();
            Source = gameObject.AddComponent<SimulatedObjectPoseSource>();
            Source.objects = new SimulatedObjectPoseSource.Entry[3];
            Bindings = new PlacementBinding[3];
            var movableObjects = new Transform[3];
            var ids = new[] { "box_01", "box_02", "plank_01" };
            var sizes = new[] { new Vector3(0.18f, 0.2f, 0.18f), new Vector3(0.18f, 0.2f, 0.18f), new Vector3(0.7f, 0.04f, 0.2f) };
            var destinations = new[] { new Vector3(-0.24f, 0.85f, 1), new Vector3(0.24f, 0.85f, 1), new Vector3(0, 0.97f, 1) };
            for (int i = 0; i < 3; i++)
            {
                meshes[i] = ShapeFactory.Box(sizes[i]);
                var item = new GameObject(ids[i]);
                item.SetActive(false);
                item.transform.SetParent(transform, false);
                var real = Visual("Simulated object - move me", item.transform, meshes[i], starts[i]);
                var collider = real.gameObject.AddComponent<BoxCollider>();
                collider.size = sizes[i];
                var target = Visual("Target - keep fixed", item.transform, meshes[i], destinations[i]);
                Source.objects[i] = new SimulatedObjectPoseSource.Entry { objectId = ids[i], objectTransform = real.transform };
                movableObjects[i] = real.transform;
                var binding = item.AddComponent<PlacementBinding>();
                binding.objectId = ids[i]; binding.poseSource = Source; binding.target = target.transform;
                binding.settings.rotationRule = RotationRule.HalfTurnAroundLocalY;
                Bindings[i] = binding;
                var feedback = item.AddComponent<PlacementFeedback>();
                feedback.binding = binding; feedback.objectRenderer = real; feedback.targetRenderer = target; feedback.size = sizes[i];
                item.SetActive(true);
            }
            var rig = FindAnyObjectByType<OVRCameraRig>();
            Grabber = gameObject.AddComponent<ControllerObjectGrabber>();
            Grabber.Configure(movableObjects, rig == null ? null : rig.trackingSpace);
            Debug.Log("[Placement] Fixture demo ready. Cut Once > Placement Demo: select objects, snap, lose tracking, or reset. Cyan = misplaced; yellow = near/holding; green = confirmed; grey = tracking lost.");
        }

        Renderer Visual(string name, Transform parent, Mesh mesh, Vector3 position)
        {
            var obj = new GameObject(name);
            obj.transform.SetParent(parent, false);
            obj.transform.localPosition = position;
            obj.AddComponent<MeshFilter>().sharedMesh = mesh;
            var renderer = obj.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = material;
            renderer.shadowCastingMode = ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            return renderer;
        }

        public void Snap(int index)
        {
            var t = Bindings[index].target;
            Source.objects[index].objectTransform.SetPositionAndRotation(t.position, t.rotation);
        }
        public void ResetDemo()
        {
            for (int i = 0; i < 3; i++)
            {
                Source.objects[i].objectTransform.localPosition = starts[i];
                Source.objects[i].objectTransform.localRotation = Quaternion.identity;
                Source.objects[i].tracked = true;
                Source.objects[i].confidence = 1;
            }
        }
        void OnDestroy()
        {
            if (material != null) Destroy(material);
            for (int i = 0; i < meshes.Length; i++) if (meshes[i] != null) Destroy(meshes[i]);
        }
    }
}
