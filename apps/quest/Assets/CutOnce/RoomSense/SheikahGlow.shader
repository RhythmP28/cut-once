// The room-scan look: a blue holographic grid over every known surface, edges brightened by
// fresnel, revealed by an expanding pulse ring (RoomGlow.cs drives _PulseOrigin/_PulseRadius).
//
// Two SubShaders, same look: Unity picks the first when URP is active (fresh Unity 6 templates)
// and falls back to the Built-in one otherwise, so the material never shows up pink.
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

    // ── URP ─────────────────────────────────────────────────────────────────────
    SubShader
    {
        Tags { "RenderPipeline" = "UniversalPipeline" "Queue" = "Transparent" "RenderType" = "Transparent" }
        Blend SrcAlpha One
        ZWrite Off
        Cull Off

        Pass
        {
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            CBUFFER_START(UnityPerMaterial)
                float4 _Tint;
                float _GridScale, _GridLine, _PulseRadius;
                float4 _PulseOrigin;
            CBUFFER_END

            struct Attributes { float4 positionOS : POSITION; float3 normalOS : NORMAL; };
            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float3 world : TEXCOORD0;
                float3 normal : TEXCOORD1;
            };

            Varyings vert (Attributes v)
            {
                Varyings o;
                o.world = TransformObjectToWorld(v.positionOS.xyz);
                o.positionCS = TransformWorldToHClip(o.world);
                o.normal = TransformObjectToWorldNormal(v.normalOS);
                return o;
            }

            float grid(float3 p, float3 n)
            {
                float3 an = abs(n);
                float2 uv = an.y > 0.5 ? p.xz : (an.x > 0.5 ? p.zy : p.xy);
                float2 cells = abs(frac(uv * _GridScale) - 0.5);
                return smoothstep(_GridLine, 0.0, min(cells.x, cells.y));
            }

            half4 frag (Varyings i) : SV_Target
            {
                float3 n = normalize(i.normal);
                float3 view = normalize(_WorldSpaceCameraPos - i.world);
                float fresnel = pow(1.0 - saturate(abs(dot(n, view))), 2.0);
                float g = grid(i.world, n);

                float dist = distance(i.world, _PulseOrigin.xyz);
                float revealed = smoothstep(_PulseRadius, _PulseRadius - 0.4, dist);
                float ring = smoothstep(0.35, 0.0, abs(dist - _PulseRadius)) * 2.0;

                float glow = (g * 0.9 + fresnel * 0.8 + 0.08) * revealed + ring;
                half4 c = _Tint;
                c.rgb *= glow;
                c.a = saturate(_Tint.a * glow);
                return c;
            }
            ENDHLSL
        }
    }

    // ── Built-in pipeline ───────────────────────────────────────────────────────
    SubShader
    {
        Tags { "Queue" = "Transparent" "RenderType" = "Transparent" }
        Blend SrcAlpha One
        ZWrite Off
        Cull Off

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

            float grid(float3 p, float3 n)
            {
                float3 an = abs(n);
                float2 uv = an.y > 0.5 ? p.xz : (an.x > 0.5 ? p.zy : p.xy);
                float2 cells = abs(frac(uv * _GridScale) - 0.5);
                return smoothstep(_GridLine, 0.0, min(cells.x, cells.y));
            }

            fixed4 frag (v2f i) : SV_Target
            {
                float3 n = normalize(i.normal);
                float fresnel = pow(1.0 - saturate(abs(dot(n, normalize(i.view)))), 2.0);
                float g = grid(i.world, n);

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
