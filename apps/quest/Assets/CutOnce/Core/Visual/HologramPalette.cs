using System;
using System.Collections.Generic;

namespace CutOnce.Core
{
    /// <summary>One look, as the shader needs it. Field names match data/fixtures/hologram-palette.json.</summary>
    public sealed class VisualStyle
    {
        public string fill = "#FFFFFF", edge = "#FFFFFF";
        public double fillAlpha, edgeAlpha, edgeWidthPx, pulseHz;
        public bool brackets, grid;
        /// <summary>Not in the palette: set from the part's accuracy tags, so estimated parts draw dashed.</summary>
        public bool dashed;

        public VisualStyle Clone() => (VisualStyle)MemberwiseClone();
    }

    public sealed class ModifierStyle
    {
        public string fill, edge;
        public double? fillAlpha, edgeAlpha, edgeWidthPx, pulseHz, fillAlphaAdd;
        public bool? brackets, grid;
    }

    /// <summary>
    /// The colour table shared with the web preview. It is generated from HOLOGRAM_PALETTE in
    /// packages/project-model/src/visual.ts by `pnpm gen:fixtures`; nothing on the headset hard-codes a colour.
    /// </summary>
    public sealed class HologramPalette
    {
        public Dictionary<string, VisualStyle> bases = new Dictionary<string, VisualStyle>();
        public Dictionary<string, ModifierStyle> modifiers = new Dictionary<string, ModifierStyle>();

        public static HologramPalette Parse(string json)
        {
            var palette = CoreJson.Parse<HologramPalette>(json);
            foreach (BaseVisual b in Enum.GetValues(typeof(BaseVisual)))
                if (!palette.bases.ContainsKey(b.ToString())) throw new FormatException($"hologram palette has no base look for {b}");
            return palette;
        }

        /// <summary>Twin of styleFor in visual.ts: WRONG outranks every modifier; SELECTED then HIGHLIGHTED, so HIGHLIGHTED wins.</summary>
        public VisualStyle StyleFor(PartVisual visual)
        {
            var style = bases[visual.Base.ToString()].Clone();
            if (visual.Base == BaseVisual.WRONG) return style;
            foreach (var m in new[] { VisualModifier.SELECTED, VisualModifier.HIGHLIGHTED })
            {
                if (!visual.Modifiers.Contains(m) || !modifiers.TryGetValue(m.ToString(), out var mod)) continue;
                if (mod.fill != null) style.fill = mod.fill;
                if (mod.edge != null) style.edge = mod.edge;
                if (mod.fillAlpha.HasValue) style.fillAlpha = mod.fillAlpha.Value;
                if (mod.edgeAlpha.HasValue) style.edgeAlpha = mod.edgeAlpha.Value;
                if (mod.edgeWidthPx.HasValue) style.edgeWidthPx = mod.edgeWidthPx.Value;
                if (mod.pulseHz.HasValue) style.pulseHz = mod.pulseHz.Value;
                if (mod.brackets.HasValue) style.brackets = mod.brackets.Value;
                if (mod.grid.HasValue) style.grid = mod.grid.Value;
                style.fillAlpha = Math.Min(1, style.fillAlpha + (mod.fillAlphaAdd ?? 0));
            }
            return style;
        }

        /// <summary>"#RRGGBB" → 0..1 components. Kept here so Core needs no UnityEngine.</summary>
        public static (float r, float g, float b) Rgb(string hex)
        {
            if (hex == null || hex.Length != 7 || hex[0] != '#') throw new FormatException($"expected #RRGGBB, got '{hex}'");
            int v = Convert.ToInt32(hex.Substring(1), 16);
            return (((v >> 16) & 255) / 255f, ((v >> 8) & 255) / 255f, (v & 255) / 255f);
        }
    }
}
