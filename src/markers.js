/* Narrative cues are manual complements to the live audio analysis.
 * All times start unassigned. No synthetic voice timing is inferred here.
 */
(function () {
  'use strict';

  const SCRIPT = `Hola. Bienvenidos a ISDIN LAB.

Iniciando calibración de entorno.

Ubicación: Santiago de Chile.

Análisis de la sala: 50 perfiles biológicos activos.

Nivel de daño solar acumulado: detectado.

Protocolos de reversión: activados.

Bienvenidos a una nueva era. Todo lo que conocían sobre fotoprotección acaba de evolucionar.

La máxima protección solar SPF 50+ con textura ultraligera y ciencia de vanguardia, diseñada para devolverle la vitalidad a tus células, cuidar tu piel y resetear el daño solar acumulado.

El tiempo no se detiene, pero el daño solar… hoy puede reprogramarse.

Sincronizando sistemas para visualización oficial en:

Cinco.

Cuatro.

Tres.

Dos.

Uno.`;

  const EVENTS = Object.freeze([
    { id: 'welcome', label: 'Bienvenida', length: 8, rise: 0.8 },
    { id: 'calibration', label: 'Calibración de entorno', length: 6, rise: 0.6 },
    { id: 'biology', label: 'Análisis biológico', length: 6, rise: 0.7 },
    { id: 'damage', label: 'Daño solar detectado', length: 1.8, rise: 0.22 },
    { id: 'protocols', label: 'Protocolos activados', length: 4.5, rise: 0.55 },
    { id: 'era', label: 'Nueva era', length: 8, rise: 0.8 },
    { id: 'reprogram', label: 'Reprogramación del daño', length: 6, rise: 0.65 },
    { id: 'five', label: 'Cinco', length: 0.8, rise: 0.14 },
    { id: 'four', label: 'Cuatro', length: 0.8, rise: 0.14 },
    { id: 'three', label: 'Tres', length: 0.8, rise: 0.14 },
    { id: 'two', label: 'Dos', length: 0.8, rise: 0.14 },
    { id: 'one', label: 'Uno', length: 0.8, rise: 0.14 }
  ].map(Object.freeze));

  const smooth = value => {
    const x = Math.min(1, Math.max(0, value));
    return x * x * (3 - 2 * x);
  };

  function envelope(age, event) {
    if (age <= 0 || age >= event.length) return 0;
    if (age < event.rise) return smooth(age / event.rise);
    return 1 - smooth((age - event.rise) / (event.length - event.rise));
  }

  class NarrativeMarkers {
    static SCRIPT = SCRIPT;
    static EVENTS = EVENTS;

    constructor(container, options = {}) {
      if (!(container instanceof Element)) throw new TypeError('Falta el contenedor de marcadores.');
      this.container = container;
      this.getTime = options.getTime || (() => 0);
      this.getDuration = options.getDuration || (() => 0);
      this.onChange = options.onChange || (() => {});
      this.duration = Number(this.getDuration()) || 0;
      this.times = new Map(EVENTS.map(event => [event.id, null]));
      this.rows = new Map();
      this.build();
    }

    build() {
      this.container.replaceChildren();
      EVENTS.forEach((event, index) => {
        const row = document.createElement('div');
        row.className = 'marker-row';
        row.dataset.marker = event.id;

        const label = document.createElement('label');
        label.htmlFor = `marker-${event.id}`;
        label.className = 'marker-label';
        const counter = document.createElement('span');
        counter.className = 'marker-index';
        counter.textContent = String(index + 1).padStart(2, '0');
        const name = document.createElement('span');
        name.textContent = event.label;
        label.append(counter, name);

        const input = document.createElement('input');
        input.type = 'number';
        input.id = `marker-${event.id}`;
        input.min = '0';
        input.step = '0.01';
        input.placeholder = '—';
        input.className = 'marker-time';
        input.setAttribute('aria-label', `${event.label}: tiempo en segundos`);
        input.setAttribute('aria-describedby', `marker-status-${event.id}`);
        input.addEventListener('input', () => {
          const value = input.value.trim();
          const time = value === '' ? null : Number(value);
          this.times.set(event.id, time !== null && Number.isFinite(time) && time >= 0 ? time : null);
          this.validateRow(event.id);
          this.onChange(this.exportJSON());
        });

        const capture = document.createElement('button');
        capture.type = 'button';
        capture.className = 'marker-capture';
        capture.textContent = 'Ahora';
        capture.title = `Asignar el tiempo actual a ${event.label}`;
        capture.setAttribute('aria-label', `Marcar ${event.label} en el tiempo actual`);
        capture.addEventListener('click', () => {
          if (!(this.duration > 0)) return;
          const time = Math.min(this.duration, Math.max(0, Number(this.getTime()) || 0));
          this.times.set(event.id, Math.round(time * 100) / 100);
          input.value = this.times.get(event.id).toFixed(2);
          this.validateRow(event.id);
          this.onChange(this.exportJSON());
        });

        const status = document.createElement('span');
        status.className = 'marker-status';
        status.id = `marker-status-${event.id}`;
        row.append(label, input, capture, status);
        this.rows.set(event.id, { row, input, capture, status });
        this.container.append(row);
      });
      this.setDuration(this.duration);
    }

    validateRow(id) {
      const { row, input, status } = this.rows.get(id);
      const time = this.times.get(id);
      const invalidNumber = input.value !== '' && (!input.validity.valid || !Number.isFinite(Number(input.value)) || Number(input.value) < 0);
      const outside = time !== null && this.duration > 0 && time > this.duration;
      const invalid = invalidNumber || outside;
      row.classList.toggle('invalid', invalid);
      row.classList.toggle('assigned', time !== null && !invalid);
      input.setAttribute('aria-invalid', String(invalid));
      status.textContent = invalidNumber ? 'Tiempo no válido' : outside ? 'Fuera del audio' : time === null ? 'Sin asignar' : 's';
    }

    setDuration(duration) {
      this.duration = Number.isFinite(duration) && duration > 0 ? duration : 0;
      for (const [id, view] of this.rows) {
        view.capture.disabled = this.duration <= 0;
        if (this.duration > 0) view.input.max = String(this.duration);
        else view.input.removeAttribute('max');
        this.validateRow(id);
      }
    }

    evaluate(time) {
      const result = { welcome: 0, calibration: 0, biology: 0, damage: 0, protocols: 0, era: 0, reprogram: 0, countdown: 0, pulse: 0, activeLabel: '' };
      let latest = -Infinity;
      if (!Number.isFinite(time) || this.duration <= 0) return result;
      for (const event of EVENTS) {
        const start = this.times.get(event.id);
        if (start === null || start > this.duration || start < 0) continue;
        const age = time - start;
        const isCountdown = ['five', 'four', 'three', 'two', 'one'].includes(event.id);
        let shape = event;
        if (isCountdown) {
          // Shorten a pulse when the next spoken number is close: retain a quiet
          // gap between cues instead of merging several numbers into one glow.
          const next = EVENTS.filter(item => ['five', 'four', 'three', 'two', 'one'].includes(item.id))
            .map(item => this.times.get(item.id))
            .filter(value => value !== null && value > start && value <= this.duration);
          const length = next.length ? Math.min(event.length, (Math.min(...next) - start) * 0.88) : event.length;
          shape = { length, rise: Math.min(event.rise, length * 0.25) };
        }
        const value = envelope(age, shape);
        if (isCountdown) {
          result.countdown = Math.min(1, result.countdown + value);
        } else {
          result[event.id] = value;
        }
        if (value > 0.005 && start >= latest) {
          result.activeLabel = event.label;
          latest = start;
        }
      }
      result.pulse = Math.min(1, result.damage * 0.65 + result.protocols * 0.24 + result.reprogram * 0.28 + result.countdown);
      return result;
    }

    update(time) {
      for (const event of EVENTS) {
        const start = this.times.get(event.id);
        const active = this.duration > 0 && start !== null && start <= this.duration && time >= start && time < start + event.length;
        this.rows.get(event.id).row.classList.toggle('active', active);
      }
    }

    exportJSON() {
      return {
        schema: 'isdin-lab-markers',
        version: 1,
        markers: EVENTS.map(event => ({ id: event.id, time: this.times.get(event.id) }))
      };
    }

    importJSON(data) {
      if (!data || typeof data !== 'object' || Array.isArray(data) || data.schema !== 'isdin-lab-markers' || data.version !== 1 || !Array.isArray(data.markers)) {
        throw new TypeError('Archivo de marcadores ISDIN LAB no válido (versión 1).');
      }
      const next = new Map(EVENTS.map(event => [event.id, null]));
      const seen = new Set();
      for (const marker of data.markers) {
        if (!marker || typeof marker !== 'object' || !next.has(marker.id) || seen.has(marker.id)) {
          throw new TypeError('El archivo contiene un marcador desconocido o repetido.');
        }
        if (marker.time !== null && (typeof marker.time !== 'number' || !Number.isFinite(marker.time) || marker.time < 0)) {
          throw new TypeError('Los tiempos deben ser segundos positivos o null para dejar sin asignar.');
        }
        seen.add(marker.id);
        next.set(marker.id, marker.time);
      }
      this.times = next;
      for (const [id, view] of this.rows) {
        const time = this.times.get(id);
        view.input.value = time === null ? '' : String(time);
        this.validateRow(id);
      }
      this.onChange(this.exportJSON());
      return [...next.values()].filter(time => time !== null).length;
    }

    clear() {
      for (const [id, view] of this.rows) {
        this.times.set(id, null);
        view.input.value = '';
        view.row.classList.remove('active');
        this.validateRow(id);
      }
      this.onChange(this.exportJSON());
    }
  }

  window.NarrativeMarkers = NarrativeMarkers;
}());
