// The room-scan look: a blue holographic grid over every known surface, edges brightened by
// fresnel, revealed by an expanding pulse ring (RoomGlow.cs drives _PulseOrigin/_PulseRadius).
//
// Written for the Built-in pipeline. If the project turns out to be URP, rebuild it as a Shader
// Graph with the same four properties — the C# side does not care which.
Shader "CutOnce/SheikahGlow"
{
    Properties
    {
        _Tint ("Tint", Color) = (0.15, 0.55, 1.0, 0.35)
        _GridScale ("Grid cells per metre", Float) = 4.0
        _GridLine ("Grid line width", Range(0.01, 0.3)) = 0.06
        _PulseOrigin ("Pulse origin (world)", Vector) = (0, 0, 0, 0)
        _PulseRadius ("Pulse radius (m)", Float) = 999.0
    }
    SubShader
    {
        Tags { "Queue" = "Transparent" "RenderType" = "Transparent" }
        Blend SrcAlpha One          // additive-ish: glows over passthrough, never blacks it out
        ZWrite Off
        Cull Off                    // quads visible from both sides; walls are seen from inside

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            fixed4 _Tint;
            float _GridScale, _GridLine, _PulseRadius;
            float4 _PulseOrigin;

            struct v2f
            {
                float4 pos : SV_POSITION;
                float3 world : TEXCOORD0;
                float3 normal : TEXCOORD1;
                float3 view : TEXCOORD2;
            };

            v2f vert (appdata_base v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.world = mul(unity_ObjectToWorld, v.vertex).xyz;
                o.normal = UnityObjectToWorldNormal(v.normal);
                o.view = WorldSpaceViewDir(v.vertex);
                return o;
            }

            // World-space grid on whichever plane the surface faces (triplanar pick), so boxes and
            // walls all get clean square cells with no UV work.
            float grid(float3 p, float3 n)
            {
                float3 an = abs(n);
                float2 uv = an.y > 0.5 ? p.xz : (an.x > 0.5 ? p.zy : p.xy);
                float2 cells = abs(frac(uv * _GridScale) - 0.5);
                float d = min(cells.x, cells.y);
                return smoothstep(_GridLine, 0.0, d);
            }

            fixed4 frag (v2f i) : SV_Target
            {
                float3 n = normalize(i.normal);
                float fresnel = pow(1.0 - saturate(dot(n, normalize(i.view))), 2.0);
                float g = grid(i.world, n);

                // The reveal: nothing past the pulse front, a bright ring at the front itself.
                float dist = distance(i.world, _PulseOrigin.xyz);
                float revealed = smoothstep(_PulseRadius, _PulseRadius - 0.4, dist);
                float ring = smoothstep(0.35, 0.0, abs(dist - _PulseRadius)) * 2.0;

                float glow = (g * 0.9 + fresnel * 0.8 + 0.08) * revealed + ring;
                fixed4 c = _Tint;
                c.rgb *= glow;
                c.a = saturate(_Tint.a * glow);
                return c;
            }
            ENDCG
        }
    }
}
