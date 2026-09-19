using System.Collections;
using UnityEngine;
using CutOnce.Copilot.Capture;
using CutOnce.Copilot.Net;
using CutOnce.Copilot.Projection;
using CutOnce.Copilot.Voice;

namespace CutOnce.Copilot
{
    /// <summary>
    /// The whole push-to-talk turn, exactly as section 10 describes it:
    ///
    ///   A pressed   → freeze the selected part, grab one frame, start the mic, show the listening ring
    ///   while held  → nothing else, max 12 s
    ///   A released  → stop the mic, project every part into the frozen frame, send one request
    ///   response    → highlight at once, show the text and the source card, stream the audio
    ///
    /// Two rules worth keeping in your head while editing this:
    ///   1. The frame and the selection are frozen on PRESS, not on release. The user moves while talking.
    ///   2. A `mark_state` action has ALREADY been written by the server. Show an Undo toast; do not
    ///      append an event, or the same command lands twice.
    ///
    /// Put this on the [Copilot] prefab. Nothing else in the app should reference the copilot's internals.
    /// </summary>
    public class CopilotController : MonoBehaviour
    {
        [Header("Server")]
        public string baseUrl = "http://127.0.0.1:8080";
        public string apiToken = "dev-token";

        [Header("Wiring")]
        public MonoBehaviour frameSourceBehaviour;   // any ICameraFrameSource: PcaFrameSource on device, FixtureFrameSource in the Editor
        public MonoBehaviour hostBehaviour;          // A2's ICopilotHost implementation
        public MicRecorder mic;
        public PcmStreamPlayer speaker;

        [Header("Input")]
        public OVRInput.RawButton pushToTalk = OVRInput.RawButton.A;

        public bool IsListening { get; private set; }
        public bool IsThinking { get; private set; }
        /// <summary>The last turn's time to first audio. Watch this during rehearsal: the target is under 5 s.</summary>
        public float LastFirstAudioMs { get; private set; } = -1f;

        private ICameraFrameSource _frames;
        private ICopilotHost _host;
        private CopilotClient _client;
        private CameraFrame _frozenFrame;
        private string _frozenPartId;
        private string _frozenStepId;

        private void Awake()
        {
            _frames = frameSourceBehaviour as ICameraFrameSource;
            _host = hostBehaviour as ICopilotHost;
            _client = new CopilotClient(baseUrl, apiToken);
            if (_frames == null) Debug.LogError("[Copilot] frameSourceBehaviour does not implement ICameraFrameSource.");
            if (_host == null) Debug.LogError("[Copilot] hostBehaviour does not implement ICopilotHost.");
        }

        private void Update()
        {
            if (_host == null) return;
            if (OVRInput.GetDown(pushToTalk)) BeginListening();
            else if (IsListening && (OVRInput.GetUp(pushToTalk) || mic.ElapsedSeconds >= MicRecorder.MaxSeconds - 0.2f)) EndListening();
        }

        /// <summary>Also the entry point for a HUD query button: pass the rehearsed question's id.</summary>
        public void AskScripted(string scriptedQueryId) => StartCoroutine(Send(null, scriptedQueryId));

        private void BeginListening()
        {
            if (IsListening || IsThinking) return;
            // Frozen on press: the answer must be about what they were looking at when they asked.
            _frozenFrame = _frames != null && _frames.IsReady ? _frames.Capture() : default;
            _frozenPartId = _host.SelectedPartId;
            _frozenStepId = _host.CurrentStepId;
            if (!mic.Begin()) return;
            IsListening = true;
        }

        private void EndListening()
        {
            IsListening = false;
            byte[] wav = mic.End();
            if (wav == null || wav.Length < 1000)
            {
                Debug.Log("[Copilot] nothing recorded; ignoring.");
                return;
            }
            StartCoroutine(Send(wav, null));
        }

        private IEnumerator Send(byte[] wav, string scriptedQueryId)
        {
            IsThinking = true;
            LastFirstAudioMs = -1f;

            CameraFrame frame = _frozenFrame.IsValid ? _frozenFrame
                : _frames != null && _frames.IsReady ? _frames.Capture() : default;
            if (!frame.IsValid)
            {
                // No pixels is survivable: geometry and the documents still answer most questions.
                Debug.LogWarning("[Copilot] no camera frame; asking without one.");
            }

            var visible = frame.IsValid
                ? PartProjector.Project(_host.PartsForProjection(), frame)
                : new System.Collections.Generic.List<ProjectedPart>();

            string context = CopilotClient.BuildContextJson(_host, visible, frame.Intrinsics, scriptedQueryId);

            yield return _client.Query(
                _host.AssemblyId, context, wav ?? MicRecorder.EncodeWav(new float[160], MicRecorder.SampleRate, 1),
                frame.IsValid ? frame.Jpeg : new byte[0],
                OnAnswer,
                error => { Debug.LogWarning("[Copilot] " + error); IsThinking = false; });
        }

        private void OnAnswer(CopilotResponseDto response)
        {
            IsThinking = false;

            // Highlight first: it lands in the same frame the text appears, before any audio.
            if (response.highlight_parts != null && response.highlight_parts.Length > 0)
                _host.Highlight(response.highlight_parts, response.highlight_style);
            _host.ShowAnswer(response);

            if (response.HasAction)
            {
                if (response.action.type == "step_nav") _host.StepNav(response.action.direction);
                else _host.OnActionApplied(response.action);   // already written by the server: offer Undo, do not re-append
            }

            if (!string.IsNullOrEmpty(response.audio_url) && speaker != null)
            {
                speaker.Play(baseUrl, response.audio_url, apiToken);
                StartCoroutine(TrackFirstAudio());
            }
        }

        private IEnumerator TrackFirstAudio()
        {
            float started = Time.realtimeSinceStartup;
            while (speaker.FirstAudioMs < 0f && Time.realtimeSinceStartup - started < 10f) yield return null;
            LastFirstAudioMs = speaker.FirstAudioMs;
            if (LastFirstAudioMs > 5000f) Debug.LogWarning($"[Copilot] first audio took {LastFirstAudioMs:0} ms — over the G6 target.");
        }
    }
}
