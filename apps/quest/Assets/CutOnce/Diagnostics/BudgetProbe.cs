using Unity.Profiling;
using UnityEngine;

namespace CutOnce.Diagnostics
{
    /// <summary>
    /// Measures every frame against <see cref="QuestBudgets"/> and warns in the console when a budget is broken.
    /// Put one in every scene. In the simulator, the draw call and triangle numbers are the ones the headset will see
    /// (plans and the E7 model are loaded at runtime, so a scene scan cannot count them). The milliseconds are only
    /// meaningful on the headset: in the Editor they are this computer's.
    ///
    /// The public fields are the latest two-second averages, so an agent driving the simulator through
    /// Meta XR Operator can read them off this component.
    /// </summary>
    [DefaultExecutionOrder(10000)]
    public sealed class BudgetProbe : MonoBehaviour
    {
        [Tooltip("Seconds between reports.")]
        public float windowSeconds = 2f;

        [Header("Latest averages (read-only)")]
        /// <summary>
        /// The larger of Unity's counters and a count of visible renderer-material pairs. Inside the Editor under XR,
        /// Unity's draw call and batch counters read 0, so the count is what keeps the simulator honest.
        /// </summary>
        public int drawCalls;
        public int triangles;
        public float cpuMs;
        public float gpuMs;
        public bool overBudget;

        ProfilerRecorder _drawCalls, _batches, _triangles;
        readonly FrameTiming[] _timing = new FrameTiming[1];
        float _windowStart;
        int _frames;
        long _drawSum, _triSum;
        double _cpuSum, _gpuSum;
        int _gpuFrames;

        void OnEnable()
        {
            _drawCalls = ProfilerRecorder.StartNew(ProfilerCategory.Render, "Draw Calls Count");
            _batches = ProfilerRecorder.StartNew(ProfilerCategory.Render, "Batches Count");
            _triangles = ProfilerRecorder.StartNew(ProfilerCategory.Render, "Triangles Count");
            _windowStart = Time.unscaledTime;
        }

        void OnDisable()
        {
            _drawCalls.Dispose();
            _batches.Dispose();
            _triangles.Dispose();
        }

        void LateUpdate()
        {
            _frames++;
            _drawSum += System.Math.Max(_drawCalls.Valid ? _drawCalls.LastValue : 0, _batches.Valid ? _batches.LastValue : 0);
            _triSum += _triangles.Valid ? _triangles.LastValue : 0;
            FrameTimingManager.CaptureFrameTimings();
            if (FrameTimingManager.GetLatestTimings(1, _timing) == 1)
            {
                _cpuSum += _timing[0].cpuFrameTime;
                if (_timing[0].gpuFrameTime > 0) { _gpuSum += _timing[0].gpuFrameTime; _gpuFrames++; }
            }

            if (Time.unscaledTime - _windowStart < windowSeconds) return;
            drawCalls = Mathf.Max((int)(_drawSum / _frames), VisibleDrawCalls());
            triangles = (int)(_triSum / _frames);
            cpuMs = (float)(_cpuSum / _frames);
            gpuMs = _gpuFrames > 0 ? (float)(_gpuSum / _gpuFrames) : 0f;
            Report();
            _windowStart = Time.unscaledTime;
            _frames = 0; _gpuFrames = 0; _drawSum = 0; _triSum = 0; _cpuSum = 0; _gpuSum = 0;
        }

        /// <summary>
        /// One draw per material on each renderer some camera can see. SRP batching can merge a few; it is the same
        /// number on the headset and in the simulator for the same content. Runs once per window, not per frame.
        /// </summary>
        static int VisibleDrawCalls()
        {
            int draws = 0;
            foreach (var r in FindObjectsByType<Renderer>(FindObjectsInactive.Exclude))
                if (r.enabled && r.isVisible) draws += r.sharedMaterials.Length;
            return draws;
        }

        void Report()
        {
            var problems = new System.Collections.Generic.List<string>();
            if (drawCalls > QuestBudgets.MaxDrawCalls) problems.Add($"{drawCalls} draw calls (budget {QuestBudgets.MaxDrawCalls})");
            if (triangles > QuestBudgets.MaxTriangles) problems.Add($"{triangles:N0} triangles (budget {QuestBudgets.MaxTriangles:N0})");
            // Frame times are only judged on the device: a laptop is several times faster than the Quest 3.
            if (!Application.isEditor && gpuMs > QuestBudgets.FrameBudgetMs) problems.Add($"GPU {gpuMs:F1} ms (budget {QuestBudgets.FrameBudgetMs:F1} ms at {QuestBudgets.TargetFps} fps)");
            if (!Application.isEditor && cpuMs > QuestBudgets.FrameBudgetMs) problems.Add($"CPU {cpuMs:F1} ms (budget {QuestBudgets.FrameBudgetMs:F1} ms)");
            bool was = overBudget;
            overBudget = problems.Count > 0;
            // Once on the way over and once on the way back, so the console stays readable.
            if (overBudget && !was) Debug.LogWarning("[Budget] over the Quest 3 budget: " + string.Join(", ", problems));
            else if (!overBudget && was) Debug.Log("[Budget] back inside the Quest 3 budget");
        }
    }
}
