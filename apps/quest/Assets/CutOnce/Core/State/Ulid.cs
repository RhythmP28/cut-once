using System;
using System.Security.Cryptography;

namespace CutOnce.Core
{
    /// <summary>
    /// 26-character ULIDs (48-bit millisecond time + 80 random bits, Crockford base 32, upper case).
    /// The server only accepts event ids of the form evt_ + one of these (packages/schemas/src/ids.ts).
    /// </summary>
    public static class Ulid
    {
        const string Alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
        static readonly RandomNumberGenerator Rng = RandomNumberGenerator.Create();

        public static string New() => New(DateTime.UtcNow);

        public static string New(DateTime utc)
        {
            long ms = (long)(utc.ToUniversalTime() - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
            var chars = new char[26];
            for (int i = 9; i >= 0; i--) { chars[i] = Alphabet[(int)(ms & 31)]; ms >>= 5; }
            var random = new byte[16];
            lock (Rng) Rng.GetBytes(random);
            for (int i = 0; i < 16; i++) chars[10 + i] = Alphabet[random[i] & 31];
            return new string(chars);
        }
    }
}
