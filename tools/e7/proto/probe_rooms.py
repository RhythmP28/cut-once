"""Feasibility probe: rooms and doors on the E7 Level 3 plate by connected components of free space.
A door drawn as leaf + swing arc seals its opening, so rooms come out as closed regions and each door swing is its
own small quarter-disc region."""
import sys, json, numpy as np, cv2
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
src, out = sys.argv[1], sys.argv[2]
im = np.array(Image.open(src).convert("L"))
k = im.shape[1] / 2000.0                      # overrides are in the 2000 px frame
PXM = 13.75 * k                               # px per metre on the original
x0, y0, x1, y1 = [int(v * k) for v in (790, 340, 1390, 1710)]   # E7 bar + atrium, generous
g = im[y0:y1, x0:x1]
ink = (g < 150).astype(np.uint8)              # linework + dark column squares (grey cores ~ 215 stay free)
ink = cv2.dilate(ink, np.ones((2, 2), np.uint8))               # close 1 px JPEG breaks in thin lines
free = (1 - ink).astype(np.uint8)
n, lab, stats, cent = cv2.connectedComponentsWithStats(free, connectivity=4)
m2 = lambda a: a / PXM ** 2
rooms, doors, tiny, big = [], [], 0, []
H, W = free.shape
for i in range(1, n):
    x, y, w, h, a = stats[i]
    area = m2(a)
    touches = x == 0 or y == 0 or x + w >= W or y + h >= H
    if touches: big.append(area); continue                     # outside / page background
    if area < 0.15: tiny += 1; continue                        # text holes, furniture bits, hatch
    ext = a / float(w * h)
    wm, hm = w / PXM, h / PXM
    # quarter disc: bbox ~ r x r with r 0.7..1.1 m, fill ~ pi/4 = 0.785
    if 0.25 <= area <= 1.0 and 0.6 <= wm <= 1.25 and 0.6 <= hm <= 1.25 and 0.62 <= ext <= 0.9 and 0.75 <= wm / hm <= 1.33:
        doors.append((i, area, wm, hm)); continue
    if area >= 2.0: rooms.append((i, area, wm, hm, ext))
print(f"px/m {PXM:.2f} | crop {W}x{H} px = {W/PXM:.0f} x {H/PXM:.0f} m | components {n-1}")
print(f"rooms >= 2 m2: {len(rooms)} | door-swing candidates: {len(doors)} | tiny discarded: {tiny} | border regions: {len(big)}")
ra = sorted(r[1] for r in rooms)
print("room area m2: min %.1f  median %.1f  p90 %.1f  max %.1f  sum %.0f" % (ra[0], ra[len(ra)//2], ra[int(len(ra)*.9)], ra[-1], sum(ra)))
hist = np.histogram(ra, bins=[2, 6, 12, 20, 40, 80, 200, 5000])[0]
print("rooms by size [2-6,6-12,12-20,20-40,40-80,80-200,200+]:", hist.tolist())
print("door widths m (first 12):", [round(max(d[2], d[3]), 2) for d in doors[:12]])
# overlay
vis = cv2.cvtColor(g, cv2.COLOR_GRAY2BGR)
rng = np.random.default_rng(7)
for i, area, *_ in rooms:
    col = rng.integers(90, 230, 3).tolist() if area < 200 else [235, 235, 200]
    vis[lab == i] = (0.55 * np.array(col) + 0.45 * vis[lab == i]).astype(np.uint8)
for i, *_ in doors:
    vis[lab == i] = (0, 0, 255)
cv2.imwrite(out, vis)
json.dump({"rooms": len(rooms), "doors": len(doors)}, open(out + ".json", "w"))
