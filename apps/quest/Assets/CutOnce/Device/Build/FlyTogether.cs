using System;
using System.Collections.Generic;
using System.Linq;
using CutOnce.AR;
using CutOnce.Core;
using UnityEngine;

namespace CutOnce.Device
{
    /// <summary>
    /// The Lego Movie moment: each design part starts on its real object (its twin's pose) and flies along a raised arc to
    /// its ghost in the design, in build order, 0.3 s apart. At the end every part is back at its exact rest pose.
    /// </summary>
    public sealed class FlyTogether : MonoBehaviour
    {
        struct Flight { public Transform view; public Vector3 from, toLocal; public Quaternion fromRot, toLocalRot; public int order; public float distance; }
        /// <summary>A box or an upright cylinder looks the same after half a turn about any of its own axes.</summary>
        static readonly Quaternion[] SameLook = { Quaternion.identity, Quaternion.Euler(180f, 0f, 0f), Quaternion.Euler(0f, 180f, 0f), Quaternion.Euler(0f, 0f, 180f) };
        readonly List<Flight> _flights = new List<Flight>();
        Transform _root; float _started = -1f;
        public event Action Finished;
        public bool Running => _started >= 0f;

        public void Play(AssemblyView assembly, PlanDto plan, BuildIdeaDto idea, TwinOverlay twins)
        {
            Stop();
            _root = assembly.transform;
            int order = 0;
            foreach (var step in plan.steps.OrderBy(s => s.index))
                foreach (var partId in step.part_ids)
                {
                    if (!assembly.Views.TryGetValue(partId, out var view) || idea?.twin_of == null || !idea.twin_of.TryGetValue(partId, out var twinId)) continue;
                    if (!twins.TryGetStartPose(twinId, view.Part, out var p, out var r)) continue;
                    var t = view.transform;
                    r = LeastTurn(r, t.rotation);
                    _flights.Add(new Flight { view = t, from = p, fromRot = r, toLocal = t.localPosition, toLocalRot = t.localRotation, order = order++, distance = Vector3.Distance(p, t.position) });
                    t.SetPositionAndRotation(p, r);
                }
            _started = _flights.Count > 0 ? Time.time : -1f;
            if (_started < 0f) Finished?.Invoke();                               // nothing to fly (no twins on this headset): straight to the walkthrough
        }

        /// <summary>Of the start turns that look the same, the one nearest the rest pose, so a piece turns as little as it can on the way.</summary>
        static Quaternion LeastTurn(Quaternion start, Quaternion rest)
        {
            var best = start; float least = float.MaxValue;
            foreach (var same in SameLook)
            {
                float angle = Quaternion.Angle(start * same, rest);
                if (angle < least - 0.01f) { least = angle; best = start * same; }
            }
            return best;
        }

        /// <summary>Another run took over mid-flight: put what is still there at rest and forget the flights. Finished is not raised.</summary>
        public void Stop()
        {
            Rest();
            _flights.Clear(); _started = -1f;
        }

        void Rest()
        {
            for (int i = 0; i < _flights.Count; i++)
            {
                if (_flights[i].view == null) continue;                          // its hologram was rebuilt meanwhile
                _flights[i].view.localPosition = _flights[i].toLocal; _flights[i].view.localRotation = _flights[i].toLocalRot;
            }
        }

        void Update()
        {
            if (_started < 0f) return;
            if (_root == null) { Stop(); return; }
            float elapsed = Time.time - _started;
            bool done = true;
            for (int i = 0; i < _flights.Count; i++)
            {
                var f = _flights[i];
                if (f.view == null) continue;
                double t = FlyPath.Progress(f.order, elapsed);
                if (t < 1) done = false;
                float e = (float)FlyPath.Ease(t);
                var pos = Vector3.LerpUnclamped(f.from, _root.TransformPoint(f.toLocal), e) + Vector3.up * (float)FlyPath.Lift(e, f.distance);
                f.view.SetPositionAndRotation(pos, Quaternion.Slerp(f.fromRot, _root.rotation * f.toLocalRot, e));
            }
            if (!done) return;
            Rest();
            _flights.Clear(); _started = -1f;
            Finished?.Invoke();
        }
    }
}
