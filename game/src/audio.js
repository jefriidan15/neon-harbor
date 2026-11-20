// Procedural sound: every effect is synthesized with WebAudio oscillators and
// noise, so the game ships no audio files at all. The context is created on the
// first user gesture (browsers block audio before that) and everything after
// that is a short, fire-and-forget envelope.

export function createAudio() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let musicTimer = 0;
  let musicStep = 0;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return true;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.35;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure()) return;
    const t = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    gain.gain.setValueAtTime(vol || 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, filterFreq) {
    if (!ensure()) return;
    const t = context.currentTime;
    const length = Math.max(1, Math.floor(context.sampleRate * dur));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq || 1200;
    const gain = context.createGain();
    gain.gain.setValueAtTime(vol || 0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t);
  }

  /** Start the engine hum; call setEngine(speed01) every frame while driving. */
  function startEngine() {
    if (!ensure() || engineOsc) return;
    engineOsc = context.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineGain = context.createGain();
    engineGain.gain.value = 0;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    engineOsc.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
  }

  function setEngine(speed01, on) {
    if (!engineOsc) return;
    const t = context.currentTime;
    engineOsc.frequency.setTargetAtTime(52 + speed01 * 130, t, 0.08);
    engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.06 : 0, t, 0.1);
  }

  function stopEngine() {
    if (!engineOsc) return;
    try {
      engineOsc.stop();
    } catch {
      // Already stopped.
    }
    engineOsc = null;
    engineGain = null;
  }

  /** A two-tone police siren that wails while the player is wanted. */
  function setSiren(on) {
    if (on && !sirenOsc && ensure()) {
      sirenOsc = context.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 660;
      sirenGain = context.createGain();
      sirenGain.gain.value = 0.045;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      sirenTimer = 0;
    } else if (!on && sirenOsc) {
      try {
        sirenOsc.stop();
      } catch {
        // Already stopped.
      }
      sirenOsc = null;
      sirenGain = null;
    }
  }

  function updateSiren(dt) {
    if (!sirenOsc) return;
    sirenTimer += dt;
    const phase = (sirenTimer % 0.9) < 0.45 ? 660 : 880;
    sirenOsc.frequency.setTargetAtTime(phase, context.currentTime, 0.05);
  }

  /** A lazy sunset bass line that plays under the whole game, one note per beat. */
  const BASS_LINE = [55, 0, 55, 65.41, 0, 49, 0, 58.27, 55, 0, 55, 65.41, 73.42, 0, 65.41, 49];
  function updateMusic(dt, playing) {
    if (!playing) return;
    musicTimer += dt;
    if (musicTimer < 0.42) return;
    musicTimer = 0;
    const note = BASS_LINE[musicStep % BASS_LINE.length];
    musicStep += 1;
    if (note > 0) tone(note, 0.4, 'triangle', 0.09);
    if (musicStep % 4 === 1) tone(220, 0.12, 'sine', 0.03);
  }

  return {
    unlock: ensure,
    shot() {
      noise(0.14, 0.4, 2400);
      tone(180, 0.09, 'square', 0.16, 60);
    },
    enemyShot() {
      noise(0.12, 0.22, 1800);
    },
    pickup() {
      tone(660, 0.09, 'sine', 0.18);
      tone(990, 0.14, 'sine', 0.16);
    },
    missionDone() {
      tone(523, 0.14, 'triangle', 0.2);
      setTimeout(() => tone(659, 0.14, 'triangle', 0.2), 130);
      setTimeout(() => tone(784, 0.26, 'triangle', 0.22), 260);
    },
    crash() {
      noise(0.3, 0.4, 500);
      tone(90, 0.25, 'sawtooth', 0.2, 40);
    },
    busted() {
      tone(392, 0.3, 'sawtooth', 0.18, 196);
      setTimeout(() => tone(311, 0.5, 'sawtooth', 0.18, 155), 300);
    },
    click() {
      tone(880, 0.05, 'sine', 0.12);
    },
    reload() {
      tone(300, 0.05, 'square', 0.1);
      setTimeout(() => tone(420, 0.05, 'square', 0.1), 120);
    },
    startEngine,
    setEngine,
    stopEngine,
    setSiren,
    updateSiren,
    updateMusic,
  };
}
