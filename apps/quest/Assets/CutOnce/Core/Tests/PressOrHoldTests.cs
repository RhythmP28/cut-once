using NUnit.Framework;

namespace CutOnce.Core.Tests
{
    /// <summary>One button, two meanings: a press (scan) and a hold (leave build mode). A judge's thumb resting on X must never do both.</summary>
    public class PressOrHoldTests
    {
        static ButtonGesture Frame(PressOrHold b, bool down, bool held, bool up, double seconds = 0.014) => b.Update(down, held, up, seconds);

        [Test]
        public void AShortPressIsReportedOnceWhenTheButtonComesUp()
        {
            var b = new PressOrHold(1.0);
            Assert.That(Frame(b, down: true, held: true, up: false), Is.EqualTo(ButtonGesture.None), "nothing happens on the way down: it may become a hold");
            for (int i = 0; i < 20; i++) Assert.That(Frame(b, false, true, false), Is.EqualTo(ButtonGesture.None));
            Assert.That(Frame(b, false, false, true), Is.EqualTo(ButtonGesture.Press));
            Assert.That(Frame(b, false, false, false), Is.EqualTo(ButtonGesture.None));
        }

        [Test]
        public void AHoldIsReportedOnceAsSoonAsItIsLongEnoughAndItsReleaseIsNotAPress()
        {
            var b = new PressOrHold(1.0);
            Frame(b, true, true, false);
            var seen = new System.Collections.Generic.List<ButtonGesture>();
            for (int i = 0; i < 100; i++) seen.Add(Frame(b, false, true, false, 0.02));      // two seconds held
            Assert.That(seen.FindAll(g => g == ButtonGesture.Hold).Count, Is.EqualTo(1));
            Assert.That(seen.IndexOf(ButtonGesture.Hold), Is.EqualTo(49), "at one second, not on release");
            Assert.That(Frame(b, false, false, true), Is.EqualTo(ButtonGesture.None), "letting go after a hold is not a press");

            Frame(b, true, true, false);
            Assert.That(Frame(b, false, false, true), Is.EqualTo(ButtonGesture.Press), "and the button works again afterwards");
        }

        [Test]
        public void AReleaseWhoseStartWasNeverSeenMeansNothing()
        {
            var b = new PressOrHold(1.0);
            Assert.That(Frame(b, false, true, false), Is.EqualTo(ButtonGesture.None), "held since before the app started");
            Assert.That(Frame(b, false, false, true), Is.EqualTo(ButtonGesture.None));
        }

        [Test]
        public void DownAndUpInOneFrameIsAPress()
        {
            Assert.That(Frame(new PressOrHold(1.0), true, false, true), Is.EqualTo(ButtonGesture.Press));
        }
    }
}
