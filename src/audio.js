/*
 * Local audio playback and analysis. No uploads, generated audio or estimated timings.
 * API: load(File), play(), pause(), seek(seconds), restart(), analyze(dt, sensitivity).
 * Read-only state: loaded, duration, currentTime, playing; fileName and onended callback.
 * Playback and seeking use AudioContext.currentTime, including during recording.
 * Sensitivity changes analysis only; the monitor and exported audio retain unity gain.
 */
(function () {
  'use strict';

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const emptyFeatures = () => ({ rms: 0, envelope: 0, bass: 0, mid: 0, treble: 0, attack: 0 });

  class AudioEngine {
    constructor() {
      this.context = null;
      this.analyser = null;
      this.output = null;
      this.buffer = null;
      this.fileName = '';
      this.onended = null;
      this._source = null;
      this._playing = false;
      this._offset = 0;
      this._startedAt = 0;
      this._loadVersion = 0;
      this._transportVersion = 0;
      this._features = emptyFeatures();
      this._previousLevel = 0;
      this._attackHold = 0;
      this._recordingDestinations = new Set();
    }

    _ensureContext() {
      if (this.context) return;
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) throw new Error('Este navegador no dispone de Web Audio API.');
      this.context = new Context({ latencyHint: 'interactive' });
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0;
      this.analyser.minDecibels = -100;
      this.analyser.maxDecibels = 0;
      this.output = this.context.createGain();
      this.output.gain.value = 1;
      this.analyser.connect(this.output);
      this.output.connect(this.context.destination);
      this._timeData = new Float32Array(this.analyser.fftSize);
      this._frequencyData = new Float32Array(this.analyser.frequencyBinCount);
      const binHz = this.context.sampleRate / this.analyser.fftSize;
      this._bands = [[60, 250], [250, 3000], [3000, 12000]].map(([low, high]) => [
        Math.max(1, Math.ceil(low / binHz)),
        Math.min(this._frequencyData.length - 1, Math.floor(high / binHz))
      ]);
    }

    get loaded() { return !!this.buffer; }
    get duration() { return this.buffer ? this.buffer.duration : 0; }
    get playing() { return this._playing; }
    get currentTime() {
      return clamp(this._playing
        ? this._offset + (this.context.currentTime - this._startedAt)
        : this._offset, 0, this.duration);
    }

    async load(file) {
      if (!file || typeof file.arrayBuffer !== 'function') throw new Error('Selecciona un archivo WAV o MP3.');
      if (!/\.(wav|mp3)$/i.test(file.name || '')) throw new Error('Formato no admitido. Carga un archivo .wav o .mp3.');
      const version = ++this._loadVersion;
      this._ensureContext();
      // Decode first: an invalid replacement must not destroy the previous audio.
      const data = await file.arrayBuffer();
      let decoded;
      try {
        decoded = await this.context.decodeAudioData(data);
      } catch (_) {
        throw new Error('No se pudo decodificar el audio. Comprueba que sea un WAV o MP3 válido.');
      }
      if (version !== this._loadVersion) throw new DOMException('Carga sustituida por otro archivo.', 'AbortError');
      if (!Number.isFinite(decoded.duration) || decoded.duration <= 0) throw new Error('El archivo no contiene audio reproducible.');
      this.pause();
      this.buffer = decoded;
      this.fileName = file.name;
      this._offset = 0;
      this._resetAnalysis();
      return { duration: this.duration, name: this.fileName };
    }

    _startSource() {
      this._stopSource();
      const source = this.context.createBufferSource();
      source.buffer = this.buffer;
      source.connect(this.analyser);
      this._source = source;
      this._startedAt = this.context.currentTime;
      this._playing = true;
      source.onended = () => {
        if (this._source !== source) return;
        source.disconnect();
        this._source = null;
        this._playing = false;
        this._offset = this.duration;
        if (typeof this.onended === 'function') this.onended();
      };
      try {
        source.start(0, this._offset);
      } catch (error) {
        source.onended = null;
        source.disconnect();
        this._source = null;
        this._playing = false;
        throw error;
      }
    }

    _stopSource() {
      if (!this._source) return;
      const source = this._source;
      this._source = null;
      source.onended = null;
      try { source.stop(); } catch (_) { /* Already ended. */ }
      source.disconnect();
    }

    async play() {
      if (!this.loaded) throw new Error('Carga primero la locución WAV o MP3.');
      if (this._playing) return;
      const version = ++this._transportVersion;
      await this.context.resume();
      if (version !== this._transportVersion) return;
      if (this.context.state !== 'running') throw new Error('El navegador no ha permitido iniciar el audio. Pulsa Reproducir de nuevo.');
      // A second click while resume() was pending must not restart playback.
      if (this._playing) return;
      if (this._offset >= this.duration) this._offset = 0;
      this._startSource();
    }

    pause() {
      this._transportVersion++;
      if (!this._playing) return;
      this._offset = this.currentTime;
      this._playing = false;
      this._stopSource();
    }

    seek(seconds) {
      if (!this.loaded) return;
      this._transportVersion++;
      const wasPlaying = this._playing;
      this._stopSource();
      this._offset = clamp(Number(seconds) || 0, 0, this.duration);
      this._playing = false;
      this._previousLevel = 0;
      this._attackHold = 0;
      if (wasPlaying && this._offset < this.duration) this._startSource();
    }

    restart() {
      this.pause();
      this._offset = 0;
      this._previousLevel = 0;
      this._attackHold = 0;
    }

    _resetAnalysis() {
      this._features = emptyFeatures();
      this._previousLevel = 0;
      this._attackHold = 0;
    }

    analyze(dt, sensitivity = 1) {
      dt = clamp(Number(dt) || 1 / 60, 0.001, 0.1);
      sensitivity = clamp(Number(sensitivity) || 0, 0, 6);
      let rms = 0;
      const bandTargets = [0, 0, 0];
      if (this._playing && this.context.state === 'running') {
        this.analyser.getFloatTimeDomainData(this._timeData);
        let sum = 0;
        for (let i = 0; i < this._timeData.length; i++) sum += this._timeData[i] * this._timeData[i];
        rms = Math.sqrt(sum / this._timeData.length);
        // A gentle noise gate makes actual pauses settle into the idle sculpture.
        if (rms > 0.0015) {
          this.analyser.getFloatFrequencyData(this._frequencyData);
          for (let band = 0; band < 3; band++) {
            let energy = 0;
            const [start, end] = this._bands[band];
            for (let i = start; i <= end; i++) {
              const magnitude = Math.pow(10, this._frequencyData[i] / 20);
              energy += magnitude * magnitude;
            }
            bandTargets[band] = 1 - Math.exp(-Math.sqrt(energy) * sensitivity * (band === 2 ? 6 : 3.5));
          }
        }
      }
      const level = rms > 0.0015 ? 1 - Math.exp(-rms * sensitivity * 4) : 0;
      const smooth = (previous, target, attack, release) =>
        previous + (target - previous) * (1 - Math.exp(-dt / (target > previous ? attack : release)));
      const f = this._features;
      // rms is the actual 0..1 RMS; envelope and bands are sensitivity-mapped features.
      f.rms = rms;
      f.envelope = smooth(f.envelope, level, 0.035, 0.32);
      f.bass = smooth(f.bass, bandTargets[0], 0.065, 0.4);
      f.mid = smooth(f.mid, bandTargets[1], 0.045, 0.3);
      f.treble = smooth(f.treble, bandTargets[2], 0.04, 0.25);
      const rise = Math.max(0, level - this._previousLevel);
      this._attackHold = Math.max(0, this._attackHold - dt);
      let transient = 0;
      if (rise > 0.025 && this._attackHold <= 0) {
        transient = clamp(rise * 5, 0, 1);
        this._attackHold = 0.09;
      }
      f.attack = smooth(f.attack, transient, 0.018, 0.22);
      this._previousLevel = level;
      return f;
    }

    createRecordingDestination() {
      this._ensureContext();
      const destination = this.context.createMediaStreamDestination();
      this.output.connect(destination);
      this._recordingDestinations.add(destination);
      return destination;
    }

    disconnectRecordingDestination(destination) {
      if (!this._recordingDestinations.has(destination)) return;
      this.output.disconnect(destination);
      destination.stream.getTracks().forEach(track => track.stop());
      this._recordingDestinations.delete(destination);
    }
  }

  window.AudioEngine = AudioEngine;
}());
