using System;
using System.Collections.Generic;
using System.IO;
using CutOnce.Core;

namespace CutOnce.Net
{
    /// <summary>
    /// What survives a crash or a restart with no network: the last plan, the run, the events seen and the
    /// events not yet delivered. One folder, whole-file writes through a temporary file, so a kill mid-write
    /// leaves the previous version intact.
    /// </summary>
    public sealed class Journal
    {
        readonly string _dir;
        public Journal(string directory) { _dir = directory; Directory.CreateDirectory(_dir); }

        public sealed class Snapshot
        {
            public AssemblyDto assembly;
            public string plan_json;
            public List<BuildEventDto> events = new List<BuildEventDto>();     // numbered by the server
            public List<BuildEventDto> pending = new List<BuildEventDto>();    // still to deliver
        }

        string PathOf(string name) => Path.Combine(_dir, name);

        public void Save(Snapshot snapshot)
        {
            string target = PathOf("journal.json"), tmp = target + ".tmp";
            File.WriteAllText(tmp, CoreJson.Write(snapshot));
            if (File.Exists(target)) File.Delete(target);
            File.Move(tmp, target);
        }

        public Snapshot Load()
        {
            try { return File.Exists(PathOf("journal.json")) ? CoreJson.Parse<Snapshot>(File.ReadAllText(PathOf("journal.json"))) : null; }
            catch (Exception e) when (e is IOException || e is Newtonsoft.Json.JsonException) { return null; }   // a corrupt journal is the same as none
        }
    }
}
