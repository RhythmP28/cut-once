using UnityEngine;

namespace CutOnce.AR
{
    static class Objects
    {
        /// <summary>Destroy is refused outside play mode (EditMode tests, editor tools); DestroyImmediate is wrong inside it.</summary>
        public static void Discard(Object o)
        {
            if (o == null) return;
            if (Application.isPlaying) Object.Destroy(o); else Object.DestroyImmediate(o);
        }
    }
}
