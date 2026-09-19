using UnityEngine;

namespace CutOnce.AR
{
    /// <summary>
    /// The shader sits in a Resources folder so a build always includes it: nothing in a scene references it,
    /// and Shader.Find alone does not keep a shader from being stripped.
    /// </summary>
    public static class HologramMaterial
    {
        public const string ShaderName = "CutOnce/Hologram", ResourcePath = "CutOnce/Hologram";

        public static Material Create()
        {
            var shader = Resources.Load<Shader>(ResourcePath);
            if (shader == null) shader = Shader.Find(ShaderName);
            if (shader == null)
            {
                Debug.LogError("[CutOnce] The hologram shader is missing from the build; falling back to a plain unlit shader.");
                shader = Shader.Find("Universal Render Pipeline/Unlit");
            }
            return new Material(shader) { name = "CutOnce Hologram (shared)", enableInstancing = false };
        }
    }
}
