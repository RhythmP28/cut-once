using System.Collections.Generic;
using Unity.Profiling;
using UnityEngine;

namespace CutOnce.Diagnostics
{
    /// <summary>
    /// Measures every frame against <see cref="QuestBudgets"/> and warns in the console when a budget is broken.
    /// Put one in every scene. In the simulator, the draw call and triangle numbers are the ones the headset will see
    /// (plans and the E7 model are loaded at runtime, so a scene scan cannot count them). The milliseconds are only
    /// meaningful on the headset: in the Editor they are this computer's. Development builds on the headset also log
    /// the numbers every <see cref="logEverySeconds"/> seconds (adb logcat -s Unity, lines starting [Budget]).
    ///
    /// The public fields are the latest averages over <see cref="windowSeconds"/>, so an agent driving the simulator
    /// through Meta XR Operator can read them off this component.
    /// </summary>
    [DefaultExecutionOrder(10000)]
    public sealed class BudgetProbe : MonoBehaviour
    {
        [Tooltip("Seconds per measurement window.")]
        public float windowSeconds = 2f;
        [Tooltip("Development builds on the headset log the numbers this often. 0 turns it off.")]
        public float logEverySeconds = 10f;

        [Header("Latest averages (read-only)")]
        /// <summary>
        /// Unity's draw call or batch counter, whichever is larger. Inside the Editor under XR both read 0, so there a
        /// count of visible renderer-material pairs stands in: the same number the headset draws for the same content.
        /// </summary>
        public int drawCalls;
        public int triangles;
        /// <summary>CPU work per frame: the busier of the main thread (minus its wait for present) and the render thread.</summary>
        public float cpuMs;
        public float gpuMs;
        public bool overBudget;

        ProfilerRecorder _drawCalls, _batches, _triangles;
        readonly FrameTiming[] _timing = new FrameTiming[1];
        readonly List<Material> _materials = new();
        float _windowStart, _lastLog;
        int _frames, _gpuFrames;
        long _drawSum, _triSum;
        double _cpuSum, _gpuSum;

        void OnEnable()
        {
            _drawCalls = ProfilerRecorder.StartNew(ProfilerCategory.Render, "Draw Calls Count");
            _batches = ProfilerRecorder.StartNew(ProfilerCategory.Render, "Batches Count");
            _triangles = ProfilerRecorder.StartNew(ProfilerCategory.Render, "Triangles Count");
            _windowStart = _lastLog = Time.unscaledTime;
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
                // cpuFrameTime is the interval between frames, waiting included, so at 72 Hz it always reads ~13.9 ms.
                // The work is the main thread minus its wait for present, or the render thread, whichever is longer.
                var t = _timing[0];
                _cpuSum += System.Math.Max(t.cpuMainThreadFrameTime - t.cpuMainThreadPresentWaitTime, t.cpuRenderThreadFrameTime);
                if (t.gpuFrameTime > 0) { _gpuSum += t.gpuFrameTime; _gpuFrames++; }
            }

            if (Time.unscaledTime - _windowStart < windowSeconds) return;
            drawCalls = (int)(_drawSum / _frames);
            if (drawCalls == 0) drawCalls = VisibleDrawCalls(); // only when Unity's counters are silent (the Editor)
            triangles = (int)(_triSum / _frames);
            cpuMs = (float)(_cpuSum / _frames);
            gpuMs = _gpuFrames > 0 ? (float)(_gpuSum / _gpuFrames) : 0f;
            Report();
            _windowStart = Time.unscaledTime;
            _frames = 0; _gpuFrames = 0; _drawSum = 0; _triSum = 0; _cpuSum = 0; _gpuSum = 0;
        }

        /// <summary>One draw per material on each renderer some camera can see. SRP batching can merge a few.</summary>
        int VisibleDrawCalls()
        {
            int draws = 0;
            foreach (var r in FindObjectsByType<Renderer>(FindObjectsInactive.Exclude))
            {
                if (!r.enabled || !r.isVisible) continue;
                r.GetSharedMaterials(_materials);
                draws += _materials.Count;
            }
            return draws;
        }

        void Report()
        {
            var problems = new List<string>();
            if (drawCalls > QuestBudgets.MaxDrawCalls) problems.Add($"{drawCalls} draw calls (budget {QuestBudgets.MaxDrawCalls})");
            if (triangles > QuestBudgets.MaxTriangles) problems.Add($"{triangles:N0} triangles (budget {QuestBudgets.MaxTriangles:N0})");
            // Times are only judged on the headset: a laptop is several times faster than the Quest 3.
            if (!Application.isEditor && gpuMs > QuestBudgets.FrameBudgetMs) problems.Add($"GPU {gpuMs:F1} ms (budget {QuestBudgets.FrameBudgetMs:F1} ms at {QuestBudgets.TargetFps} fps)");
            if (!Application.isEditor && cpuMs > QuestBudgets.FrameBudgetMs) problems.Add($"CPU {cpuMs:F1} ms (budget {QuestBudgets.FrameBudgetMs:F1} ms)");
            bool was = overBudget;
            overBudget = problems.Count > 0;
            // Once on the way over and once on the way back, so the console stays readable.
            if (overBudget && !was) Debug.LogWarning("[Budget] over the Quest 3 budget: " + string.Join(", ", problems));
            else if (!overBudget && was) Debug.Log("[Budget] back inside the Quest 3 budget");

            if (Debug.isDebugBuild && !Application.isEditor && logEverySeconds > 0 && Time.unscaledTime - _lastLog >= logEverySeconds)
            {
                _lastLog = Time.unscaledTime;
                Debug.Log($"[Budget] GPU {gpuMs:F1} ms, CPU {cpuMs:F1} ms (budget {QuestBudgets.FrameBudgetMs:F1}), {drawCalls} draw calls, {triangles:N0} triangles");
            }
        }
    }
}
