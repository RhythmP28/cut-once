using System;
using System.Collections.Concurrent;
using System.Threading;
using System.Threading.Tasks;
using CutOnce.Core;

namespace CutOnce.Net
{
    /// <summary>
    /// Keeps one connection to /v1/stream alive and hands messages to the main thread. The socket runs on the
    /// thread pool; nothing here touches Unity. Call Drain from Update.
    /// </summary>
    public sealed class StreamClient : IDisposable
    {
        public static readonly double[] BackoffSeconds = { 0.5, 1, 2, 4, 8 };

        readonly Func<ISocket> _newSocket;
        readonly ServerConfig _config;
        readonly Func<double, CancellationToken, Task> _delay;
        readonly ConcurrentQueue<WsMessageDto> _inbox = new ConcurrentQueue<WsMessageDto>();
        readonly CancellationTokenSource _stop = new CancellationTokenSource();
        int _connects;
        volatile bool _connected;

        public bool IsConnected => _connected;
        /// <summary>Goes up by one on every successful connect. A change means "catch up on events you may have missed".</summary>
        public int Connects => Volatile.Read(ref _connects);

        public StreamClient(Func<ISocket> newSocket, ServerConfig config, Func<double, CancellationToken, Task> delay = null)
        {
            _newSocket = newSocket; _config = config;
            _delay = delay ?? ((seconds, cancel) => Task.Delay(TimeSpan.FromSeconds(seconds), cancel));
        }

        public Task Run() => Task.Run(Loop);

        async Task Loop()
        {
            int failures = 0;
            while (!_stop.IsCancellationRequested)
            {
                try
                {
                    using (var socket = _newSocket())
                    {
                        await socket.ConnectAsync(_config.StreamUri, _stop.Token);
                        _connected = true; failures = 0; Interlocked.Increment(ref _connects);
                        for (string text; (text = await socket.ReceiveAsync(_stop.Token)) != null;)
                        {
                            WsMessageDto message = null;
                            try { message = CoreJson.Parse<WsMessageDto>(text); } catch (Newtonsoft.Json.JsonException) { /* one bad frame must not drop the stream */ }
                            if (message?.type != null) _inbox.Enqueue(message);
                        }
                    }
                }
                catch (OperationCanceledException) { break; }
                catch (Exception) { /* refused, reset, DNS: all mean "try again" */ }
                finally { _connected = false; }

                try { await _delay(BackoffSeconds[Math.Min(failures++, BackoffSeconds.Length - 1)], _stop.Token); }
                catch (OperationCanceledException) { break; }
            }
        }

        /// <summary>Main thread: handle everything that arrived since the last call.</summary>
        public void Drain(Action<WsMessageDto> handle) { while (_inbox.TryDequeue(out var m)) handle(m); }

        public void Dispose() { _stop.Cancel(); }
    }
}
