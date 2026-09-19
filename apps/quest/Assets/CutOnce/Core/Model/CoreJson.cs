using Newtonsoft.Json;

namespace CutOnce.Core
{
    /// <summary>One JSON configuration for everything that crosses the wire or the disk.</summary>
    public static class CoreJson
    {
        public static readonly JsonSerializerSettings Settings = new JsonSerializerSettings
        {
            NullValueHandling = NullValueHandling.Ignore,          // optional server fields must be absent, not null
            MissingMemberHandling = MissingMemberHandling.Ignore,  // a teammate's new server field must not break the headset
            DateParseHandling = DateParseHandling.None,            // timestamps stay the exact strings the server sent
            FloatParseHandling = FloatParseHandling.Double,
        };

        public static T Parse<T>(string json) => JsonConvert.DeserializeObject<T>(json, Settings);
        public static string Write(object value) => JsonConvert.SerializeObject(value, Settings);
    }
}
