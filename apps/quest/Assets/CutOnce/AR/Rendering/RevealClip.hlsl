// Cut Once: reveal a part bottom-up by world height (idea from daniel-ilett/dissolve-urp, MIT).
// Shader Graph Custom Function node, File mode, name "RevealClip".
// Inputs: WorldPos = Position node (World space); RevealY = _RevealY (default 1e6 = fully shown);
//         BandWidth = _BandWidth (a look value: take it from the hologram palette, starting at 0.02 m).
// Outputs: Alpha → multiply into alpha and feed Alpha Clip Threshold (Alpha Clipping on); Band → add as HDR edge colour.
void RevealClip_float(float3 WorldPos, float RevealY, float BandWidth, out float Alpha, out float Band)
{
    Alpha = step(WorldPos.y, RevealY);                                            // 1 below the cut, 0 above
    Band = Alpha * saturate(1.0 - (RevealY - WorldPos.y) / max(BandWidth, 1e-4)); // bright strip just under the cut
}
