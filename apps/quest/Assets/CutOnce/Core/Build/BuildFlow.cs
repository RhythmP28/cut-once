using System.Collections.Generic;

namespace CutOnce.Core
{
    public enum BuildPhase { Off, Scanning, Labelled, Ideas, Starting, Assembling, Walkthrough }

    /// <summary>
    /// Build mode's states, with no Unity in them, so every transition is unit-tested. Messages that arrive in the wrong
    /// phase are ignored: a late inventory never interrupts a build, and ideas from an old session never replace new ones.
    /// </summary>
    public sealed class BuildFlow
    {
        BuildPhase _beforeScan = BuildPhase.Off;
        string _leftSession;

        public BuildPhase Phase { get; private set; } = BuildPhase.Off;
        public string SessionId { get; private set; }
        public InventoryDto Inventory { get; private set; }
        public List<BuildIdeaDto> Ideas { get; private set; } = new List<BuildIdeaDto>();
        public BuildIdeaDto Chosen { get; private set; }
        public bool Active => Phase != BuildPhase.Off;
        /// <summary>While you look at the room and choose, the run that was showing (E7, the desk, the last design) is out of the way.</summary>
        public bool HidesHologram => Phase == BuildPhase.Scanning || Phase == BuildPhase.Labelled || Phase == BuildPhase.Ideas || Phase == BuildPhase.Starting;
        bool Building => Phase == BuildPhase.Starting || Phase == BuildPhase.Assembling || Phase == BuildPhase.Walkthrough;
        /// <summary>
        /// The scan BUTTON (X) only works until a design is chosen: a thumb resting on it mid-build must not throw the
        /// walkthrough away. Saying "what can I build?" stays the deliberate way to start over.
        /// </summary>
        public bool CanScanFromButton => !Building;
        /// <summary>
        /// The trigger on empty space scans another view only while there are no previews to miss. With previews showing, a
        /// trigger that hits none of them is a near miss, and a rescan would clear the very previews being picked from.
        /// </summary>
        public bool CanScanFromTrigger => Phase == BuildPhase.Labelled;

        /// <summary>
        /// A new scan ("what can I build?" mid-build starts over, keeping the session so views merge). False when it is
        /// refused: while the pieces are flying, because only the flight's end leaves Assembling, so a scan that stopped
        /// the flight and then failed would strand the build there.
        /// </summary>
        public bool StartScan()
        {
            if (Phase == BuildPhase.Assembling) return false;
            if (Phase != BuildPhase.Scanning) _beforeScan = Phase;
            Phase = BuildPhase.Scanning;
            return true;
        }

        /// <summary>The scan never reached the server: back to where you were (nothing, the ideas you had, the build you were on).</summary>
        public void ScanFailed() { if (Phase == BuildPhase.Scanning) Phase = _beforeScan; }

        public void OnScanAccepted(string sessionId) => SessionId = sessionId;

        /// <summary>True when the inventory was taken (so it is the one to show). With build mode off it starts it: a Director replay counts.</summary>
        public bool OnInventory(InventoryDto inventory)
        {
            if (inventory == null || Building) return false;
            if (Phase == BuildPhase.Off && inventory.session_id != null && inventory.session_id == _leftSession) return false;   // labels that were still on their way when you left
            SessionId = inventory.session_id; Inventory = inventory;
            if (inventory.labelled && Phase != BuildPhase.Ideas) Phase = BuildPhase.Labelled;
            else if (Phase == BuildPhase.Off) Phase = BuildPhase.Scanning;
            return true;
        }

        /// <summary>True when the ideas were taken: build mode is on, no build is under way, and they belong to this session.</summary>
        public bool OnIdeas(string sessionId, List<BuildIdeaDto> ideas, bool final)
        {
            if (Phase == BuildPhase.Off || Building || (SessionId != null && sessionId != SessionId)) return false;
            Ideas = ideas ?? new List<BuildIdeaDto>();
            if (Ideas.Count > 0) Phase = BuildPhase.Ideas;
            else if (Phase == BuildPhase.Ideas) Phase = BuildPhase.Labelled;      // a rethink that found nothing: the old previews go
            return true;
        }

        public bool Pick(string ideaId)
        {
            if (Phase != BuildPhase.Ideas) return false;
            var idea = ideaId == null ? null : Ideas.Find(i => i?.idea_id == ideaId);
            if (idea == null) return false;
            Chosen = idea; Phase = BuildPhase.Starting;
            return true;
        }

        public void PickFailed() { if (Phase == BuildPhase.Starting) { Chosen = null; Phase = BuildPhase.Ideas; } }

        /// <summary>
        /// True when this run is the chosen design: picked here, or started by voice or from the Director (then it is found
        /// among the ideas, even while another view is being scanned). Never twice: once built, a reload is just a run.
        /// </summary>
        public bool TryPlace(string planId)
        {
            if (!Active || planId == null || Phase == BuildPhase.Assembling || Phase == BuildPhase.Walkthrough) return false;
            var idea = Chosen?.plan != null && Chosen.plan.plan_id == planId ? Chosen : Ideas.Find(i => i?.plan != null && i.plan.plan_id == planId);
            if (idea == null) return false;
            Chosen = idea; Phase = BuildPhase.Starting;
            return true;
        }

        public void OnPlaced() { if (Phase == BuildPhase.Starting) Phase = BuildPhase.Assembling; }
        public void OnAssembled() { if (Phase == BuildPhase.Assembling) Phase = BuildPhase.Walkthrough; }

        public void Exit()
        {
            _leftSession = SessionId ?? _leftSession;
            Phase = BuildPhase.Off; _beforeScan = BuildPhase.Off; SessionId = null; Inventory = null; Chosen = null;
            Ideas = new List<BuildIdeaDto>();
        }
    }
}
