using System;
using System.IO;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace CutOnce.Net
{
    /// <summary>ISocket over System.Net.WebSockets, which Unity ships for Android (IL2CPP) as well as the Editor.</summary>
    public sealed class NetSocket : ISocket
    {
        readonly ClientWebSocket _ws = new ClientWebSocket();
        readonly byte[] _buffer = new byte[16 * 1024];

        public Task ConnectAsync(Uri uri, CancellationToken cancel) => _ws.ConnectAsync(uri, cancel);

        public async Task<string> ReceiveAsync(CancellationToken cancel)
        {
            using (var text = new MemoryStream())
            {
                while (true)
                {
                    var r = await _ws.ReceiveAsync(new ArraySegment<byte>(_buffer), cancel);
                    if (r.MessageType == WebSocketMessageType.Close) return null;
                    text.Write(_buffer, 0, r.Count);
                    if (r.EndOfMessage) return Encoding.UTF8.GetString(text.GetBuffer(), 0, (int)text.Length);
                }
            }
        }

        public void Dispose() => _ws.Dispose();
    }
}
