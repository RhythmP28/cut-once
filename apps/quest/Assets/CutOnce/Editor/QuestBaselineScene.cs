using System.IO;
using System.Linq;
using CutOnce.Diagnostics;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

namespace CutOnce.QuestTools
{
    /// <summary>
    /// A known-good mixed reality scene: the Meta camera rig with passthrough, a budget probe, and one box per
    /// hologram state in the shared palette (data/fixtures/hologram-palette.json), at true scale on a table-height
    /// row 80 cm in front of you. Open it in Meta XR Simulator or on the Quest to see what each state looks like
    /// over a real room before A2's renderer lands. Rebuilt from code, so it is never edited by hand.
    /// </summary>
    public static class QuestBaselineScene
    {
        public const string ScenePath = "Assets/CutOnce/Scenes/QuestBaseline.unity";
        const string MaterialFolder = "Assets/CutOnce/Scenes/QuestBaseline";
        const string CameraRigPrefab = "Packages/com.meta.xr.sdk.core/Prefabs/OVRCameraRig.prefab";
        const float Distance = 0.8f, TableHeight = 0.75f, BoxSize = 0.15f, Spacing = 0.22f;
        // Quest 3 shows about 21 pixels per degree, so at 80 cm one pixel is about 0.66 mm.
        const float MetresPerPixelAtDistance = 0.00066f;

        static readonly string[] States = { "BUILT_LIVE", "BUILT_REPLAY", "CURRENT_STEP", "MISSING", "FUTURE", "WRONG" };

        [MenuItem("Cut Once/Rebuild baseline scene", priority = 20)]
        static void RebuildFromMenu()
        {
            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            Create();
        }

        public static void EnsureExists()
        {
            if (!File.Exists(ScenePath)) Create();
            else AddToBuild();
        }

        public static string PalettePath => Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..", "..", "data", "fixtures", "hologram-palette.json"));

        public static void Create()
        {
            var palette = JObject.Parse(File.ReadAllText(PalettePath))["bases"];
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var rig = (GameObject)PrefabUtility.InstantiatePrefab(AssetDatabase.LoadAssetAtPath<GameObject>(CameraRigPrefab));
            rig.name = "[Rig]";
            if (!rig.TryGetComponent(out OVRManager manager)) manager = rig.AddComponent<OVRManager>();
            manager.isInsightPassthroughEnabled = true;
            manager.trackingOriginType = OVRManager.TrackingOrigin.FloorLevel;
            // One passthrough layer, drawn beneath the eye buffer (the only kind Meta keeps supporting).
            if (!rig.TryGetComponent(out OVRPassthroughLayer _)) rig.AddComponent<OVRPassthroughLayer>();
            foreach (var eye in rig.GetComponentsInChildren<Camera>(true))
            {
                // Passthrough shows through wherever the eye buffer is left transparent.
                eye.clearFlags = CameraClearFlags.SolidColor;
                eye.backgroundColor = Color.clear;
            }

            new GameObject("[Budget]").AddComponent<BudgetProbe>();

            QuestSetup.EnsureFolder(MaterialFolder);
            var row = new GameObject("[Palette]").transform;
            row.position = new Vector3(0, TableHeight + BoxSize / 2, Distance);
            for (int i = 0; i < States.Length; i++)
            {
                var style = palette[States[i]];
                var swatch = MakeSwatch(States[i], style);
                swatch.SetParent(row, false);
                swatch.localPosition = new Vector3((i - (States.Length - 1) / 2f) * Spacing, 0, 0);
            }

            EditorSceneManager.SaveScene(scene, ScenePath);
            AddToBuild();
        }

        static Transform MakeSwatch(string state, JToken style)
        {
            var root = new GameObject(state).transform;

            var fill = GameObject.CreatePrimitive(PrimitiveType.Cube);
            Object.DestroyImmediate(fill.GetComponent<Collider>());
            fill.name = "Fill";
            fill.transform.SetParent(root, false);
            fill.transform.localScale = Vector3.one * BoxSize;
            float fillAlpha = style.Value<float>("fillAlpha");
            var fillRenderer = fill.GetComponent<MeshRenderer>();
            fillRenderer.sharedMaterial = SaveMaterial($"{state}_fill", Hex(style.Value<string>("fill"), fillAlpha));
            fillRenderer.enabled = fillAlpha > 0;
            fillRenderer.shadowCastingMode = ShadowCastingMode.Off;

            var edgeMaterial = SaveMaterial($"{state}_edge", Hex(style.Value<string>("edge"), style.Value<float>("edgeAlpha")));
            float width = style.Value<float>("edgeWidthPx") * MetresPerPixelAtDistance;
            float h = BoxSize / 2;
            var bottom = new[] { new Vector3(-h, -h, -h), new Vector3(h, -h, -h), new Vector3(h, -h, h), new Vector3(-h, -h, h) };
            var top = bottom.Select(p => new Vector3(p.x, h, p.z)).ToArray();
            AddLine(root, "Edges bottom", bottom, true, width, edgeMaterial);
            AddLine(root, "Edges top", top, true, width, edgeMaterial);
            for (int i = 0; i < 4; i++) AddLine(root, $"Edge {i}", new[] { bottom[i], top[i] }, false, width, edgeMaterial);

            var label = new GameObject("Label").AddComponent<TextMesh>();
            label.transform.SetParent(root, false);
            label.transform.localPosition = new Vector3(0, h + 0.04f, 0);
            label.transform.localRotation = Quaternion.identity;
            label.text = state.Replace('_', ' ').ToLowerInvariant();
            label.anchor = TextAnchor.LowerCenter;
            label.alignment = TextAlignment.Center;
            label.fontSize = 64;
            label.characterSize = 0.004f;
            label.color = Color.white;
            var font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            label.font = font;
            label.GetComponent<MeshRenderer>().sharedMaterial = font.material;
            return root;
        }

        static void AddLine(Transform parent, string name, Vector3[] points, bool loop, float width, Material material)
        {
            var line = new GameObject(name).AddComponent<LineRenderer>();
            line.transform.SetParent(parent, false);
            line.useWorldSpace = false;
            line.loop = loop;
            line.positionCount = points.Length;
            line.SetPositions(points);
            line.widthMultiplier = width;
            line.sharedMaterial = material;
            line.shadowCastingMode = ShadowCastingMode.Off;
            line.receiveShadows = false;
        }

        /// <summary>
        /// URP Unlit, see-through. The alpha channel blends as One / OneMinusSrcAlpha, so a 0.18 fill leaves 0.18 in
        /// the eye buffer. With SrcAlpha on the alpha channel too, it would leave 0.18² ≈ 0.03 and the fill would all
        /// but vanish over passthrough, while looking fine in the Editor's Game view.
        /// </summary>
        static Material SaveMaterial(string name, Color color)
        {
            string path = $"{MaterialFolder}/{name}.mat";
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m == null)
            {
                m = new Material(Shader.Find("Universal Render Pipeline/Unlit"));
                AssetDatabase.CreateAsset(m, path);
            }
            m.SetFloat("_Surface", 1);
            m.SetFloat("_Blend", 0);
            m.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
            m.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha);
            m.SetFloat("_SrcBlendAlpha", (float)BlendMode.One);
            m.SetFloat("_DstBlendAlpha", (float)BlendMode.OneMinusSrcAlpha);
            m.SetFloat("_ZWrite", 0);
            m.SetOverrideTag("RenderType", "Transparent");
            m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            m.renderQueue = (int)RenderQueue.Transparent;
            m.SetColor("_BaseColor", color);
            EditorUtility.SetDirty(m);
            return m;
        }

        static Color Hex(string hex, float alpha)
        {
            ColorUtility.TryParseHtmlString(hex, out var c);
            c.a = alpha;
            return c;
        }

        static void AddToBuild()
        {
            var scenes = EditorBuildSettings.scenes.ToList();
            if (scenes.Any(s => s.path == ScenePath)) return;
            // First in the list until the real Main scene exists, so a fresh build shows something known to work.
            scenes.Insert(0, new EditorBuildSettingsScene(ScenePath, true));
            EditorBuildSettings.scenes = scenes.ToArray();
        }
    }
}
