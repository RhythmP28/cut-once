using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Player;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace CutOnce.QuestTools
{
    /// <summary>
    /// Command-line entry points, run by tools/quest/unity.ts (pnpm quest:setup, quest:check, quest:build) with the
    /// Editor closed. Each one exits with 0 on success and 1 on failure.
    /// </summary>
    public static class Batch
    {
        // Setup's progress lives in SessionState, which survives the domain reload a Meta fix can trigger (a changed
        // scripting define recompiles the scripts and drops every delegate, the polling one included).
        const string SetupStep = "CutOnce.Setup.Step";       // 1 = Meta's Android fixes, 2 = Standalone fixes, 3 = finish
        const string SetupStarted = "CutOnce.Setup.Started";
        const double SetupTimeoutSeconds = 15 * 60;

        /// <summary>Applies our settings, lets Meta's Project Setup Tool fix what it knows about, then applies ours again.</summary>
        public static void Setup()
        {
            Guard(() =>
            {
                QuestSetup.Apply();
                QuestBaselineScene.EnsureExists();
                SessionState.SetFloat(SetupStarted, (float)EditorApplication.timeSinceStartup);
                SessionState.SetInt(SetupStep, 1);
                ContinueSetup();
            });
        }

        [InitializeOnLoadMethod]
        static void ResumeSetupAfterReload()
        {
            if (Application.isBatchMode && SessionState.GetInt(SetupStep, 0) > 0)
                EditorApplication.delayCall += () => Guard(ContinueSetup);
        }

        static void ContinueSetup()
        {
            if (EditorApplication.timeSinceStartup - SessionState.GetFloat(SetupStarted, 0f) > SetupTimeoutSeconds)
            {
                Debug.LogError("[CutOnce] setup did not finish in 15 minutes");
                EditorApplication.Exit(1);
                return;
            }
            switch (SessionState.GetInt(SetupStep, 0))
            {
                case 1: FixWithMeta(BuildTargetGroup.Android, () => { SessionState.SetInt(SetupStep, 2); ContinueSetup(); }); break;
                case 2: FixWithMeta(BuildTargetGroup.Standalone, () => { SessionState.SetInt(SetupStep, 3); ContinueSetup(); }); break;
                case 3:
                    QuestSetup.Apply(); // ours win where the two disagree; the check then shows what Meta still wants
                    SessionState.EraseInt(SetupStep);
                    Debug.Log("[CutOnce] setup done");
                    EditorApplication.Exit(0);
                    break;
            }
        }

        /// <summary>
        /// Compiles the code the way the Quest build does (Android, not the Editor), runs <see cref="QuestChecks"/>,
        /// reads Meta's Project Setup Tool report, and writes everything to -cutonceReport as JSON.
        /// </summary>
        public static void Check()
        {
            Guard(() =>
            {
                var findings = new List<QuestChecks.Finding>();
                findings.AddRange(CompileForQuest());
                findings.AddRange(QuestChecks.Run(includeScenes: true));
                findings.AddRange(MetaSetupReport());
                var path = Arg("-cutonceReport") ?? "Temp/quest-check.json";
                File.WriteAllText(path, JsonUtility.ToJson(new Report { findings = findings }, true));
                foreach (var f in findings) Debug.Log("[CutOnce] " + f);
                int errors = findings.Count(f => f.IsError);
                Debug.Log($"[CutOnce] check done: {errors} error(s), {findings.Count - errors} warning(s)");
                EditorApplication.Exit(errors == 0 ? 0 : 1);
            });
        }

        /// <summary>Builds the APK the headset installs. Development builds show the budget probe's numbers in logcat.</summary>
        public static void Build()
        {
            Guard(() =>
            {
                var output = Arg("-cutonceOutput") ?? "Builds/CutOnce.apk";
                bool release = Environment.GetCommandLineArgs().Contains("-cutonceRelease");
                var report = BuildApk(output, development: !release);
                EditorApplication.Exit(report.summary.result == BuildResult.Succeeded ? 0 : 1);
            });
        }

        /// <summary>
        /// Opens a scene (-cutonceScene, default: the first build scene) and presses Play, in the Editor window. Used by
        /// pnpm quest:play with Meta XR Simulator active; the Editor stays open for you to use.
        /// </summary>
        public static void Play()
        {
            var scene = Arg("-cutonceScene") ?? EditorBuildSettings.scenes.FirstOrDefault(s => s.enabled)?.path;
            if (scene == null) { Debug.LogError("[CutOnce] no scene to play: pass -cutonceScene or add one to the build"); return; }
            UnityEditor.SceneManagement.EditorSceneManager.OpenScene(scene);
            EditorApplication.delayCall += EditorApplication.EnterPlaymode;
        }

        [MenuItem("Cut Once/Build Quest APK", priority = 3)]
        static void BuildFromMenu()
        {
            var report = BuildApk("Builds/CutOnce.apk", development: true);
            if (report.summary.result == BuildResult.Succeeded) EditorUtility.RevealInFinder(report.summary.outputPath);
        }

        internal static BuildReport BuildApk(string output, bool development)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(output)));
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToArray(),
                locationPathName = output,
                target = BuildTarget.Android,
                targetGroup = BuildTargetGroup.Android,
                options = development ? BuildOptions.Development : BuildOptions.None,
            });
            var s = report.summary;
            Debug.Log($"[CutOnce] build {s.result}: {s.outputPath}, {s.totalSize / 1048576f:F1} MB, {s.totalTime.TotalSeconds:F0} s, {s.totalErrors} error(s)");
            return report;
        }

        /// <summary>
        /// The Editor compiles with UNITY_EDITOR and the Mac or Windows defines; the headset build compiles with
        /// UNITY_ANDROID. Code behind <c>#if UNITY_ANDROID &amp;&amp; !UNITY_EDITOR</c> never runs in the simulator, so this is
        /// the only place it gets compiled before a full build.
        /// </summary>
        static IEnumerable<QuestChecks.Finding> CompileForQuest()
        {
            var errors = new List<string>();
            void Capture(string message, string stack, LogType type)
            {
                if ((type == LogType.Error || type == LogType.Exception) && message.Contains("error CS")) errors.Add(message.Trim());
            }
            Application.logMessageReceived += Capture;
            ScriptCompilationResult result;
            try
            {
                result = PlayerBuildInterface.CompilePlayerScripts(new ScriptCompilationSettings
                {
                    target = BuildTarget.Android,
                    group = BuildTargetGroup.Android,
                    options = ScriptCompilationOptions.None,
                }, "Temp/QuestPlayerScripts");
            }
            finally { Application.logMessageReceived -= Capture; }

            bool ok = result.assemblies != null && result.assemblies.Count > 0 && errors.Count == 0;
            if (ok) yield break;
            if (errors.Count == 0) errors.Add("The scripts did not compile for Android; the Unity log has the details.");
            foreach (var e in errors.Distinct())
                yield return new QuestChecks.Finding { level = "Error", area = "code (Quest build)", message = e };
        }

        [Serializable] class MetaTask { public string uid, group, message, level; public bool isDone; }
        [Serializable] class MetaReport { public List<MetaTask> tasksStatus; }
        [Serializable] class Report { public List<QuestChecks.Finding> findings; }

        /// <summary>Meta's Project Setup Tool, for the active build target (Android when run by the check).</summary>
        static IEnumerable<QuestChecks.Finding> MetaSetupReport()
        {
            var path = Arg("-reportFile");
            if (path == null) yield break;
            if (File.Exists(path)) File.Delete(path);
            OVRProjectSetupCLI.GenerateProjectSetupReport();
            if (!File.Exists(path))
            {
                yield return new QuestChecks.Finding { level = "Warning", area = "meta", message = "Meta's Project Setup Tool wrote no report." };
                yield break;
            }
            var report = JsonUtility.FromJson<MetaReport>(File.ReadAllText(path));
            // We do not use Meta's Platform SDK (store, entitlements), and Meta says to ignore those tasks then.
            const string PlatformSdkOnly = "if you are not using any Platform SDK APIs";
            foreach (var t in report.tasksStatus.Where(t => !t.isDone && (t.level == "Required" || t.level == "Recommended")
                                                              && !t.message.Contains(PlatformSdkOnly)))
                yield return new QuestChecks.Finding
                {
                    level = t.level == "Required" ? "Error" : "Warning",
                    area = "meta: " + t.group,
                    message = t.message,
                };
        }

        static void FixWithMeta(BuildTargetGroup group, Action then)
        {
            var task = OVRProjectSetup.FixAllAsync(group);
            double started = EditorApplication.timeSinceStartup;
            void Poll()
            {
                bool timedOut = EditorApplication.timeSinceStartup - started > 300;
                if (!task.IsCompleted && !timedOut) return;
                EditorApplication.update -= Poll;
                if (timedOut || task.IsFaulted)
                {
                    Debug.LogError(timedOut ? $"[CutOnce] Meta's fixes for {group} did not finish in 5 minutes"
                                            : $"[CutOnce] Meta's fixes for {group} failed: {task.Exception}");
                    SessionState.EraseInt(SetupStep);
                    EditorApplication.Exit(1);
                    return;
                }
                Debug.Log($"[CutOnce] Meta's fixes applied for {group}");
                Guard(then);
            }
            EditorApplication.update += Poll;
        }

        static void Guard(Action action)
        {
            try { action(); }
            catch (Exception e)
            {
                Debug.LogException(e);
                EditorApplication.Exit(1);
            }
        }

        static string Arg(string name)
        {
            var args = Environment.GetCommandLineArgs();
            int i = Array.IndexOf(args, name);
            return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
        }
    }
}
