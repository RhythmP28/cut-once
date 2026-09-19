using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Networking;

namespace CutOnce.Copilot.Voice
{
    /// <summary>
    /// Plays the answer while the server is still generating it. The audio endpoint returns headerless
    /// 16-bit PCM over a chunked response, so this feeds a streaming AudioClip from a ring of samples as
    /// bytes arrive — that is what gets first audio out inside the 4 s target instead of waiting for the
    /// whole clip.
    /// </summary>
    [RequireComponent(typeof(AudioSource))]
    public class PcmStreamPlayer : MonoBehaviour
    {
        public int sampleRate = 22050;

        private readonly Queue<float> _pending = new Queue<float>();
        private readonly object _lock = new object();
        private AudioSource _source;
        private bool _finished;

        public bool IsPlaying => _source != null && _source.isPlaying;
        /// <summary>Milliseconds from the request going out to the first sample being queued. This is the G6 number.</summary>
        public float FirstAudioMs { get; private set; } = -1f;

        private void Awake() => _source = GetComponent<AudioSource>();

        public void Play(string baseUrl, string audioPath, string bearerToken)
        {
            Stop();
            StartCoroutine(Stream($"{baseUrl.TrimEnd('/')}{audioPath}", bearerToken));
        }

        public void Stop()
        {
            StopAllCoroutines();
            if (_source != null) _source.Stop();
            lock (_lock) _pending.Clear();
            _finished = false;
            FirstAudioMs = -1f;
        }

        private IEnumerator Stream(string url, string bearerToken)
        {
            float startedAt = Time.realtimeSinceStartup;
            using var request = UnityWebRequest.Get(url);
            var handler = new PcmDownloadHandler(this);
            request.downloadHandler = handler;
            if (!string.IsNullOrEmpty(bearerToken)) request.SetRequestHeader("Authorization", "Bearer " + bearerToken);

            var operation = request.SendWebRequest();

            // Start the clip as soon as anything has arrived, not when the whole response has.
            while (!operation.isDone && FirstAudioMs < 0f) yield return null;
            if (FirstAudioMs < 0f && request.result != UnityWebRequest.Result.Success)
            {
                Debug.LogWarning($"[Copilot] no answer audio: {request.error}. Showing the text only.");
                yield break;
            }
            FirstAudioMs = (Time.realtimeSinceStartup - startedAt) * 1000f;

            _source.clip = AudioClip.Create("copilot_answer", sampleRate * 60, 1, sampleRate, true, OnRead);
            _source.loop = false;
            _source.Play();

            yield return operation;
            _finished = true;
        }

        /// <summary>Called on the audio thread. Silence while the network is behind, so playback never crackles out.</summary>
        private void OnRead(float[] data)
        {
            lock (_lock)
            {
                for (int i = 0; i < data.Length; i++) data[i] = _pending.Count > 0 ? _pending.Dequeue() : 0f;
                if (_finished && _pending.Count == 0 && _source != null && _source.isPlaying) _source.Stop();
            }
        }

        internal void Enqueue(byte[] bytes, int count)
        {
            if (count < 2) return;
            lock (_lock)
            {
                for (int i = 0; i + 1 < count; i += 2)
                {
                    short sample = (short)(bytes[i] | (bytes[i + 1] << 8));
                    _pending.Enqueue(sample / 32768f);
                }
            }
            if (FirstAudioMs < 0f) FirstAudioMs = 0f; // set properly by the coroutine; this just unblocks it
        }

        /// <summary>Hands every chunk straight to the player instead of buffering the whole response.</summary>
        private class PcmDownloadHandler : DownloadHandlerScript
        {
            private readonly PcmStreamPlayer _player;
            public PcmDownloadHandler(PcmStreamPlayer player) : base(new byte[16384]) => _player = player;

            protected override bool ReceiveData(byte[] data, int dataLength)
            {
                if (data == null || dataLength == 0) return false;
                _player.Enqueue(data, dataLength);
                return true;
            }
        }
    }
}
