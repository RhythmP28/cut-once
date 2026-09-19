using System;
using System.Linq;
using System.Text.RegularExpressions;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace CutOnce.Core.Tests
{
    public class BuildStateStoreTests
    {
        const string Aid = "asm_test_run";
        static BuildStateStore NewStore()
        {
            var store = new BuildStateStore();
            store.Reset(RepoFiles.Plan("plan_desk_archetype.json"), Aid, null);
            return store;
        }

        [Test]
        public void ATapShowsAtOnceAsAProvisionalEvent()
        {
            var store = NewStore();
            int changes = 0; store.Changed += () => changes++;

            var e = store.Propose("part_tabletop", "built");

            Assert.That(e, Is.Not.Null);
            Assert.That(e.version, Is.Null);
            Assert.That(e.previous_state, Is.EqualTo("missing"));
            Assert.That(Regex.IsMatch(e.event_id, "^evt_[0-9A-HJKMNP-TV-Z]{26}$"), Is.True, e.event_id);
            Assert.That(store.Current.parts["part_tabletop"].state, Is.EqualTo("built"));
            Assert.That(store.Current.progress.built, Is.EqualTo(1));
            Assert.That(changes, Is.EqualTo(1));
        }

        [Test]
        public void ProposingTheStateAPartAlreadyHasIsNothingToSend()
        {
            var store = NewStore();
            Assert.That(store.Propose("part_tabletop", "missing"), Is.Null);
            Assert.That(store.Propose("part_does_not_exist", "built"), Is.Null);
        }

        [Test]
        public void TheServersCopyReplacesTheProvisionalOneAndASecondCopyChangesNothing()
        {
            var store = NewStore();
            var e = store.Propose("part_tabletop", "built");
            var numbered = CoreJson.Parse<BuildEventDto>(CoreJson.Write(e)); numbered.version = 1;

            Assert.That(store.ApplyServer(numbered), Is.True);     // from the POST response
            Assert.That(store.ApplyServer(numbered), Is.False);    // the same event again, from the stream

            Assert.That(store.Events.Count, Is.EqualTo(1));
            Assert.That(store.Provisional.Any(), Is.False);
            Assert.That(store.Head, Is.EqualTo(1));
            Assert.That(store.Current.version, Is.EqualTo(1));
        }

        [Test]
        public void ARefusedEventIsForgotten()
        {
            var store = NewStore();
            var e = store.Propose("part_tabletop", "built");
            store.DropProvisional(e.event_id);
            Assert.That(store.Current.parts["part_tabletop"].state, Is.EqualTo("missing"));
        }

        [Test]
        public void EventsForAnotherRunAreIgnored()
        {
            var store = NewStore();
            var other = new BuildEventDto { event_id = "evt_" + Ulid.New(), assembly_id = "asm_other", version = 1, kind = "part_state",
                part_id = "part_tabletop", previous_state = "missing", new_state = "built", source = "manual", confidence = 1, actor = "x" };
            Assert.That(store.ApplyServer(other), Is.False);
        }

        [Test]
        public void HistoryLeavesProvisionalEventsOut()
        {
            var store = NewStore();
            var first = store.Propose("part_tabletop", "built"); first.version = 1;
            store.Propose("part_left_front_leg", "built");         // still provisional
            Assert.That(store.At(1).parts["part_left_front_leg"].state, Is.EqualTo("missing"));
            Assert.That(store.Current.parts["part_left_front_leg"].state, Is.EqualTo("built"));
        }

        [Test]
        public void TheWireFormKeepsVersionNullAndLeavesOptionalFieldsOut()
        {
            var e = NewStore().Propose("part_tabletop", "built", nowUtc: new DateTime(2026, 9, 19, 12, 0, 0, DateTimeKind.Utc));
            var json = CoreJson.Parse<JObject>(CoreJson.Write(e));   // JObject.Parse would turn the timestamp into a DateTime
            Assert.That(json["version"].Type, Is.EqualTo(JTokenType.Null));     // nullable: must be present
            Assert.That(json.ContainsKey("verdict"), Is.False);                // optional: must be absent, not null
            Assert.That(json.ContainsKey("note"), Is.False);
            Assert.That((string)json["timestamp"], Is.EqualTo("2026-09-19T12:00:00.000Z"));
        }

        [Test]
        public void ThePlannedBuildEndsWithEverythingBuilt()
        {
            var plan = RepoFiles.Plan("plan_desk_archetype.json");
            var planned = PlannedEvents.For(plan, Aid, new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc));
            Assert.That(planned.Count, Is.EqualTo(plan.steps.Sum(s => s.part_ids.Count)));
            var state = Reducer.Fold(plan, Aid, planned);
            Assert.That(state.progress.built, Is.EqualTo(plan.parts.Count));
            Assert.That(state.out_of_sequence, Is.Empty, "the plan's own order must never look out of sequence");
        }
    }
}
