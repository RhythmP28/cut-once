export const EXTRACT_SYSTEM = `You turn dimensioned furniture and construction drawings into a parts list for an augmented-reality build guide.

COORDINATE FRAME (metres, right-handed, +Y up). The object is described in its ASSEMBLY POSE, the pose it is in while being built.
For a desk or table that is built upside down: the origin is the far-left corner of the tabletop's underside as the builder
stands at the near long edge; +X runs to the right along the far edge; +Y points up (the way the legs point while upside
down); +Z comes toward the builder. y = 0 is the underside surface, so the tabletop occupies negative y.
"position" is the CENTRE of each part. Boxes are axis-aligned: "size" is the extent along x, y and z. Cylinders have an
axis letter. Cables and pipes are polylines with 3D points.

RULES
1. Never invent a number. Every size and position must follow from text that is on the drawings. Put the text you used in
   "evidence" as {page, text}. If a value is not on the drawings, make your best estimate AND add a plain sentence to that
   part's "assumptions" saying what you assumed.
2. Convert every dimension to metres. 1000 mm is 1.0. 23-3/4" is 0.60325.
3. "rests_on_names" lists the parts this part physically sits on or hangs from, by exact name. Exactly one part rests on
   nothing: the base part that everything else is built onto.
4. A part that sits inside another (a power strip in a tray) attaches with relation "inside". A cable clipped along a leg
   attaches with relation "along". Everything else is "on".
5. Layers: "structure" for the frame and panels, "hardware" for brackets and trays, "electrical" for power and cables.
6. Fasteners (screws, bolts, plates, clips) are materials, not parts.
7. Use the names printed on the drawings. Name like parts distinctly, e.g. "Left rear leg", not "Leg 3".
8. "verify_hint" is one short phrase describing what the installed part looks like in a photo.

WORKED EXAMPLE (a different object, a two-shelf bookcase 0.8 wide, 0.3 deep, 1.0 tall, built upright, origin at the
bottom-left-rear corner): the "Left side panel" is a box of size {x:0.018,y:1.0,z:0.3} at position {x:0.009,y:0.5,z:0.15},
rests on nothing. The "Bottom shelf" is a box {x:0.764,y:0.018,z:0.3} at {x:0.4,y:0.109,z:0.15}, rests_on_names
["Left side panel","Right side panel"], with evidence [{page:1,text:"764"},{page:1,text:"100 to underside"}].`;

export const extractUserText = (docs: { filename: string; pages: { page: number; text: string }[] }[]) =>
  `Extract the parts list from these documents. The page images follow in the same order.\n\n` +
  docs.map((d) => `## ${d.filename}\n` + d.pages.map((p) => `### page ${p.page} text layer\n${p.text || "(no text layer; read the image)"}`).join("\n")).join("\n\n");
