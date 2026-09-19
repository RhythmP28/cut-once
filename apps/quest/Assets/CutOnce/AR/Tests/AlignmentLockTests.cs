using CutOnce.AR;
using NUnit.Framework;
using UnityEngine;

namespace CutOnce.AR.Tests
{
    public class AlignmentLockTests
    {
        [Test]
        public void LockAtPutsTheBuildWhereBuildModeSaysAndLocksIt()
        {
            var go = new GameObject("AssemblyRoot (test)");
            try
            {
                var alignment = go.AddComponent<AlignmentController>();
                alignment.Init(go.AddComponent<AssemblyView>(), null, null, null);
                var pose = new Pose(new Vector3(1f, 0.74f, 2f), Quaternion.Euler(0f, 30f, 0f));
                alignment.LockAt(pose, "build");
                Assert.That(alignment.State, Is.EqualTo(AlignmentState.Locked));
                Assert.That(alignment.Method, Is.EqualTo("build"));
                Assert.That(Vector3.Distance(go.transform.position, pose.position), Is.LessThan(1e-5f));
                Assert.That(Quaternion.Angle(go.transform.rotation, pose.rotation), Is.LessThan(0.01f));
            }
            finally { Object.DestroyImmediate(go); }
        }
    }
}
