using System;
using System.IO;

namespace CutOnce.Core.Tests
{
    /// <summary>
    /// Tests read the repo's own fixtures (data/fixtures), the same files the TypeScript tests use, so there is one
    /// source of truth. Works from Unity (working directory apps/quest) and from `dotnet test` (a bin folder).
    /// </summary>
    static class RepoFiles
    {
        public static string Root
        {
            get
            {
                foreach (var start in new[] { Directory.GetCurrentDirectory(), AppDomain.CurrentDomain.BaseDirectory })
                    for (var dir = new DirectoryInfo(start); dir != null; dir = dir.Parent)
                        if (Directory.Exists(Path.Combine(dir.FullName, "data", "fixtures")) && File.Exists(Path.Combine(dir.FullName, "pnpm-workspace.yaml")))
                            return dir.FullName;
                throw new DirectoryNotFoundException("could not find the repo root (data/fixtures + pnpm-workspace.yaml) above the working directory");
            }
        }

        public static string Fixture(params string[] parts) => Path.Combine(Path.Combine(Root, "data", "fixtures"), Path.Combine(parts));
        public static string Read(string path) => File.ReadAllText(path);
        public static PlanDto Plan(string fileName) => CoreJson.Parse<PlanDto>(Read(Fixture(fileName)));
    }
}
