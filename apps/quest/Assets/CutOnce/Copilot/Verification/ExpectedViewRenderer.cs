using UnityEngine;

namespace CutOnce.Copilot.Verification
{
    /// <summary>
    /// Renders section 11's "expected view": the same viewpoint as the photo, with parts already
    /// installed in grey and the one part being checked in solid magenta. The server crops both images
    /// to the same box and asks one narrow question — "is that object at the magenta location?" — which
    /// is a far easier question than "what is in this picture?".
    ///
    /// The projection matrix is built from the camera's real intrinsics rather than a field of view, so
    /// the render lines up with the photo pixel for pixel. Getting this wrong makes every verdict wrong,
    /// so check it against A1's proof overlay before trusting a verdict.
    /// </summary>
    public class ExpectedViewRenderer : MonoBehaviour
    {
        public int width = 640;
        public int height = 480;
        public Material builtMaterial;   // flat grey, unlit
        public Material targetMaterial;  // solid magenta, unlit
        public Transform assemblyRoot;

        private Camera _camera;
        private RenderTexture _rt;
        private Texture2D _readback;

        private void EnsureCamera()
        {
            if (_camera != null) return;
            var go = new GameObject("[ExpectedView]") { hideFlags = HideFlags.DontSave };
            go.transform.SetParent(transform, false);
            _camera = go.AddComponent<Camera>();
            _camera.enabled = false;                 // rendered on demand only
            _camera.clearFlags = CameraClearFlags.SolidColor;
            _camera.backgroundColor = Color.black;
        }

        /// <summary>
        /// An off-centre pinhole projection matrix from fx, fy, cx, cy. Unity's `fieldOfView` cannot
        /// express a principal point that is not dead centre, and on a real camera it never is.
        /// </summary>
        public static Matrix4x4 ProjectionFrom(CameraIntrinsics k, float near, float far)
        {
            float left = -k.cx / k.fx * near;
            float right = (k.width - k.cx) / k.fx * near;
            // Image y grows downward, camera y grows upward, so top and bottom swap sign.
            float top = k.cy / k.fy * near;
            float bottom = -(k.height - k.cy) / k.fy * near;

            var m = new Matrix4x4();
            m[0, 0] = 2f * near / (right - left);
            m[1, 1] = 2f * near / (top - bottom);
            m[0, 2] = (right + left) / (right - left);
            m[1, 2] = (top + bottom) / (top - bottom);
            m[2, 2] = -(far + near) / (far - near);
            m[2, 3] = -2f * far * near / (far - near);
            m[3, 2] = -1f;
            return m;
        }

        /// <summary>Renders the view and returns it as a JPEG, ready to post as `expected_view`.</summary>
        public byte[] Render(Vector3 position, Quaternion rotation, CameraIntrinsics k, Renderer target)
        {
            EnsureCamera();
            _camera.transform.SetPositionAndRotation(position, rotation);
            _camera.projectionMatrix = ProjectionFrom(k, 0.05f, 30f);

            if (_rt == null || _rt.width != width || _rt.height != height)
            {
                if (_rt != null) _rt.Release();
                _rt = new RenderTexture(width, height, 24);
            }

            // Swap every material for a flat one, so the model judges shape and location, not our shading.
            var swapped = assemblyRoot != null ? assemblyRoot.GetComponentsInChildren<Renderer>() : new Renderer[0];
            var originals = new Material[swapped.Length];
            for (int i = 0; i < swapped.Length; i++)
            {
                originals[i] = swapped[i].sharedMaterial;
                swapped[i].sharedMaterial = swapped[i] == target ? targetMaterial : builtMaterial;
            }

            _camera.targetTexture = _rt;
            _camera.Render();
            _camera.targetTexture = null;

            for (int i = 0; i < swapped.Length; i++) swapped[i].sharedMaterial = originals[i];

            var previous = RenderTexture.active;
            RenderTexture.active = _rt;
            if (_readback == null || _readback.width != width || _readback.height != height)
            {
                if (_readback != null) Destroy(_readback);
                _readback = new Texture2D(width, height, TextureFormat.RGB24, false);
            }
            _readback.ReadPixels(new Rect(0, 0, width, height), 0, 0);
            _readback.Apply(false);
            RenderTexture.active = previous;

            return _readback.EncodeToJPG(90);
        }

        private void OnDestroy()
        {
            if (_rt != null) _rt.Release();
            if (_readback != null) Destroy(_readback);
        }
    }
}
