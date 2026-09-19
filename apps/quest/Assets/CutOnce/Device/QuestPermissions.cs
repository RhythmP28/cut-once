using System;
#if UNITY_ANDROID && !UNITY_EDITOR
using UnityEngine.Android;
#endif

namespace CutOnce.Device
{
    /// <summary>
    /// Runtime permissions (AGENTS rule 3). On the headset: ask for the ones not yet granted, in one request, and report
    /// each answer (dismissing the dialog counts as "not now"). The Editor never asks, so there everything is granted.
    /// Meta's PassthroughCameraAccess waits for the camera grant by itself; the microphone works once granted.
    /// Answers can arrive off Unity's main thread: callers must not touch Unity objects in the callback.
    /// </summary>
    public static class QuestPermissions
    {
        public const string Camera = "horizonos.permission.HEADSET_CAMERA";
        public const string Microphone = "android.permission.RECORD_AUDIO";

        public static void Request(string[] permissions, Action<string, bool> answered)
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            var missing = Array.FindAll(permissions, p => !Permission.HasUserAuthorizedPermission(p));
            foreach (var p in permissions) if (Array.IndexOf(missing, p) < 0) answered(p, true);
            if (missing.Length == 0) return;
            var callbacks = new PermissionCallbacks();
            callbacks.PermissionGranted += p => answered(p, true);
            callbacks.PermissionDenied += p => answered(p, false);
            callbacks.PermissionRequestDismissed += p => answered(p, false);
            Permission.RequestUserPermissions(missing, callbacks);
#else
            foreach (var p in permissions) answered(p, true);
#endif
        }
    }
}
