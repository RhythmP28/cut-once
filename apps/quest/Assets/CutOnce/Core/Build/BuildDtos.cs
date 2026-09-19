using System.Collections.Generic;

namespace CutOnce.Core
{
    // C# twins of packages/schemas' build-mode contracts (field names match the JSON). Points and poses are in the
    // plan's frame (right-handed, +Y up): convert with ModelSpace on the way in and ScanEncoder on the way out.

    /// <summary>POST /v1/build/scans. One point per grid cell (mm) or a miss, row-major from the photo's top-left.</summary>
    public sealed class BuildScanUploadDto
    {
        public string session_id, device_id, hit, photo_b64;
        public BuildGridDto grid;
        public int[] points_mm;
        public BuildCameraDto camera;
    }
    public sealed class BuildGridDto { public int cols, rows; }
    public sealed class BuildCameraDto { public double[] position, forward; public BuildIntrinsicsDto intrinsics; }
    public sealed class BuildIntrinsicsDto { public int width, height; public double fx, fy, cx, cy; }
    public sealed class ScanAcceptedDto { public string scan_id, session_id; }

    public sealed class SurfaceDto { public string surface_id, kind; public double y; public double[] min, max; public int points; }

    /// <summary>One real object. yaw_deg is a right-handed turn about +Y taking its local +X onto its long side.</summary>
    public sealed class TwinDto
    {
        public string twin_id, name, label, sits_on, material;
        public ShapeDto shape;
        public double[] position;
        public double yaw_deg, confidence, error_m, distance_m;
        public bool load_bearing, cuttable, snapped;
        public int points;
    }

    public sealed class InventoryDto
    {
        public string session_id, scan_id, message;
        public bool labelled;
        public List<SurfaceDto> surfaces = new List<SurfaceDto>();
        public List<TwinDto> twins = new List<TwinDto>();
    }

    public sealed class BuildOriginDto { public double[] position, rotation_quat; }

    /// <summary>A checked design: its plan (design frame) and where that frame sits in the room.</summary>
    public sealed class BuildIdeaDto
    {
        public string idea_id, session_id, source, rule_id, title, why;
        public List<string> tools = new List<string>();
        public PlanDto plan;
        public BuildOriginDto origin;
        public Dictionary<string, string> twin_of = new Dictionary<string, string>();
        public double score;
    }

    public sealed class IdeaStartedDto { public string assembly_id, plan_id; public int revision; }

    /// <summary>GET /v1/build/sessions/current: the session (null after a server restart) and what it holds. The server only keeps objects it has named.</summary>
    public sealed class BuildSessionSnapshotDto
    {
        public BuildSessionInfoDto session;
        public List<SurfaceDto> surfaces = new List<SurfaceDto>();
        public List<TwinDto> twins = new List<TwinDto>();
        public List<BuildIdeaDto> ideas = new List<BuildIdeaDto>();
    }
    public sealed class BuildSessionInfoDto { public string session_id, created_at; public List<string> scans = new List<string>(); }
    public sealed class SayRequestDto { public string text; }
    public sealed class SayDto { public string turn_id, audio_url; }
}
