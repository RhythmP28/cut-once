namespace CutOnce.Core
{
    public enum ButtonGesture { None, Press, Hold }

    /// <summary>
    /// One button with two meanings. A press is reported when the button comes up, because only then is it known not
    /// to be a hold; a hold is reported once, the moment it has lasted long enough, and its release means nothing.
    /// Feed it the button's three readings every frame. No allocation, no Unity.
    /// </summary>
    public sealed class PressOrHold
    {
        readonly double _holdSeconds;
        double _heldFor;
        bool _tracking, _fired;

        public PressOrHold(double holdSeconds) { _holdSeconds = holdSeconds; }

        public ButtonGesture Update(bool down, bool held, bool up, double deltaSeconds)
        {
            if (down) { _tracking = true; _fired = false; _heldFor = 0; }
            else if (_tracking && held && !_fired)
            {
                _heldFor += deltaSeconds;
                if (_heldFor >= _holdSeconds - 1e-9) { _fired = true; return ButtonGesture.Hold; }
            }
            if (!up || !_tracking) return ButtonGesture.None;       // a release whose press was never seen (held since start-up) means nothing
            _tracking = false;
            return _fired ? ButtonGesture.None : ButtonGesture.Press;
        }
    }
}
