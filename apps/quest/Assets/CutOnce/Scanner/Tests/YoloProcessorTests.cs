using System.Collections.Generic;
using CutOnce.Scanner;
using NUnit.Framework;
using Unity.Collections;
using UnityEngine;

namespace CutOnce.Scanner.Tests
{
    /// <summary>
    /// The part of detection that can be wrong without anyone noticing: which boxes survive, and where they end up in
    /// the camera's view. A flipped y or a box normalised by the wrong size still "detects a chair"; it just labels
    /// the ceiling.
    /// </summary>
    public class YoloProcessorTests
    {
        static readonly Vector2Int Model = new Vector2Int(640, 640), Camera = new Vector2Int(1280, 960);
        const string Labels = "person\nbicycle\nchair\nbottle\n";

        /// <summary>Runs the processor over rows of (left, top, right, bottom, classId, score) in model pixels.</summary>
        static List<DetectedObject> Run(YoloProcessor yolo, out int candidates, params float[][] rows)
        {
            var boxes = new NativeArray<float>(rows.Length * 4, Allocator.Temp);
            var ids = new NativeArray<int>(rows.Length, Allocator.Temp);
            var scores = new NativeArray<float>(rows.Length, Allocator.Temp);
            for (int i = 0; i < rows.Length; i++)
            {
                for (int k = 0; k < 4; k++) boxes[i * 4 + k] = rows[i][k];
                ids[i] = (int)rows[i][4];
                scores[i] = rows[i][5];
            }
            var found = new List<DetectedObject>();
            candidates = yolo.Process(boxes.AsReadOnly(), ids.AsReadOnly(), scores.AsReadOnly(), Model, Camera, found);
            boxes.Dispose(); ids.Dispose(); scores.Dispose();
            return found;
        }

        [Test]
        public void Labels_AreOnePerLine_IgnoringTheTrailingNewlineAndWindowsLineEndings()
        {
            var yolo = new YoloProcessor("person\r\nbicycle\r\nchair\r\n");
            Assert.AreEqual(3, yolo.LabelCount);
            Assert.AreEqual("chair", yolo.Label(2), "a CRLF checkout must not name things \"chair\\r\"");
            Assert.AreEqual("object", yolo.Label(80), "an id past the label file is still a detection, just an unnamed one");
        }

        [Test]
        public void WeakBoxes_AreDropped()
        {
            var yolo = new YoloProcessor(Labels) { ScoreThreshold = 0.3f };
            var found = Run(yolo, out int candidates,
                new[] { 10f, 10f, 110f, 110f, 2f, 0.91f },
                new[] { 300f, 300f, 400f, 400f, 3f, 0.29f });
            Assert.AreEqual(1, candidates);
            Assert.AreEqual(1, found.Count);
            Assert.AreEqual("chair", found[0].ClassName);
            Assert.AreEqual(2, found[0].ClassId);
            Assert.AreEqual(0.91f, found[0].Confidence, 1e-5f);
        }

        [Test]
        public void OverlappingBoxes_KeepOnlyTheMostConfident_WhateverTheirClass()
        {
            var yolo = new YoloProcessor(Labels) { ScoreThreshold = 0.3f, IouThreshold = 0.4f };
            var found = Run(yolo, out _,
                new[] { 100f, 100f, 200f, 200f, 3f, 0.60f },      // "bottle", weaker
                new[] { 105f, 102f, 205f, 203f, 2f, 0.85f },      // "chair" over the same pixels, stronger
                new[] { 400f, 400f, 500f, 500f, 0f, 0.50f });     // somewhere else entirely
            Assert.AreEqual(2, found.Count, "one label per thing, not one per class the model half-believes");
            Assert.AreEqual("chair", found[0].ClassName, "most confident first");
            Assert.AreEqual("person", found[1].ClassName);
        }

        [Test]
        public void ABoxAtTheTopOfTheImage_IsAtTheTopOfTheViewport()
        {
            // Model y runs DOWN from the top; viewport y runs UP from the bottom. This is the flip.
            var found = Run(new YoloProcessor(Labels), out _, new[] { 0f, 0f, 64f, 64f, 0f, 0.9f });
            Rect box = found[0].Box;
            Assert.AreEqual(0f, box.xMin, 1e-5f);
            Assert.AreEqual(0.1f, box.xMax, 1e-5f);
            Assert.AreEqual(0.9f, box.yMin, 1e-5f, "top of the image is viewport y = 1");
            Assert.AreEqual(1f, box.yMax, 1e-5f);
        }

        [Test]
        public void CenterPixel_IsInCameraPixels_NotModelPixels()
        {
            // Centre (320, 160) of a 640x640 input is half way across and a quarter of the way down a 1280x960 image.
            var found = Run(new YoloProcessor(Labels), out _, new[] { 270f, 110f, 370f, 210f, 3f, 0.8f });
            Assert.AreEqual(new Vector2Int(640, 240), found[0].CenterPixel);
            Assert.AreEqual(0.5f, found[0].Center.x, 1e-5f);
            Assert.AreEqual(0.75f, found[0].Center.y, 1e-5f, "a quarter of the way DOWN is three quarters of the way UP");
        }

        [Test]
        public void ABoxWithNoArea_IsNotADetection()
        {
            var found = Run(new YoloProcessor(Labels), out int candidates, new[] { 50f, 50f, 50f, 50f, 0f, 0.99f });
            Assert.AreEqual(1, candidates);
            Assert.AreEqual(0, found.Count);
        }

        [Test]
        public void Results_AreReplacedEachCall_NotAppended()
        {
            var yolo = new YoloProcessor(Labels);
            Run(yolo, out _, new[] { 10f, 10f, 110f, 110f, 0f, 0.9f }, new[] { 300f, 300f, 400f, 400f, 1f, 0.9f });
            var second = Run(yolo, out _, new[] { 10f, 10f, 110f, 110f, 0f, 0.9f });
            Assert.AreEqual(1, second.Count);
        }

        [Test]
        public void IoU_IsOneForIdentical_ZeroForApart_AndAThirdForHalfOverlap()
        {
            var a = new Vector4(0, 0, 100, 100);
            Assert.AreEqual(1f, YoloProcessor.CalculateIoU(a, a), 1e-6f);
            Assert.AreEqual(0f, YoloProcessor.CalculateIoU(a, new Vector4(200, 200, 300, 300)), 1e-6f);
            Assert.AreEqual(1f / 3f, YoloProcessor.CalculateIoU(a, new Vector4(50, 0, 150, 100)), 1e-6f);
            Assert.AreEqual(0f, YoloProcessor.CalculateIoU(new Vector4(5, 5, 5, 5), new Vector4(5, 5, 5, 5)), 1e-6f, "no area, no overlap, no divide by zero");
        }
    }
}
