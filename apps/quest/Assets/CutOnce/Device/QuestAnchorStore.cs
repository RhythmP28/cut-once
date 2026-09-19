using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using CutOnce.AR;
using UnityEngine;

namespace CutOnce.Device
{
    /// <summary>
    /// One OVRSpatialAnchor pins the build to the room. Its id is kept in PlayerPrefs, so the next launch finds the
    /// build where it was left. Anchors only exist on the headset: in the Editor every call answers "no anchor" and
    /// the hologram simply stays where it was placed.
    /// </summary>
    public sealed class QuestAnchorStore : MonoBehaviour, IAnchorStore
    {
        const string UuidKey = "cutonce.alignment.anchor";
        const double LocalizeTimeoutSeconds = 6;
        OVRSpatialAnchor _current;

        public async Task<Transform> Restore()
        {
            if (!PlayerPrefs.HasKey(UuidKey) || !Guid.TryParse(PlayerPrefs.GetString(UuidKey), out var uuid)) return null;
            var found = new List<OVRSpatialAnchor.UnboundAnchor>();
            var loaded = await OVRSpatialAnchor.LoadUnboundAnchorsAsync(new[] { uuid }, found);
            if (!loaded.Success || found.Count == 0) return null;           // another room, or the anchor was erased
            if (!found[0].Localized && !await found[0].LocalizeAsync(LocalizeTimeoutSeconds)) return null;

            var go = new GameObject("[Anchor] build (restored)");
            if (found[0].TryGetPose(out var pose)) go.transform.SetPositionAndRotation(pose.position, pose.rotation);
            _current = go.AddComponent<OVRSpatialAnchor>();
            found[0].BindTo(_current);
            return go.transform;
        }

        public async Task<Transform> CreateAt(Pose worldPose)
        {
            var go = new GameObject("[Anchor] build");
            go.transform.SetPositionAndRotation(worldPose.position, worldPose.rotation);
            var anchor = go.AddComponent<OVRSpatialAnchor>();
            if (!await anchor.WhenCreatedAsync()) { Destroy(go); return null; }

            var saved = await anchor.SaveAnchorAsync();
            if (saved.Success) { PlayerPrefs.SetString(UuidKey, anchor.Uuid.ToString()); PlayerPrefs.Save(); }
            else Debug.LogWarning("[CutOnce] The anchor holds for this session but could not be saved: " + saved.Status);
            _current = anchor;
            return go.transform;
        }

        public async Task Forget()
        {
            PlayerPrefs.DeleteKey(UuidKey);
            if (_current == null) return;
            var old = _current; _current = null;
            old.transform.DetachChildren();                                   // AssemblyRoot must outlive its old anchor
            await old.EraseAnchorAsync();
            if (old != null) Destroy(old.gameObject);
        }
    }
}
