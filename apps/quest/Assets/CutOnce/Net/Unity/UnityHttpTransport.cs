using System.Text;
using System.Threading.Tasks;
using UnityEngine.Networking;

namespace CutOnce.Net
{
    /// <summary>
    /// IHttpTransport over UnityWebRequest, the HTTP stack that works on the Quest (Android) with HTTPS. It never
    /// throws: a failure comes back as Status 0 plus the error text, and ApiClient turns that into "unreachable".
    /// Awaiting from the main thread continues on the main thread (Unity's synchronisation context).
    /// </summary>
    public sealed class UnityHttpTransport : IHttpTransport
    {
        public Task<HttpResult> SendAsync(HttpRequest request)
        {
            var done = new TaskCompletionSource<HttpResult>();
            var web = new UnityWebRequest(request.Url, request.Method) { downloadHandler = new DownloadHandlerBuffer(), timeout = request.TimeoutSeconds };
            if (request.Body != null) web.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(request.Body));
            foreach (var header in request.Headers) web.SetRequestHeader(header.Key, header.Value);

            web.SendWebRequest().completed += _ =>
            {
                bool answered = web.result == UnityWebRequest.Result.Success || web.result == UnityWebRequest.Result.ProtocolError;
                done.TrySetResult(new HttpResult { Status = answered ? (int)web.responseCode : 0, Body = web.downloadHandler?.text, Error = answered ? null : web.error });
                web.Dispose();
            };
            return done.Task;
        }
    }
}
