const number = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 3 });
const format = (value, unit) => value == null ? "—" : `${number.format(value)} ${unit}`;

function reading(value) {
  if (value == null || String(value).trim() === "") return null;
  const parsed = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function calendar(now, timeZone) {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  });
  const today = formatter.format(now);
  const midnight = Date.parse(today + "T00:00:00Z");
  const days = Array.from({ length: 15 }, (_, index) =>
    new Date(midnight - (14 - index) * 86400000).toISOString().slice(0, 10));
  return { today, year: today.slice(0, 4), days, dayOf: date => formatter.format(date) };
}

function difference(end, start) {
  return end != null && start != null && end >= start ? end - start : null;
}

function dailyConsumption(history, current, calendar) {
  const latest = new Map();
  const points = [...history, current].filter(Boolean);
  for (const point of points) {
    const timestamp = Date.parse(point.last_updated || point.last_changed);
    if (!Number.isFinite(timestamp)) continue;
    const day = calendar.dayOf(timestamp);
    if (timestamp >= (latest.get(day)?.timestamp ?? -Infinity)) {
      const value = reading(point.state);
      if (value !== null) latest.set(day, { timestamp, value });
    }
  }
  return calendar.days.slice(1).map((day, index) => ({
    day,
    value: difference(
      latest.get(day)?.value,
      latest.get(calendar.days[index])?.value,
    ),
  }));
}

class WaterManagerPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.history = [];
    this.loadedAt = 0;
  }

  set panel(panel) {
    this.config = panel.config || {};
    this.update();
  }

  set hass(hass) {
    this.homeAssistant = hass;
    this.update();
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block;min-height:100vh;background:#edf3f4;color:#122e36;font:16px "DM Sans",system-ui,sans-serif}
        *{box-sizing:border-box}
        main{width:min(1100px,100%);margin:auto;padding:clamp(22px,5vw,64px)}
        header,.chart-head{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
        .identity{display:flex;align-items:center;gap:clamp(10px,2vw,22px)}
        .identity img{width:clamp(50px,8vw,92px);height:auto}
        h1{font-size:clamp(2.4rem,6vw,4.5rem);letter-spacing:-.075em;margin:0;line-height:1.05}
        h2{margin:0;font-size:1.25rem;letter-spacing:-.025em}
        p{margin:.45rem 0;color:#45636b}
        button,input{font:inherit;border-radius:9px;border:1px solid #9cbbbe;padding:.62rem .8rem}
        button{cursor:pointer;background:#12675f;color:white;border-color:#12675f}
        button[disabled]{opacity:.65;cursor:wait}
        .metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:26px 0 14px}
        article,section{background:#fff;border:1px solid #d6e4e6;border-radius:18px;padding:clamp(16px,3vw,26px)}
        article:first-child{background:#123f47;color:#fff;border-color:#123f47}
        article strong{display:block;margin-top:.55rem;font-size:clamp(1.55rem,4vw,2.6rem);letter-spacing:-.055em}
        section{margin-bottom:14px}
        .bars{display:grid;grid-template-columns:repeat(14,minmax(0,1fr));gap:clamp(3px,1vw,12px);margin-top:20px}
        .column{display:grid;grid-template-rows:145px auto;text-align:center;gap:8px;font-size:.75rem;color:#45636b}
        .track{display:flex;align-items:flex-end;background:#eef4f5;border-radius:6px;overflow:hidden}
        .bar{width:100%;background:#78aaa8;border-radius:5px 5px 0 0}
        .column:last-child .bar{background:#12675f}
        .column.missing .track{background:repeating-linear-gradient(135deg,#eff4f5 0 5px,#e6eeee 5px 6px)}
        #intraday svg{display:block;width:100%;height:90px;margin-top:12px}
        .hours{display:flex;justify-content:space-between;font-size:.75rem;color:#45636b}
        form{display:flex;align-items:end;gap:10px;flex-wrap:wrap;margin-top:12px}
        label{display:grid;gap:6px}
        input{width:12em;color:#122e36;background:white}
        [role=status]{min-height:1.4em}
        @media(max-width:620px){.metrics{grid-template-columns:1fr}.column:nth-child(even):not(:last-child) .date{visibility:hidden}}
      </style>
      <main>
        <header><div class="identity"><img id="brand" alt="" hidden><div><h1>Wasserverbrauch</h1><p id="source"></p></div></div><button id="refresh" type="button">Aktualisieren</button></header>
        <div class="metrics">
          <article>Heute<strong id="today">—</strong></article>
          <article>Seit 1. Januar<strong id="annual">—</strong></article>
          <article>Zählerstand<strong id="current">—</strong></article>
        </div>
        <section aria-labelledby="intraday-title">
          <div class="chart-head"><h2 id="intraday-title">Verlauf heute</h2><p>Verbrauch seit Mitternacht · Liter</p></div>
          <div id="intraday"></div>
        </section>
        <section aria-labelledby="chart-title">
          <div class="chart-head"><h2 id="chart-title">Täglicher Verbrauch</h2><p>Letzte 14 Tage · Liter</p></div>
          <div class="bars" id="bars" aria-label="Täglicher Verbrauch in Litern"></div>
          <p>Schraffierte Tage haben keine ausreichenden Ablesewerte.</p>
        </section>
        <section aria-labelledby="baseline-title">
          <h2 id="baseline-title">Ablesewert zum 1. Januar</h2>
          <form><label><span id="baseline-label">Zählerstand in m³</span>
            <input id="baseline" inputmode="decimal" placeholder="z. B. 810,500">
          </label><button id="save" type="submit">Speichern</button></form>
          <p id="feedback" role="status"></p>
        </section>
        <p id="status" role="status"></p>
      </main>`;
    this.shadowRoot.getElementById("refresh").onclick = () => this.loadHistory();
    this.shadowRoot.querySelector("form").onsubmit = async event => {
      event.preventDefault();
      const value = reading(this.element("baseline").value);
      if (value === null || value > this.currentValue && this.currentValue !== null) {
        this.element("feedback").textContent = "Gib einen gültigen Stand bis zum aktuellen Zählerstand ein.";
        return;
      }
      if (!this.config?.demo) {
        const entity_id = this.config?.baseline_entity;
        if (!entity_id || !this.homeAssistant?.states[entity_id]) return;
        this.saving = true;
        this.element("save").disabled = true;
        try {
          await this.homeAssistant.callService("number", "set_value", { entity_id, value });
          this.element("feedback").textContent = "Ablesewert in Home Assistant gespeichert.";
        } catch {
          this.element("feedback").textContent = "Home Assistant konnte den Ablesewert nicht speichern.";
        } finally {
          this.saving = false;
          this.update();
        }
        return;
      }
      try {
        localStorage.setItem(this.storageKey, String(value));
      } catch {
        this.element("feedback").textContent = "Der Browser konnte den Wert nicht speichern.";
        return;
      }
      this.baseline = value;
      this.element("feedback").textContent = "Ablesewert in diesem Browser gespeichert.";
      this.render();
    };
    this.update();
    this.timer = setInterval(() => this.update(), 30000);
  }

  disconnectedCallback() {
    clearInterval(this.timer);
  }

  element(id) {
    return this.shadowRoot.getElementById(id);
  }

  get entity() {
    return this.config?.entity || "sensor.watermeter_value";
  }

  get current() {
    if (this.config?.demo) {
      return { state: "852.082", last_changed: new Date().toISOString() };
    }
    const state = this.homeAssistant?.states[this.entity];
    if (!state) return null;
    const unit = state.attributes.unit_of_measurement || this.config?.unit || "m³";
    return { ...state, state: this.toCubicMeters(state.state, unit) };
  }

  get currentValue() {
    return reading(this.latestReading?.state);
  }

  get latestReading() {
    const current = this.current;
    if (reading(current?.state) !== null) return current;

    let latest = this.lastValidEntity === this.entity ? this.lastValidReading : null;
    const history = this.historyEntity === this.entity ? this.history : [];
    for (const point of history) {
      const timestamp = Date.parse(point.last_updated || point.last_changed);
      const latestTime = Date.parse(latest?.last_updated || latest?.last_changed);
      if (reading(point.state) !== null && Number.isFinite(timestamp) &&
          (!Number.isFinite(latestTime) || timestamp > latestTime)) latest = point;
    }
    return latest;
  }

  toCubicMeters(state, unit) {
    const value = reading(state);
    if (value === null) return null;
    if (unit.toLowerCase() === "l") return value / 1000;
    return ["m³", "m3"].includes(unit) ? value : null;
  }

  update() {
    if (!this.element("baseline")) return;
    this.calendar = calendar(new Date(), this.homeAssistant?.config.time_zone || "Europe/Berlin");
    if (this.config?.demo) {
      const key = `wassermanager:demo:${this.calendar.year}`;
      if (this.storageKey !== key) {
        this.storageKey = key;
        try {
          this.baseline = reading(localStorage.getItem(key)) ?? 810.5;
        } catch {
          this.baseline = 810.5;
        }
        this.setBaselineInput();
      }
    } else {
      const entity = this.homeAssistant?.states[this.config?.baseline_entity];
      const baseline = String(entity?.attributes.year) === this.calendar.year
        ? reading(entity.state) : null;
      if (baseline !== this.baseline || this.baselineYear !== this.calendar.year) {
        this.baseline = baseline;
        this.baselineYear = this.calendar.year;
        this.setBaselineInput();
      }
      const unavailable = !entity || entity.state === "unavailable";
      this.element("baseline").disabled = unavailable;
      this.element("save").disabled = unavailable || this.saving;
    }
    const current = this.current;
    if (reading(current?.state) !== null) {
      this.lastValidEntity = this.entity;
      this.lastValidReading = current;
    }
    this.render();
    if ((this.config?.demo || this.homeAssistant) && !this.loading &&
        (this.historyEntity !== this.entity || Date.now() - this.loadedAt > 60000)) {
      void this.loadHistory();
    }
  }

  setBaselineInput() {
    this.element("baseline").value = this.baseline == null ? "" : String(this.baseline).replace(".", ",");
    this.element("feedback").textContent = "";
  }

  async loadHistory() {
    if (!this.calendar || this.loading) return;
    this.loading = true;
    this.element("refresh").disabled = true;
    const entity = this.entity;
    const now = new Date();
    this.loadedAt = now.getTime();
    if (this.historyEntity !== entity) this.history = [];
    this.historyEntity = entity;
    this.error = "";
    try {
      if (this.config?.demo) {
        const liters = [172, 124, 209, 148, 106, 230, 154, 191, 108, 122, 221, 163, 137, 184];
        let total = 852082 - liters.reduce((sum, value) => sum + value, 0);
        this.history = this.calendar.days.slice(0, -1).map((day, index) => {
          if (index > 0) total += liters[index - 1];
          return { state: total / 1000, last_changed: day + "T12:00:00Z" };
        });
        for (const [hour, litersUsed] of [[6, 24], [9, 75], [12, 121], [15, 160]]) {
          const time = new Date();
          time.setHours(hour, 0, 0, 0);
          if (time < now) this.history.push({
            state: (852082 - 184 + litersUsed) / 1000,
            last_changed: time.toISOString(),
          });
        }
      } else {
        const start = new Date(Date.parse(this.calendar.days[0]) - 86400000);
        const query = new URLSearchParams({
          filter_entity_id: entity, end_time: now.toISOString(),
          minimal_response: "", no_attributes: "", significant_changes_only: "0",
        });
        const result = await this.homeAssistant.callApi("GET", `history/period/${start.toISOString()}?${query}`);
        const unit = this.homeAssistant.states[entity]?.attributes.unit_of_measurement || this.config?.unit || "m³";
        this.history = (result[0] || []).map(point => ({ ...point, state: this.toCubicMeters(point.state, unit) }));
      }
    } catch {
      this.error = "Der Verlauf konnte nicht geladen werden.";
    } finally {
      this.loading = false;
      this.element("refresh").disabled = false;
      this.render();
    }
  }

  renderIntraday(history, latest) {
    const chart = this.element("intraday");
    const today = this.calendar.today;
    const yesterday = this.calendar.days.at(-2);
    const readings = [...history, latest].filter(Boolean).map(point => ({
      time: Date.parse(point.last_updated || point.last_changed),
      value: reading(point.state),
    })).filter(point => Number.isFinite(point.time) && point.value !== null)
      .sort((a, b) => a.time - b.time);
    const baseline = readings.findLast(point => this.calendar.dayOf(point.time) === yesterday);
    const todayReadings = readings.filter(point => this.calendar.dayOf(point.time) === today);
    if (!baseline || !todayReadings.length || todayReadings.some(point => point.value < baseline.value)) {
      chart.innerHTML = "<p>Für den Verlauf fehlen gültige Ablesungen vom Vortag oder von heute.</p>";
      return;
    }

    const clock = new Intl.DateTimeFormat("de-DE", {
      timeZone: this.homeAssistant?.config.time_zone || "Europe/Berlin",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
    const peak = Math.max(...todayReadings.map(point => (point.value - baseline.value) * 1000));
    const xAt = time => {
      const [hour, minute] = clock.format(time).split(":").map(Number);
      return (hour * 60 + minute) / 1440 * 1000;
    };
    const points = todayReadings.map(({ time, value }) => ({
      x: xAt(time),
      y: 86 - (value - baseline.value) * 1000 / Math.max(1, peak) * 76,
    }));
    const path = points.map(({ x, y }) => `H${x.toFixed(2)}V${y.toFixed(2)}`).join("");
    const last = points.at(-1);
    const lastReading = todayReadings.at(-1);
    const lastValue = format((lastReading.value - baseline.value) * 1000, "L");
    const lastTime = clock.format(lastReading.time);
    const nowX = Math.max(last.x, xAt(Date.now()));
    chart.innerHTML = `<svg viewBox="0 0 1000 90" preserveAspectRatio="none" role="img"
      aria-label="Verbrauch heute, zuletzt ${lastValue} um ${lastTime}">
      <path d="M0 86H1000" stroke="#d6e4e6" fill="none"/>
      <path d="M0 86${path}" stroke="#12675f" stroke-width="2" vector-effect="non-scaling-stroke" fill="none"/>
      <path d="M${last.x} ${last.y}H${nowX}" stroke="#12675f" stroke-dasharray="4 4"
        stroke-width="2" vector-effect="non-scaling-stroke" fill="none"/>
    </svg><div class="hours"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div><p>Zuletzt gemessen um ${lastTime} Uhr · <strong>${lastValue}</strong></p>`;
  }

  render() {
    const latest = this.latestReading;
    const current = reading(latest?.state);
    const history = this.historyEntity === this.entity ? this.history : [];
    const days = dailyConsumption(history, latest, this.calendar);
    this.renderIntraday(history, latest);
    const icon = this.element("brand");
    const iconUrl = this.config?.icon_url;
    if (iconUrl && icon.getAttribute("src") !== iconUrl) icon.src = iconUrl;
    icon.hidden = !iconUrl;
    const name = this.homeAssistant?.states[this.entity]?.attributes.friendly_name;
    this.element("source").textContent = this.config?.demo ? "Testseite mit Demodaten"
      : name && name !== this.entity ? name : "Wasserzähler";
    this.element("current").textContent = format(current, "m³");
    this.element("today").textContent = format(days.at(-1).value === null ? null : days.at(-1).value * 1000, "L");
    this.element("annual").textContent = format(difference(current, this.baseline), "m³");
    this.element("baseline-label").textContent = `Zählerstand am 01.01.${this.calendar.year} in m³`;
    const timestamp = Date.parse(latest?.last_updated || latest?.last_changed);
    const fallback = reading(this.current?.state) === null && latest;
    const messages = [
      fallback && (Number.isFinite(timestamp)
        ? `Letzter gültiger Stand vom ${new Intl.DateTimeFormat("de-DE", {
          dateStyle: "short", timeStyle: "short",
          timeZone: this.homeAssistant?.config.time_zone || "Europe/Berlin",
        }).format(timestamp)}.`
        : "Anzeige mit dem letzten gültigen Zählerstand."),
      this.error,
      current === null && this.homeAssistant && "Für diesen Sensor liegt kein gültiger Zählerstand vor.",
      current !== null && this.baseline > current && "Der Ablesewert vom 1. Januar liegt über dem letzten gültigen Zählerstand.",
    ];
    this.element("status").textContent = messages.filter(Boolean).join(" ");
    const max = Math.max(0.001, ...days.map(day => day.value ?? 0));
    this.element("bars").innerHTML = days.map(({ day, value }) => {
      const date = `${day.slice(8)}.${day.slice(5, 7)}.`;
      const label = value === null ? "kein Wert" : format(value * 1000, "L");
      const bar = value === null ? "" : `<span class="bar" style="height:${Math.max(2, value / max * 100)}%"></span>`;
      return `<div class="column ${value === null ? "missing" : ""}" title="${date} ${label}" aria-label="${date} ${label}"><div class="track">${bar}</div><span class="date">${date}</span></div>`;
    }).join("");
  }
}

customElements.define("water-manager-panel", WaterManagerPanel);
