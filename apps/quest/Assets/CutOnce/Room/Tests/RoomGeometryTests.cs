using System;
using System.IO;
using System.Threading.Tasks;
using NUnit.Framework;
using UnityEngine;

namespace CutOnce.Room.Tests
{
    public class RoomGeometryTests
    {
        static RoomGeometry Square() => new RoomGeometry
        {
            id = "test-room", height = 3,
            floor = new[] { new Vector3(0,0,0), new Vector3(4,0,0), new Vector3(4,0,5), new Vector3(0,0,5) },
            surfaces = Array.Empty<RoomSurface>()
        };
        [Test] public void MeasuresRoomInMetres()
        {
            var room = Square();
            Assert.That(room.Area, Is.EqualTo(20).Within(.001));
            Assert.That(room.Perimeter, Is.EqualTo(18).Within(.001));
            Assert.That(room.WallClearance(new Vector3(1, 1, 2)), Is.EqualTo(1).Within(.001));
        }
        [Test] public void BoundaryIncludesSurfacesButRejectsOutsideAndNonFinite()
        {
            var room = Square();
            Assert.True(room.Contains(new Vector3(0, 0, 2)));
            Assert.True(room.Contains(new Vector3(2, 3, 2)));
            Assert.False(room.Contains(new Vector3(-.1f, 1, 2)));
            Assert.False(room.Contains(new Vector3(1, -.1f, 2)));
            Assert.False(room.Contains(new Vector3(1, 3.1f, 2)));
            Assert.False(room.Contains(new Vector3(float.NaN, 1, 2)));
        }
        [Test] public void ConcaveBoundaryRejectsShortcutBetweenTwoInsidePoints()
        {
            var room = Square();
            room.floor = new[] { Vector3.zero, new Vector3(4,0,0), new Vector3(4,0,1), new Vector3(1,0,1), new Vector3(1,0,4), new Vector3(0,0,4) };
            var a = new Vector3(.5f, 1, 3); var b = new Vector3(3,1,.5f);
            Assert.True(room.Contains(a)); Assert.True(room.Contains(b));
            Assert.False(room.ContainsSegment(a,b));
            Assert.False(DrawingGeometry.Valid(room, new[] { a,b }));
        }
        [Test] public void BoxHasTwelveEdgesAndRejectsCeilingPenetration()
        {
            var points = DrawingGeometry.Box(new Vector3(1,0,1), new Vector3(2,0,3), 1.5f);
            Assert.That(points.Length, Is.EqualTo(16));
            Assert.True(DrawingGeometry.Valid(Square(), points));
            var edges = new System.Collections.Generic.HashSet<string>();
            for (int i = 1; i < points.Length; i++)
            {
                string a = points[i-1].ToString(), b = points[i].ToString();
                edges.Add(string.CompareOrdinal(a,b) < 0 ? a+b : b+a);
            }
            Assert.That(edges.Count, Is.EqualTo(12));
            Assert.False(DrawingGeometry.Valid(Square(), DrawingGeometry.Box(new Vector3(1,2,1), new Vector3(2,2,3), 1.5f)));
        }
        [Test] public void RejectsOversizedOrEmptyStrokes()
        {
            Assert.False(DrawingGeometry.Valid(Square(), Array.Empty<Vector3>()));
            Assert.False(DrawingGeometry.Valid(Square(), new Vector3[DrawingGeometry.MaxPoints + 1]));
        }
        [Test] public async Task PersistenceKeepsNewestSaveAndDoesNotRestoreIntoAnotherRoom()
        {
            string directory = Path.Combine(Path.GetTempPath(), "cutonce-room-tests-" + Guid.NewGuid().ToString("N"));
            try
            {
                var store = new RoomDrawingStore(directory); var room = Square();
                var stroke = new RoomDrawing { tool = DrawingTool.Freehand, points = new[] { new Vector3(1,1,1), new Vector3(2,1,1) } };
                var first = store.Save(room, new[] { stroke });
                var second = store.Save(room, Array.Empty<RoomDrawing>());
                await Task.WhenAll(first, second);
                Assert.That((await store.Load(room)).Length, Is.Zero);
                await store.Save(room, new[] { stroke });
                Assert.That((await store.Load(room))[0].points[1], Is.EqualTo(stroke.points[1]));
                room.id = "other-room";
                Assert.That((await store.Load(room)).Length, Is.Zero);
                Assert.That(store.Error, Is.Null);
            }
            finally { if (Directory.Exists(directory)) Directory.Delete(directory, true); }
        }
        [Test] public async Task CorruptFileIsReportedAndPreserved()
        {
            string directory = Path.Combine(Path.GetTempPath(), "cutonce-room-tests-" + Guid.NewGuid().ToString("N"));
            try
            {
                Directory.CreateDirectory(directory);
                string path = Path.Combine(directory, "test-room.json"); File.WriteAllText(path, "bad json");
                var store = new RoomDrawingStore(directory);
                Assert.That(await store.Load(Square()), Is.Empty);
                Assert.That(store.Error, Is.Not.Null);
                Assert.That(File.ReadAllText(path), Is.EqualTo("bad json"));
            }
            finally { if (Directory.Exists(directory)) Directory.Delete(directory, true); }
        }
    }
}
