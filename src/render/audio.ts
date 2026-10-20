/**
 * The original's sounds.
 *
 * Every sound is the one the original game plays, taken from its SWF. The
 * names follow the original's, so `click1` is the sound it plays for the
 * first kind of click.
 */

/** Sound name to file. The names are the original's own. */
const FILES: Record<string, string> = {
  click1: "ClickSound1.mp3",
  click2: "ClickSound2.mp3",
  click3: "ClickSound3.mp3",
  build: "BuildSound.mp3",
  cengkling: "Cengkling.mp3",
  cling: "Cling.mp3",
  coin1: "Coin1.mp3",
  bonus1: "BonusCoin1.mp3",
  deskbell: "Deskbell.mp3",
  destroy1: "Destroy1.mp3",
  destroy2: "Destroy2.mp3",
  fired: "Fired.mp3",
  glick: "Glick.mp3",
  klakson: "Klakson.mp3",
  notif: "NotifSound.mp3",
  pause: "PauseSound.mp3",
  pop1: "Pop1.mp3",
  puh: "Puh.mp3",
  seat: "Seat.mp3",
  tick: "Ticking.mp3",
  upgrade: "Upgrade.mp3",
  blub: "Blub.mp3",
  blub2: "Blub2.mp3",
  adding: "Adding.mp3",
};

const MUSIC = ["BGMusic1.mp3", "BGMusic2.mp3", "BGMusic3.mp3", "BGMusic4.mp3", "BGMusic5.mp3"];

class SoundBank {
  private base = "sound/";
  private buffers = new Map<string, HTMLAudioElement>();
  private music: HTMLAudioElement | null = null;
  private musicTrack = 0;
  enabled = true;
  musicEnabled = true;

  /** Play a sound by the original's name. */
  play(name: string): void {
    if (!this.enabled) return;
    const file = FILES[name];
    if (!file) return;
    let el = this.buffers.get(file);
    if (!el) {
      const made = new Audio(`${this.base}${file}`);
      made.preload = "auto";
      made.volume = 0.5;
      this.buffers.set(file, made);
      el = made;
    }
    el.currentTime = 0;
    void el.play().catch(() => {
      // The browser may refuse to play before the user has interacted.
    });
  }

  /** Start the background music, the way the original does. */
  startMusic(): void {
    if (!this.musicEnabled) return;
    this.stopMusic();
    const el = new Audio(`${this.base}${MUSIC[this.musicTrack]}`);
    el.loop = true;
    el.volume = 0.35;
    el.addEventListener("ended", () => this.nextMusic());
    this.music = el;
    void el.play().catch(() => {
      // The browser may refuse to play before the user has interacted.
    });
  }

  /** Move on to the next of the original's five tracks. */
  nextMusic(): void {
    this.musicTrack = (this.musicTrack + 1) % MUSIC.length;
    if (this.musicEnabled) this.startMusic();
  }

  stopMusic(): void {
    if (this.music) {
      this.music.pause();
      this.music = null;
    }
  }

  setMusicEnabled(on: boolean): void {
    this.musicEnabled = on;
    if (on) this.startMusic();
    else this.stopMusic();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.stopMusic();
  }
}

export const audio = new SoundBank();
