using UnityEditor;
using UnityEngine;

/// <summary>Compile-check SheikahGlow with URP present — the pipeline the Quest app actually ships.</summary>
public static class ShaderCheck
{
    public static void Run()
    {
        var shader = Shader.Find("CutOnce/SheikahGlow");
        System.Console.WriteLine("===== SHADER CHECK =====");
        if (shader == null) { System.Console.WriteLine("shader NOT FOUND"); EditorApplication.Exit(1); return; }
        System.Console.WriteLine("found: " + shader.name + " | isSupported: " + shader.isSupported);
        var count = ShaderUtil.GetShaderMessageCount(shader);
        System.Console.WriteLine("messages: " + count);
        var bad = 0;
        foreach (var m in ShaderUtil.GetShaderMessages(shader))
        {
            System.Console.WriteLine($"  [{m.severity}] {m.message} {m.messageDetails} (platform {m.platform})");
            if (m.severity == UnityEditor.Rendering.ShaderCompilerMessageSeverity.Error) bad++;
        }
        System.Console.WriteLine($"errors: {bad}");
        System.Console.WriteLine("===== END SHADER CHECK =====");
        EditorApplication.Exit(bad == 0 && shader.isSupported ? 0 : 1);
    }
}
