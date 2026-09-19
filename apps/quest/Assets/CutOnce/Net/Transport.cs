using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace CutOnce.Net
{
    public sealed class HttpRequest
    {
        public string Method = "GET", Url, Body;                     // Body is JSON when set
        public Dictionary<string, string> Headers = new Dictionary<string, string>();
        public int TimeoutSeconds = 8;
    }

    public sealed class HttpResult
    {
        /// <summary>0 when no answer arrived at all (no network, DNS failure, timeout).</summary>
        public int Status;
        public string Body, Error;
        public bool Reached => Status > 0;
        public bool Ok => Status >= 200 && Status < 300;
    }

    /// <summary>The one seam between our networking logic and the platform. Unity's is UnityHttpTransport; tests use a fake.</summary>
    public interface IHttpTransport { Task<HttpResult> SendAsync(HttpRequest request); }

    /// <summary>One text WebSocket connection. ReceiveAsync returns null when the connection has closed.</summary>
    public interface ISocket : IDisposable
    {
        Task ConnectAsync(Uri uri, CancellationToken cancel);
        Task<string> ReceiveAsync(CancellationToken cancel);
    }

    public sealed class ServerConfig
    {
        public string server_url = "http://127.0.0.1:8080";
        public string api_token = "dev-token";
        public string device_id = "quest";

        public string BaseUrl => (server_url ?? "").TrimEnd('/');
        /// <summary>https → wss, http → ws. The stream takes the token in the query (a browser WebSocket cannot set headers).</summary>
        public Uri StreamUri => new Uri((BaseUrl.StartsWith("https") ? "wss" + BaseUrl.Substring(5) : "ws" + BaseUrl.Substring(4)) +
            $"/v1/stream?client=quest&id={Uri.EscapeDataString(device_id ?? "quest")}&token={Uri.EscapeDataString(api_token ?? "")}");
    }
}
