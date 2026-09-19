# Desk measuring sheet

Fill this in with a tape measure, then put the numbers into `data/demo/desk.plan.json`, bump `revision` to 2, set
`provenance.approved_by` to your name, and run `pnpm pm validate data/demo/desk.plan.json`. **Until then the plan holds
archetype numbers, not this desk's.** Photograph each measurement into `data/demo/measure-photos/`.

Desk is upside down on the floor. Corner **A** = far-left underside corner as the Operator stands at the near long edge.
x runs right from A, z runs toward the Operator from A, y is up from the underside surface. All values in millimetres here; the plan uses metres.

| # | Measure | Value (mm) | Goes into |
|---|---|---|---|
| 1 | Tabletop width (x) × depth (z) × thickness | | `part_tabletop.shape.size`, `position` = half of each (y negative), and `overall_size` |
| 2 | Left front leg plate centre: x, z | | `part_left_front_leg.position` x, z |
| 3 | Right front leg plate centre: x, z | | `part_right_front_leg.position` |
| 4 | Left rear leg plate centre: x, z | | `part_left_rear_leg.position` |
| 5 | Right rear leg plate centre: x, z | | `part_right_rear_leg.position` |
| 6 | Leg diameter (or width) and length | | each leg's `shape`; `position.y` = length / 2 |
| 7 | Crossbar: length, height, thickness; its centre x, y, z | | `part_rear_crossbar` |
| 8 | Cable tray: size; its centre x, y, z | | `part_cable_tray` |
| 9 | Power strip: size; its centre x, y, z | | `part_power_strip` |
| 10 | Cable route: 4–6 points (x, y, z) from the strip, through the tray, down the right rear leg | | `part_power_cable.shape.points` |
| 11 | QR m1 centre x, z (near edge) · printed code size | | `markers[0]` |
| 12 | QR m2 centre x, z (near edge) · printed code size | | `markers[1]` |
| 13 | QR m3 centre x, z (far edge, clear of the tray) · printed code size | | `markers[2]` |
| 14 | Near-left and near-right corners | x=0 / x=width, z=depth | `touch_points` |

Checks after entering: overall height = tabletop thickness + leg length; legs mirror left-to-right (the validator warns if not);
every leg's bottom sits exactly on y = 0.
