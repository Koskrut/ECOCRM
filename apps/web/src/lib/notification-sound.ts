/** Short in-app chime for new CRM notifications (Web Audio, no asset file). */

let audioCtx: AudioContext | null = null;
let unlocked = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  return audioCtx;
}

/** Call once after a user gesture so later chimes are allowed while the tab is open. */
export function unlockNotificationSound(): void {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume().then(() => {
      unlocked = true;
    });
  } else {
    unlocked = true;
  }
}

export function playNotificationSound(): void {
  const ctx = getCtx();
  if (!ctx) return;

  const play = () => {
    unlocked = true;
    const now = ctx.currentTime;
    // Two soft tones — short, non-intrusive alert
    const notes: Array<{ freq: number; start: number; dur: number }> = [
      { freq: 880, start: 0, dur: 0.12 },
      { freq: 1174.66, start: 0.1, dur: 0.18 },
    ];
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = n.freq;
      gain.gain.setValueAtTime(0.0001, now + n.start);
      gain.gain.exponentialRampToValueAtTime(0.08, now + n.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.start + n.dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + n.start);
      osc.stop(now + n.start + n.dur + 0.02);
    }
  };

  if (ctx.state === "suspended") {
    void ctx.resume().then(play).catch(() => {
      /* autoplay policy — ignore until user interacts */
    });
    return;
  }
  try {
    play();
  } catch {
    /* ignore */
  }
}

export function ensureNotificationSoundListeners(): () => void {
  if (typeof window === "undefined" || unlocked) return () => undefined;
  const onInteract = () => unlockNotificationSound();
  window.addEventListener("pointerdown", onInteract, { once: true, passive: true });
  window.addEventListener("keydown", onInteract, { once: true });
  return () => {
    window.removeEventListener("pointerdown", onInteract);
    window.removeEventListener("keydown", onInteract);
  };
}
