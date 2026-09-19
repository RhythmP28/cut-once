using System;
using System.IO;
using System.Threading.Tasks;
using UnityEngine;

namespace CutOnce.Room
{
    /// <summary>Room-local points restored only against the same room and validated against its current boundary.</summary>
    public sealed class RoomDrawingStore
    {
        readonly string _directory;
        Task _pending = Task.CompletedTask;
        public string Error { get; private set; }
        public RoomDrawingStore(string directory) { _directory = directory; }
        string PathFor(string id)
        {
            // IDs are SDK UUIDs or a fixture ID; reject path traversal, even in externally supplied documents.
            foreach (char c in id) if (!char.IsLetterOrDigit(c) && c != '-' && c != '_') throw new ArgumentException("Invalid room ID");
            return Path.Combine(_directory, id + ".json");
        }
        public Task Save(RoomGeometry room, RoomDrawing[] drawings)
        {
            string json = JsonUtility.ToJson(new RoomDocument { roomId = room.id, geometry = room, drawings = drawings }, true);
            string path = PathFor(room.id);
            // Serialize saves so a slower old write cannot overwrite a newer edit. File I/O stays off the main thread.
            _pending = WriteAfter(_pending, path, json);
            return _pending;
        }
        async Task WriteAfter(Task previous, string path, string json)
        {
            await previous;
            try
            {
                await Task.Run(() =>
                {
                    Directory.CreateDirectory(_directory);
                    string temporary = path + ".tmp";
                    File.WriteAllText(temporary, json);
                    if (File.Exists(path)) File.Replace(temporary, path, null);
                    else File.Move(temporary, path);
                });
                Error = null;
            }
            catch (Exception e) { Error = "Could not save drawings: " + e.Message; }
        }
        public async Task<RoomDrawing[]> Load(RoomGeometry room)
        {
            await _pending;
            try
            {
                string path = PathFor(room.id);
                string json = await Task.Run(() => File.Exists(path) && new FileInfo(path).Length <= 4 * 1024 * 1024 ? File.ReadAllText(path) : null);
                if (json == null) return Array.Empty<RoomDrawing>();
                var doc = JsonUtility.FromJson<RoomDocument>(json);
                if (doc == null || doc.version != 1 || doc.roomId != room.id || doc.drawings == null || doc.drawings.Length > DrawingGeometry.MaxDrawings)
                    throw new InvalidDataException("Unsupported room document");
                foreach (var drawing in doc.drawings)
                    if (drawing == null || !Enum.IsDefined(typeof(DrawingTool), drawing.tool) || !DrawingGeometry.Valid(room, drawing.points))
                        throw new InvalidDataException("Drawings no longer fit this room; the saved file was preserved");
                Error = null;
                return doc.drawings;
            }
            catch (Exception e) { Error = "Could not restore drawings: " + e.Message; return Array.Empty<RoomDrawing>(); }
        }
    }
}
