using System;
using System.Collections;
using CutOnce.AR;
using CutOnce.UI;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace CutOnce.Device.PlayTests
{
    /// <summary>
    /// Starts the whole app the way a scene does, with no server and no headset, and checks that the hologram and
    /// the HUD come up with no error logged. It is the test that catches a missing Resources file, a stripped shader
    /// or a broken wiring order, which no unit test can. CutOnceApp lives in Assembly-CSharp (it names Meta types),
    /// which a test assembly cannot reference, so it is found by name.
    /// </summary>
    public class AppSmokeTests
    {
        [UnityTest]
        public IEnumerator TheAppComesUpOfflineWithAHologramAndAHud()
        {
            var type = Type.GetType("CutOnce.Device.CutOnceApp, Assembly-CSharp");
            Assert.That(type, Is.Not.Null, "CutOnceApp is missing from Assembly-CSharp");

            var go = new GameObject("[App] (smoke test)");
            var app = go.AddComponent(type);
            type.GetField("createCopilot").SetValue(app, false);          // the copilot needs the headset's camera and microphone

            AssemblyView assembly = null;
            for (float waited = 0f; waited < 15f; waited += Time.unscaledDeltaTime)
            {
                assembly = UnityEngine.Object.FindAnyObjectByType<AssemblyView>();
                if (assembly != null && assembly.Views.Count > 0) break;
                yield return null;
            }

            Assert.That(assembly, Is.Not.Null, "no AssemblyRoot was created");
            Assert.That(assembly.Views.Count, Is.GreaterThan(0), "no plan was loaded within 15 s (server, journal and bundled plan all failed)");
            Assert.That(assembly.Views.Count, Is.EqualTo(assembly.Plan.parts.Count), "every part of the desk plan has a drawable shape");
            foreach (var view in assembly.Views.Values) Assert.That(view.Style, Is.Not.Null, $"{view.PartId} was never given a look");
            Assert.That(UnityEngine.Object.FindAnyObjectByType<HudController>(), Is.Not.Null);
            Assert.That(UnityEngine.Object.FindAnyObjectByType<AlignmentController>().State, Is.EqualTo(AlignmentState.Placing), "with no saved anchor the app asks to be placed");

            yield return null;
            UnityEngine.Object.Destroy(go);
        }

        [UnityTest]
        public IEnumerator TheCopilotComesUpInsideTheAppWithTheStoredPhotoInTheEditor()
        {
            var type = Type.GetType("CutOnce.Device.CutOnceApp, Assembly-CSharp");
            var go = new GameObject("[App] (copilot smoke test)");
            var app = go.AddComponent(type);                                   // createCopilot defaults to true

            CutOnce.Copilot.CopilotController copilot = null;
            for (float waited = 0f; waited < 5f && copilot == null; waited += Time.unscaledDeltaTime)
            {
                copilot = UnityEngine.Object.FindAnyObjectByType<CutOnce.Copilot.CopilotController>();
                yield return null;
            }

            Assert.That(copilot, Is.Not.Null, "the app did not create the copilot");
            Assert.That(copilot.hostBehaviour, Is.SameAs(app), "the app is the copilot's host");
            Assert.That(copilot.frameSourceBehaviour, Is.InstanceOf<CutOnce.Copilot.Capture.FixtureFrameSource>(),
                "the Editor asks with the stored photo, never the headset camera (AGENTS rule 1)");
            Assert.That(copilot.pushToTalkBehaviour, Is.InstanceOf<CutOnce.Copilot.IPushToTalk>());
            Assert.That(copilot.mic, Is.Not.Null);
            Assert.That(copilot.speaker, Is.Not.Null);

            UnityEngine.Object.Destroy(copilot.gameObject);
            UnityEngine.Object.Destroy(go);
        }
    }
}
