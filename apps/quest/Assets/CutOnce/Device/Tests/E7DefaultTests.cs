using System;
using System.Collections;
using System.IO;
using CutOnce.AR;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace CutOnce.Device.PlayTests
{
    /// <summary>
    /// With no server and no journal, the app opens on E7: the bundled plan, drawn from the bundled model file as a
    /// 1:200 tabletop model. Points the app at a closed port through the pushed-config file, and moves any existing
    /// config and journal aside for the test (they are put back afterwards), so a developer's data is never lost.
    /// </summary>
    public class E7DefaultTests
    {
        string _config, _journal, _configBackup, _journalBackup;

        [SetUp]
        public void SetUp()
        {
            _config = Path.Combine(Application.persistentDataPath, "cutonce.config.json");
            _journal = Path.Combine(Application.persistentDataPath, "cutonce");
            _configBackup = _config + ".before-e7-test"; _journalBackup = _journal + ".before-e7-test";
            if (File.Exists(_config)) File.Move(_config, _configBackup);
            if (Directory.Exists(_journal)) Directory.Move(_journal, _journalBackup);
            File.WriteAllText(_config, "{\"server_url\":\"http://127.0.0.1:9\",\"api_token\":\"none\",\"device_id\":\"e7-test\"}");   // port 9: nothing listens
        }

        [TearDown]
        public void TearDown()
        {
            if (File.Exists(_config)) File.Delete(_config);
            if (Directory.Exists(_journal)) Directory.Delete(_journal, true);
            if (File.Exists(_configBackup)) File.Move(_configBackup, _config);
            if (Directory.Exists(_journalBackup)) Directory.Move(_journalBackup, _journal);
        }

        [UnityTest]
        public IEnumerator OfflineTheAppOpensOnE7AsATabletopModel()
        {
            var type = Type.GetType("CutOnce.Device.CutOnceApp, Assembly-CSharp");
            Assert.That(type, Is.Not.Null);
            var go = new GameObject("[App] (E7 test)");
            var app = go.AddComponent(type);
            type.GetField("createCopilot").SetValue(app, false);

            AssemblyView assembly = null;
            for (float waited = 0f; waited < 20f; waited += Time.unscaledDeltaTime)
            {
                assembly = UnityEngine.Object.FindAnyObjectByType<AssemblyView>();
                if (assembly != null && assembly.Plan?.plan_id == "plan_e7_massing" && assembly.Views.Count > 0) break;
                yield return null;
            }
            try
            {
                Assert.That(assembly?.Plan?.plan_id, Is.EqualTo("plan_e7_massing"), "offline with no journal, the bundled plan is E7");
                Assert.That(assembly.Views.Count, Is.EqualTo(assembly.Plan.parts.Count));
                Assert.That(assembly.ScaleLabel, Is.EqualTo("1:200"));
                var slab = assembly.ViewOf("part_e7_l01_slab");
                Assert.That(slab.GetComponent<MeshFilter>().sharedMesh.vertexCount, Is.GreaterThan(36), "drawn from the bundled model file, not as a box");
                Assert.That(slab.Style, Is.Not.Null, "every part has a look");
                Assert.That(slab.Style.dashed, Is.True, "E7's parts carry benchmark tolerances of metres, so they draw dashed");
            }
            finally { UnityEngine.Object.Destroy(go); }
            yield return null;
        }
    }
}
