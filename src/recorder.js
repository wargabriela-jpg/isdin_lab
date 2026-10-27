/*
 * Real-time, local audiovisual export. Requires WebM MediaRecorder + captureStream.
 * new OrbRecorder({ audio, orb, onState(state, detail), onComplete(blob, mime, meta),
 *                   onError(error) })
 * start(): Promise<void>; stop(partial = true); supported/active/busy getters.
 * The caller calls stop(false) from audio.onended. No generated or estimated audio.
 * Canvas frames and the unmodified audio destination share one MediaStream.
 */
(function () {
  'use strict';

  const MIME_TYPES = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];

  class OrbRecorder {
    constructor({ audio, orb, onState, onComplete, onError }) {
      this.audio = audio;
      this.orb = orb;
      this.onState = onState;
      this.onComplete = onComplete;
      this.onError = onError;
      this._state = 'idle';
      this._generation = 0;
      this._recorder = null;
      this._capture = null;
      this._stream = null;
      this._destination = null;
      this._exporting = false;
      this._chunks = [];
      this._partial = false;
      this._reason = '';
      this._errorReported = false;
      this._endedAt = 0;
      this._visibilityHandler = () => {
        if (document.visibilityState === 'hidden' && this.busy) {
          this._reason = 'Exportación parcial: se ocultó la pestaña. Mantén esta ventana visible durante toda la grabación.';
          this.stop(true);
        }
      };
    }

    get supported() {
      return !!(window.MediaRecorder && typeof window.MediaRecorder.isTypeSupported === 'function' &&
        this.orb.canvas && typeof this.orb.canvas.captureStream === 'function' &&
        MIME_TYPES.some(type => window.MediaRecorder.isTypeSupported(type)));
    }

    get active() { return this._state === 'recording'; }
    get busy() { return this._state !== 'idle'; }

    _emitState(state, detail = '') {
      this._state = state;
      if (typeof this.onState === 'function') {
        try { this.onState(state, detail); } catch (error) { console.error(error); }
      }
    }

    _emitError(error) {
      if (this._errorReported) return;
      this._errorReported = true;
      if (typeof this.onError === 'function') {
        try { this.onError(error); } catch (callbackError) { console.error(callbackError); }
      }
    }

    async start() {
      if (this.busy) throw new Error('Ya hay una exportación en curso.');
      this._errorReported = false;
      if (!this.supported) {
        const error = new Error('Este navegador no puede exportar WebM con audio. Abre el proyecto en Chrome o Edge actualizado desde localhost.');
        this._emitError(error);
        throw error;
      }
      if (!this.audio.loaded) {
        const error = new Error('Carga la locución WAV o MP3 antes de exportar.');
        this._emitError(error);
        throw error;
      }
      if (document.visibilityState === 'hidden') {
        const error = new Error('Mantén la pestaña visible para iniciar la exportación.');
        this._emitError(error);
        throw error;
      }

      const generation = ++this._generation;
      this._chunks = [];
      this._partial = false;
      this._reason = '';
      this._endedAt = 0;
      this._emitState('starting', 'Preparando WebM 1920 × 1080 a 60 fps…');
      document.addEventListener('visibilitychange', this._visibilityHandler);

      try {
        // Resume before awaiting a frame, while this call retains the user gesture.
        this.audio.restart();
        await this.audio.context.resume();
        if (generation !== this._generation) return;
        if (this.audio.context.state !== 'running') throw new Error('No se pudo activar el audio. Pulsa Reproducir y vuelve a exportar.');
        this.orb.beginExport();
        this._exporting = true;
        // Let the render loop draw at the export resolution before capture begins.
        // The short timeout also lets cancellation finish if the tab becomes hidden.
        await new Promise(resolve => {
          let done = false;
          let timeout;
          let frame;
          const finish = () => {
            if (done) return;
            done = true;
            clearTimeout(timeout);
            cancelAnimationFrame(frame);
            resolve();
          };
          frame = requestAnimationFrame(finish);
          timeout = setTimeout(finish, 250);
        });
        if (generation !== this._generation) return;
        if (document.visibilityState === 'hidden') throw new Error('Se ocultó la pestaña antes de comenzar. Vuelve a exportar con esta ventana visible.');

        this._capture = this.orb.canvas.captureStream(60);
        const videoTracks = this._capture.getVideoTracks();
        if (!videoTracks.length) throw new Error('El navegador no ha creado una pista de vídeo del canvas.');
        this._destination = this.audio.createRecordingDestination();
        const audioTracks = this._destination.stream.getAudioTracks();
        if (!audioTracks.length) throw new Error('El navegador no ha creado una pista de audio para la exportación.');
        this._stream = new MediaStream([...videoTracks, ...audioTracks]);

        let initializationError;
        for (const mimeType of MIME_TYPES) {
          if (!window.MediaRecorder.isTypeSupported(mimeType)) continue;
          try {
            this._recorder = new window.MediaRecorder(this._stream, {
              mimeType, videoBitsPerSecond: 12000000, audioBitsPerSecond: 192000
            });
            break;
          } catch (error) { initializationError = error; }
        }
        if (!this._recorder) throw initializationError || new Error('No se pudo iniciar el codificador WebM.');

        const recorder = this._recorder;
        recorder.ondataavailable = event => {
          if (generation === this._generation && event.data && event.data.size) this._chunks.push(event.data);
        };
        recorder.onerror = event => {
          if (generation !== this._generation) return;
          const error = event.error || new Error('El navegador interrumpió la codificación WebM.');
          this._reason = 'Exportación parcial: el navegador interrumpió la codificación.';
          this._emitError(error);
          this.stop(true);
        };
        recorder.onstop = () => {
          if (generation !== this._generation) return;
          if (this._state !== 'finalizing') {
            this._endedAt = this.audio.currentTime;
            this._partial = true;
            this._reason = 'Exportación parcial: el navegador detuvo la captura antes de terminar el audio.';
          }
          const mime = recorder.mimeType || 'video/webm';
          const blob = new Blob(this._chunks, { type: mime });
          const meta = {
            partial: this._partial,
            reason: this._reason,
            audioName: this.audio.fileName,
            duration: this.audio.duration,
            recordedUntil: this._endedAt,
            width: 1920, height: 1080, fps: 60
          };
          this._cleanup();
          this._emitState('idle', meta.reason || 'Exportación terminada.');
          if (!blob.size) {
            this._emitError(new Error('El navegador no produjo datos WebM. Vuelve a exportar con Chrome o Edge y mantén la pestaña visible.'));
            return;
          }
          if (typeof this.onComplete === 'function') {
            try { this.onComplete(blob, mime, meta); } catch (error) { console.error(error); }
          }
        };

        recorder.start(1000);
        this._emitState('recording', 'Grabando en tiempo real. Mantén esta pestaña visible.');
        await this.audio.play();
        if (generation !== this._generation || this._state !== 'recording') return;
        if (!this.audio.playing) throw new Error('El audio no pudo comenzar. Vuelve a iniciar la exportación.');
      } catch (error) {
        if (generation !== this._generation) return;
        this._emitError(error);
        // If capture has begun, onstop must retain the encoded chunks before cleanup.
        if (this._recorder && this._recorder.state !== 'inactive') {
          this._reason = 'Exportación parcial: no se pudo completar la captura de audio y vídeo.';
          this.stop(true);
        } else {
          this._generation++;
          this._cleanup();
          this._emitState('idle', error.message);
        }
        throw error;
      }
    }

    stop(partial = true) {
      if (!this.busy || this._state === 'finalizing') return;
      this._partial = this._partial || !!partial;
      if (partial && !this._reason) this._reason = 'Exportación parcial detenida por el usuario.';
      this._endedAt = this.audio.currentTime;
      this.audio.pause();
      this._emitState('finalizing', this._reason || 'Finalizando el archivo WebM…');
      if (this._recorder) {
        if (this._recorder.state !== 'inactive') this._recorder.stop();
        // An inactive recorder can have an onstop event already queued.
      } else {
        // Cancelling while context.resume()/the first frame is pending creates no file.
        this._generation++;
        this._cleanup();
        this._emitState('idle', this._reason || 'Exportación cancelada.');
      }
    }

    _cleanup() {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this.audio.pause();
      if (this._capture) this._capture.getTracks().forEach(track => track.stop());
      if (this._destination) this.audio.disconnectRecordingDestination(this._destination);
      if (this._stream) this._stream.getTracks().forEach(track => track.stop());
      if (this._exporting) this.orb.endExport();
      this._recorder = null;
      this._capture = null;
      this._stream = null;
      this._destination = null;
      this._chunks = [];
      this._exporting = false;
    }
  }

  window.OrbRecorder = OrbRecorder;
}());
