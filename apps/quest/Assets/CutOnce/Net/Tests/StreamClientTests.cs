using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CutOnce.Core;
using NUnit.Framework;

namespace CutOnce.Net.Tests
{
    public class StreamClientTests
    {
        sealed class ScriptedSocket : ISocket
        {
            readonly Queue<string> _frames; readonly bool _refuse;
            public ScriptedSocket(bool refuse, params string[] frames) { _refuse = refuse; _frames = new Queue<string>(frames); }
            public Task ConnectAsync(Uri uri, CancellationToken cancel) => _refuse ? Task.FromException(new Exception("refused")) : Task.CompletedTask;
            public Task<string> ReceiveAsync(CancellationToken cancel) => Task.FromResult(_frames.Count > 0 ? _frames.Dequeue() : null);
            public void Dispose() { }
        }

        [Test]
        public async Task ItSurvivesARefusalABadFrameAndADropAndBacksOff()
        {
            var sockets = new Queue<ISocket>(new ISocket[]
            {
                new ScriptedSocket(true),
                new ScriptedSocket(false, "{ not json", "{\"type\":\"plan_ready\",\"plan_id\":\"plan_x\",\"revision\":2}"),
                new ScriptedSocket(false, "{\"type\":\"presence\",\"clients\":[]}"),
            });
            var delays = new List<double>();
            var done = new TaskCompletionSource<bool>();
            StreamClient client = null;
            client = new StreamClient(
                () => { if (sockets.Count == 0) { client.Dispose(); done.TrySetResult(true); return new ScriptedSocket(true); } return sockets.Dequeue(); },
                new ServerConfig(), (seconds, cancel) => { delays.Add(seconds); return Task.CompletedTask; });

            _ = client.Run();
            await Task.WhenAny(done.Task, Task.Delay(5000));
            await Task.Delay(50);

            var seen = new List<WsMessageDto>();
            client.Drain(seen.Add);
            Assert.That(seen.ConvertAll(m => m.type), Is.EqualTo(new[] { "plan_ready", "presence" }));
            Assert.That(seen[0].revision, Is.EqualTo(2));
            Assert.That(client.Connects, Is.EqualTo(2));
            Assert.That(delays[0], Is.EqualTo(StreamClient.BackoffSeconds[0]), "first failure: shortest wait");
            Assert.That(delays[1], Is.EqualTo(StreamClient.BackoffSeconds[0]), "a connection that delivered a message resets the back-off");
        }

        [Test]
        public async Task AConnectionThatIsClosedAtOnceBacksOffInsteadOfHammering()
        {
            int opened = 0; var delays = new List<double>(); var done = new TaskCompletionSource<bool>();
            StreamClient client = null;
            client = new StreamClient(
                () => { if (++opened > 4) { client.Dispose(); done.TrySetResult(true); } return new ScriptedSocket(false); },   // connects, delivers nothing, closes: a wrong token
                new ServerConfig(), (seconds, cancel) => { delays.Add(seconds); return Task.CompletedTask; });

            _ = client.Run();
            await Task.WhenAny(done.Task, Task.Delay(5000));
            await Task.Delay(50);

            Assert.That(client.Connects, Is.EqualTo(0), "nothing was delivered, so there is nothing to catch up on");
            Assert.That(delays.Take(4), Is.EqualTo(StreamClient.BackoffSeconds.Take(4)));
        }
    }
}
