namespace CutOnce.Diagnostics
{
    /// <summary>
    /// What one frame on the Quest 3 may cost. Meta's guidance for Quest 3
    /// (developers.meta.com/horizon/documentation/unity/unity-perf): at least 72 fps, 200 to 1,000 draw calls
    /// depending on how busy the CPU is, and 1.3 to 1.8 million triangles per frame. We stay well inside that,
    /// because passthrough and the see-through hologram fills also cost GPU time.
    ///
    /// Counts (draw calls, triangles) are the same in the simulator as on the headset, so they can be checked on a
    /// laptop. Time per frame is not: only the headset tells you that.
    /// </summary>
    public static class QuestBudgets
    {
        public const int TargetFps = 72;
        public const float FrameBudgetMs = 1000f / TargetFps;
        public const int MaxDrawCalls = 300;
        public const int MaxTriangles = 1_000_000;
        /// <summary>See-through surfaces are drawn back to front and each one costs a full pass over its pixels.</summary>
        public const int MaxTransparentRenderers = 150;
        public const int MaxTextureSize = 2048;
    }
}
