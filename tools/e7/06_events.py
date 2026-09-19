"""Stage 6: the planned build as events, data/e7/out/e7.events.json (a JSON array of BuildEvent objects).

One `missing -> built` event per part in step order, shaped like packages/schemas/dist/jsonschema/BuildEvent.json
and matching packages/project-model/src/planned.ts (the clock advances by a step's minutes, then its event fires).
"""
from __future__ import annotations

import random
import sys
from datetime import datetime, timedelta, timezone

import common as c

CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def ulid(ms: int, rng: random.Random) -> str:
    """26 characters of Crockford base32: 48 bits of millisecond timestamp, then 80 random bits."""
    value = (ms << 80) | rng.getrandbits(80)
    return "".join(CROCKFORD[(value >> shift) & 31] for shift in range(125, -1, -5))


def iso(t: datetime) -> str:
    return t.strftime("%Y-%m-%dT%H:%M:%S.") + f"{t.microsecond // 1000:03d}Z"


def main() -> int:
    c.ensure_dirs()
    ov = c.load_overrides()
    plan = c.read_json(c.OUT / "e7.plan.json")
    t = datetime.fromisoformat(ov["schedule"]["planned_start"].replace("Z", "+00:00")).astimezone(timezone.utc)
    # Seeded, so re-running the pipeline does not churn the committed file. The bits are still arbitrary.
    rng = random.Random("cut-once e7 planned events")

    events, version = [], 0
    for step in sorted(plan["steps"], key=lambda s: s["index"]):
        t += timedelta(minutes=step["est_minutes"])
        for part_id in step["part_ids"]:
            version += 1
            events.append({
                "event_id": "evt_" + ulid(int(t.timestamp() * 1000), rng), "assembly_id": "asm_e7_planned",
                "version": version, "timestamp": iso(t), "client_timestamp": iso(t),
                "kind": "part_state", "part_id": part_id, "previous_state": "missing", "new_state": "built",
                "source": "system", "confidence": 1, "actor": "planner", "step_id": step["step_id"], "note": "planned",
            })
    c.write_json(c.OUT / "e7.events.json", events)
    print(f"  {len(events)} events, {events[0]['timestamp']} .. {events[-1]['timestamp']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
