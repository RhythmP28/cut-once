using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Meta.XR.MRUtilityKit;
using UnityEngine;
#if UNITY_ANDROID && !UNITY_EDITOR
using UnityEngine.Android;
#endif

namespace CutOnce.Room
{
    /// <summary>Quest scene capture, spatial permission and MRUK queries. No invented headset geometry.</summary>
    public sealed class QuestRoomSource : IRoomSource
    {
        readonly MRUK _mruk;
        readonly bool _ownsMruk;
        readonly Transform _parent;
        MRUKRoom _room;
        bool _disposed;
        public RoomGeometry Geometry { get; private set; }
        public Transform Frame { get; private set; }
        public string Status { get; private set; } = "Room not loaded. Press Y to scan.";
        public bool IsFixture => false;

        public QuestRoomSource(Transform parent)
        {
            _parent = parent;
            _mruk = MRUK.Instance;
            if (_mruk == null)
            {
                var go = new GameObject("[Room MRUK]");
                go.SetActive(false);
                go.transform.SetParent(parent, false);
                _mruk = go.AddComponent<MRUK>();
                _mruk.SceneSettings = new MRUK.MRUKSettings { LoadSceneOnStartup = false };
                _ownsMruk = true;
                go.SetActive(true);
            }
            _mruk.EnableWorldLock = true;
        }

        static Task<bool> RequestPermission()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            if (Permission.HasUserAuthorizedPermission(OVRPermissionsRequester.ScenePermission)) return Task.FromResult(true);
            var completion = new TaskCompletionSource<bool>();
            var callbacks = new PermissionCallbacks();
            callbacks.PermissionGranted += _ => completion.TrySetResult(true);
            callbacks.PermissionDenied += _ => completion.TrySetResult(false);
            callbacks.PermissionRequestDismissed += _ => completion.TrySetResult(false);
            Permission.RequestUserPermission(OVRPermissionsRequester.ScenePermission, callbacks);
            return completion.Task;
#else
            return Task.FromResult(true);
#endif
        }

        public async Task<bool> Load(bool rescan)
        {
            Geometry = null;
            Status = "Allow Spatial data to load the room.";
            if (!await RequestPermission())
            {
                Status = "Spatial data denied. Enable it in Quest Settings → App permissions, then press Y.";
                return false;
            }
            if (_disposed) return false;
            if (rescan)
            {
                Status = "Space Setup: look around all walls, floor and ceiling, then finish the scan.";
                if (!await OVRScene.RequestSpaceSetup())
                {
                    Status = "Scan cancelled or unavailable. Press Y to retry; scan on standalone Quest, not Link.";
                    return false;
                }
            }
            if (_disposed) return false;
            Status = "Loading scanned walls and room mesh…";
            var result = await _mruk.LoadSceneFromDevice(requestSceneCaptureIfNoDataFound: true, sceneModel: MRUK.SceneModel.V2FallbackV1);
            if (_disposed) return false;
            if (result != MRUK.LoadDeviceResult.Success)
            {
                Status = "Room load: " + result + ". Press Y to retry Space Setup.";
                return false;
            }
            _room = _mruk.GetCurrentRoom();
            if (_room == null || _room.FloorAnchor == null || _room.CeilingAnchor == null || _room.WallAnchors.Count < 3)
            {
                Status = "Incomplete room: scan floor, ceiling and all walls with Y.";
                return false;
            }
            var floor = _room.FloorAnchor;
            var outline = _room.GetRoomOutline();
            if (outline == null || outline.Count < 3)
            {
                Status = "No closed floor boundary. Press Y and complete the room scan.";
                return false;
            }
            if (Frame == null)
            {
                Frame = new GameObject("Scanned room frame").transform;
                Frame.SetParent(_parent, false);
            }
            // MRUK world locking corrects the rig; this frame remains in the scene's stable world coordinates.
            Vector3 right = floor.transform.right; right.y = 0;
            if (right.sqrMagnitude < .01f) right = Vector3.right;
            Frame.SetPositionAndRotation(floor.transform.position, Quaternion.LookRotation(Vector3.Cross(right.normalized, Vector3.up), Vector3.up));
            var localFloor = new Vector3[outline.Count];
            for (int i = 0; i < outline.Count; i++)
            {
                localFloor[i] = Frame.InverseTransformPoint(outline[i]);
                localFloor[i].y = 0;
            }
            var surfaces = new List<RoomSurface>();
            foreach (var anchor in _room.Anchors)
            {
                if (!anchor.HasAnyLabel(MRUKAnchor.SceneLabels.WALL_FACE | MRUKAnchor.SceneLabels.FLOOR | MRUKAnchor.SceneLabels.CEILING)) continue;
                var boundary = anchor.PlaneBoundary2D;
                if (boundary == null || boundary.Count < 3) continue;
                var points = new Vector3[boundary.Count];
                for (int i = 0; i < points.Length; i++) points[i] = Frame.InverseTransformPoint(anchor.transform.TransformPoint(new Vector3(boundary[i].x, boundary[i].y, 0)));
                surfaces.Add(new RoomSurface { label = anchor.Label.ToString(), outline = points });
            }
            float height = _room.CeilingAnchor.transform.position.y - floor.transform.position.y;
            if (height <= .1f)
            {
                Status = "Invalid room height. Press Y to rescan.";
                return false;
            }
            Geometry = new RoomGeometry { id = _room.Anchor.Uuid.ToString() + "_" + floor.Anchor.Uuid, floor = localFloor, height = height, surfaces = surfaces.ToArray() };
            Status = _room.GlobalMeshAnchor != null ? "Scanned room ready • walls + scene mesh" : "Scanned room ready • semantic surfaces (no scene mesh)";
            return true;
        }

        public bool Raycast(Ray ray, out Vector3 point, out string label)
        {
            point = default; label = "";
            if (Geometry == null || _room == null || !_room.Raycast(ray, 20, out var hit, out var anchor)) return false;
            point = hit.point; label = anchor != null ? anchor.Label.ToString() : "Room mesh";
            return true;
        }
        public bool IsOccupied(Vector3 worldPoint) => _room != null && _room.IsPositionInSceneVolume(worldPoint, true, .01f);
        public void Dispose()
        {
            _disposed = true;
            if (Frame != null) UnityEngine.Object.Destroy(Frame.gameObject);
            if (_ownsMruk && _mruk != null) UnityEngine.Object.Destroy(_mruk.gameObject);
        }
    }
}
