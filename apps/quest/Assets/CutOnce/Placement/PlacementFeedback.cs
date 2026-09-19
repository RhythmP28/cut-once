using UnityEngine;

namespace CutOnce.Placement
{
    /// <summary>Single visual owner. Uses the project's existing stereo hologram shader.</summary>
    public sealed class PlacementFeedback : MonoBehaviour
    {
        public PlacementBinding binding;
        public Renderer targetRenderer;
        public Renderer objectRenderer;
        public Vector3 size;
        public bool hideConfirmedTarget = true;
        MaterialPropertyBlock properties;
        static readonly int Fill = Shader.PropertyToID("_FillColor"), Edge = Shader.PropertyToID("_EdgeColor"),
            HalfSize = Shader.PropertyToID("_HalfSize"), EdgeMode = Shader.PropertyToID("_EdgeMode");

        void OnEnable()
        {
            properties = new MaterialPropertyBlock();
            binding.StateChanged += Apply;
            Apply(binding.State);
        }
        void OnDisable() { if (binding != null) binding.StateChanged -= Apply; }
        void Apply(PlacementState state)
        {
            Color colour = state == PlacementState.Confirmed ? new Color(0.2f, 1, 0.35f) :
                state == PlacementState.Near || state == PlacementState.Aligning ? new Color(1, 0.75f, 0.1f) :
                state == PlacementState.TrackingLost ? new Color(0.5f, 0.55f, 0.65f) : new Color(0.1f, 0.8f, 1);
            Paint(targetRenderer, colour, 0.12f);
            Paint(objectRenderer, colour, state == PlacementState.Confirmed ? 0.35f : 0.2f);
            if (targetRenderer != null) targetRenderer.enabled = !hideConfirmedTarget || state != PlacementState.Confirmed;
        }
        void Paint(Renderer renderer, Color colour, float alpha)
        {
            if (renderer == null) return;
            properties.Clear();
            properties.SetVector(HalfSize, size * 0.5f);
            properties.SetFloat(EdgeMode, 1);
            properties.SetColor(Edge, new Color(colour.r, colour.g, colour.b, 1));
            properties.SetColor(Fill, new Color(colour.r, colour.g, colour.b, alpha));
            renderer.SetPropertyBlock(properties);
        }
    }
}
