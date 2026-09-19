// Cut Once hologram: see-through fill, crisp edges (a physical width with a floor in pixels), optional grid, corner brackets,
// dashes for estimated parts, a pulse, and a bottom-up reveal. One pass, unlit, no post-processing: the Quest has no
// budget for bloom, so the glow is a soft falloff around the edge line itself.
//
// Edges are measured in object space. ShapeFactory builds every mesh at its true size in metres and passes the half
// extents in _HalfSize, so "distance to the nearest box edge" is exact and needs no extra geometry or wireframe pass.
//
// Blending uses separate factors for alpha. Over Meta passthrough the frame buffer's alpha decides how much of the
// camera image shows through; with joint factors the alpha would be squared and the hologram would look washed out.
Shader "CutOnce/Hologram"
{
    Properties
    {
        _FillColor ("Fill (rgb, a = opacity)", Color) = (0.13, 0.83, 0.93, 0.18)
        _EdgeColor ("Edge (rgb, a = opacity)", Color) = (0.13, 0.83, 0.93, 0.9)
        _EdgeWidthPx ("Edge width (pixels)", Float) = 1.5
        _PulseHz ("Pulse (Hz, 0 = steady)", Float) = 0
        _Brackets ("Corner brackets only", Float) = 0
        _Grid ("Grid on", Float) = 0
        _Dashed ("Dashed edges (estimated part)", Float) = 0
        _HalfSize ("Half size (object space, m)", Vector) = (0.5, 0.5, 0.5, 0)
        _EdgeMode ("0 none, 1 box, 2 cylinder along Y", Float) = 1
        _GridStep ("Grid step (m)", Float) = 0.1
        _RevealY ("Reveal height (world y; 1e6 = all)", Float) = 1000000
        _BandWidth ("Reveal band (m)", Float) = 0.02
    }
    SubShader
    {
        Tags { "RenderPipeline" = "UniversalPipeline" "RenderType" = "Transparent" "Queue" = "Transparent" "IgnoreProjector" = "True" }
        Pass
        {
            Name "Hologram"
            Tags { "LightMode" = "UniversalForward" }
            Blend SrcAlpha OneMinusSrcAlpha, One OneMinusSrcAlpha
            ZWrite Off
            Cull Off

            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma multi_compile_instancing
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Assets/CutOnce/AR/Rendering/RevealClip.hlsl"

            CBUFFER_START(UnityPerMaterial)
                half4 _FillColor;
                half4 _EdgeColor;
                float4 _HalfSize;
                float _EdgeWidthPx, _PulseHz, _Brackets, _Grid, _Dashed, _EdgeMode, _GridStep, _RevealY, _BandWidth;
            CBUFFER_END

            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS : NORMAL;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float3 positionOS : TEXCOORD0;
                float3 positionWS : TEXCOORD1;
                float3 normalWS : TEXCOORD2;
                UNITY_VERTEX_OUTPUT_STEREO
            };

            Varyings Vert(Attributes input)
            {
                Varyings output = (Varyings)0;
                UNITY_SETUP_INSTANCE_ID(input);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(output);
                output.positionOS = input.positionOS.xyz;
                output.positionWS = TransformObjectToWorld(input.positionOS.xyz);
                output.positionCS = TransformWorldToHClip(output.positionWS);
                output.normalWS = TransformObjectToWorldNormal(input.normalOS);
                return output;
            }

            // Distance (m) from this fragment to the nearest outline edge of its shape, and to the nearest corner along it.
            void EdgeDistances(float3 p, out float toEdge, out float alongEdge)
            {
                if (_EdgeMode > 1.5)
                {
                    float toCap = _HalfSize.y - abs(p.y), toRim = _HalfSize.x - length(p.xz);
                    toEdge = max(toCap, toRim);          // on the side toRim is 0, on a cap toCap is 0: the other one is the distance
                    alongEdge = 1e3;                     // a rim has no corners
                    return;
                }
                float3 d = _HalfSize.xyz - abs(p);       // on a face one of these is 0; the other two reach that face's borders
                float lo = min(d.x, min(d.y, d.z)), hi = max(d.x, max(d.y, d.z));
                toEdge = d.x + d.y + d.z - lo - hi;      // the middle value
                alongEdge = hi;
            }

            half4 Frag(Varyings input, bool frontFace : SV_IsFrontFace) : SV_Target
            {
                UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(input);

                float revealAlpha, band;
                RevealClip_float(input.positionWS, _RevealY, _BandWidth, revealAlpha, band);
                clip(revealAlpha - 0.5);

                half pulse = _PulseHz > 0.001 ? 0.65 + 0.35 * sin(_Time.y * _PulseHz * 6.2831853) : 1.0;

                // Edge line: constant width in pixels, anti-aliased, with a soft halo that stands in for bloom.
                half edge = 0;
                if (_EdgeMode > 0.5)
                {
                    float toEdge, alongEdge;
                    EdgeDistances(input.positionOS, toEdge, alongEdge);
                    // The palette gives widths in pixels. One Quest 3 pixel is about 0.66 mm at 80 cm (the figure QuestBaselineScene
                    // uses), so that is the line's physical width: lean in and the line keeps its size instead of thinning to a hair.
                    // The pixel width is the floor: across the room the line never drops below what the display can draw steadily.
                    float pixel = max(fwidth(toEdge), 1e-6);
                    float width = max(pixel, 0.00066) * max(_EdgeWidthPx, 0.5);
                    edge = 1.0 - smoothstep(width * 0.5, width, toEdge);
                    edge = max(edge, 0.35 * exp(-toEdge / (width * 2.5)));
                    if (_Brackets > 0.5)
                    {
                        float reach = clamp(min(_HalfSize.x, min(_HalfSize.y, _HalfSize.z)) * 0.8, 0.01, 0.04);
                        edge *= 1.0 - smoothstep(reach, reach * 1.2, alongEdge);
                    }
                    if (_Dashed > 0.5) edge *= step(0.5, frac((input.positionOS.x + input.positionOS.y + input.positionOS.z) / 0.03));
                }

                // Grid: lines every _GridStep metres on the two axes that run along this face.
                half grid = 0;
                if (_Grid > 0.5)
                {
                    float3 cell = abs(frac(input.positionOS / _GridStep - 0.5) - 0.5) * _GridStep;
                    float3 pixelSize = fwidth(input.positionOS);
                    float3 lines = (1.0 - smoothstep(0.0, pixelSize * 1.5, cell)) * step(1e-5, pixelSize);
                    grid = 0.5 * max(lines.x, max(lines.y, lines.z));
                }

                // Fresnel: surfaces that turn away from the eye brighten, which reads as a rim on rounded parts.
                float3 viewDir = normalize(GetWorldSpaceViewDir(input.positionWS));
                half facing = abs(dot(normalize(input.normalWS), viewDir));
                half rim = pow(1.0 - facing, 3.0);

                half fillAlpha = _FillColor.a * (frontFace ? 1.0 : 0.4) * (0.7 + 0.6 * rim) * pulse;
                half lineAlpha = saturate(max(edge, grid) * _EdgeColor.a * pulse + band);

                half alpha = saturate(fillAlpha + lineAlpha);
                half3 colour = (_FillColor.rgb * fillAlpha + _EdgeColor.rgb * lineAlpha) / max(alpha, 1e-4);
                return half4(colour, alpha);
            }
            ENDHLSL
        }
    }
    Fallback Off
}
