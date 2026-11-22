"""Publish water consumption independently of the browser panel."""

from datetime import datetime, timedelta
from functools import partial
import logging
from math import isfinite

from homeassistant.components.recorder import get_instance
from homeassistant.components.recorder.history import get_significant_states
from homeassistant.components.sensor import SensorDeviceClass, SensorEntity, SensorStateClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import UnitOfVolume
from homeassistant.core import HomeAssistant, State, callback
from homeassistant.helpers import entity_registry
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.helpers.update_coordinator import CoordinatorEntity, DataUpdateCoordinator
from homeassistant.util import dt as dt_util

from .number import baseline_unique_id

METRICS = {
    "jahresprognose": ("Jahresprognose", UnitOfVolume.CUBIC_METERS),
    "verbrauch_heute": ("Verbrauch heute", UnitOfVolume.LITERS),
    "verbrauch_seit_januar": ("Verbrauch seit Januar", UnitOfVolume.CUBIC_METERS),
    "durchschnitt_14_tage": ("Durchschnitt 14 Tage", UnitOfVolume.LITERS),
}


def reading(state: State | None, fallback_unit: str = "m³") -> float | None:
    """Normalize valid meter readings to cubic meters."""
    if state is None:
        return None
    try:
        value = float(state.state.strip().replace(",", "."))
    except ValueError:
        return None
    if not isfinite(value) or value < 0:
        return None
    unit = state.attributes.get("unit_of_measurement") or fallback_unit
    return value / 1000 if unit.lower() == "l" else value


def difference(end: float | None, start: float | None) -> float | None:
    """Reject missing readings and backwards meter changes."""
    return end - start if end is not None and start is not None and end >= start else None


def calculate(history, current, baseline, now):
    """Calculate the same daily boundaries as the Wassermanager panel."""
    timezone = now.tzinfo
    today = now.date()
    latest_by_day = {}
    first_by_day = {}
    today_readings = []
    last_reading_at = None
    fallback_unit = (current.attributes.get("unit_of_measurement") or "m³") if current else "m³"
    for state in sorted([*history, *([current] if current else [])], key=lambda state: state.last_updated):
        value = reading(state, fallback_unit)
        if value is None:
            continue
        local_time = state.last_updated.astimezone(timezone)
        day = local_time.date()
        if local_time > now:
            continue
        first_by_day.setdefault(day, value)
        latest_by_day[day] = value
        last_reading_at = local_time.isoformat()
        if day == today:
            today_readings.append((local_time, value))

    previous = latest_by_day.get(today - timedelta(days=1))
    today_end = latest_by_day.get(today)
    use_previous = previous is not None and today_end is not None and previous <= today_end
    today_start = previous if use_previous else first_by_day.get(today)

    daily = {}
    for offset in range(13, -1, -1):
        day = today - timedelta(days=offset)
        start = today_start if day == today else first_by_day.get(day)
        delta = difference(latest_by_day.get(day), start)
        daily[day.isoformat()] = None if delta is None else round(delta * 1000, 3)

    samples = {0: 0} if use_previous else {}
    for local_time, value in today_readings:
        delta = difference(value, today_start)
        if delta is not None:
            samples[local_time.hour * 60 + local_time.minute] = round(delta * 1000, 3)
    completed = [value for date, value in daily.items() if date != today.isoformat() and value is not None]
    annual = difference(
        next(reversed(latest_by_day.values()), None),
        reading(baseline) if baseline and str(baseline.attributes.get("year")) == str(today.year) else None,
    )
    remaining_days = (today.replace(month=12, day=31) - today).days
    average = sum(completed) / len(completed) if completed else None
    forecast = (
        annual + average * remaining_days / 1000
        if annual is not None and average is not None and today_readings
        else None
    )
    return {
        "jahresprognose": None if forecast is None else round(forecast, 3),
        "forecast_year": today.year,
        "forecast_remaining_days": remaining_days,
        "verbrauch_heute": daily[today.isoformat()],
        "verbrauch_seit_januar": None if annual is None else round(annual, 3),
        "durchschnitt_14_tage": round(sum(completed) / len(completed), 2) if completed else None,
        "valid_days": len(completed),
        "daily_liters": daily,
        "today_points": list(samples.items()),
        "source_available": reading(current) is not None,
        "last_meter_m3": next(reversed(latest_by_day.values()), None),
        "last_meter_at": last_reading_at,
    }


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Register consumption sensors and start recorder-backed updates."""
    coordinator = WaterMetrics(hass, entry)
    await coordinator.async_refresh()
    async_add_entities([WaterSensor(coordinator, entry, key) for key in METRICS])


class WaterMetrics(DataUpdateCoordinator):
    """Refresh on meter changes and when a new calendar day starts."""

    def __init__(self, hass, entry):
        super().__init__(hass, logging.getLogger(__name__), name="Wassermanager",
                         update_interval=timedelta(minutes=10), config_entry=entry)
        self.meter = entry.data["entity"]
        self.entry = entry
        self.history = []
        self.history_day = None

    async def _async_update_data(self):
        now = dt_util.now()
        if self.history_day != now.date():
            start = datetime.combine(now.date() - timedelta(days=14), datetime.min.time(), now.tzinfo)
            states = await get_instance(self.hass).async_add_executor_job(partial(
                get_significant_states, self.hass, dt_util.as_utc(start), dt_util.as_utc(now),
                [self.meter], include_start_time_state=True, significant_changes_only=False,
            ))
            # Meter events can arrive while Recorder is queried in the executor.
            by_time = {
                state.last_updated: state
                for state in [*states.get(self.meter, []), *self.history]
                if state.last_updated >= start
            }
            self.history = list(by_time.values())
            self.history_day = now.date()
        current = self.hass.states.get(self.meter)
        registry = entity_registry.async_get(self.hass)
        baseline_id = registry.async_get_entity_id("number", "wassermanager", baseline_unique_id(self.entry))
        baseline = self.hass.states.get(baseline_id) if baseline_id else None
        return calculate(self.history, current, baseline, now)

    @callback
    def meter_changed(self, event):
        """Keep readings received after the initial history fetch."""
        state = event.data.get("new_state")
        if reading(state) is not None:
            self.history.append(state)
        self.hass.async_create_task(self.async_request_refresh())


class WaterSensor(CoordinatorEntity[WaterMetrics], SensorEntity):
    """A calculated water consumption entity."""

    def __init__(self, coordinator, entry, key):
        super().__init__(coordinator)
        self.key = key
        name, unit = METRICS[key]
        self._attr_name = f"Wassermanager {name}"
        self._attr_unique_id = f"{entry.entry_id}_{key}"
        self._attr_native_unit_of_measurement = unit
        if key == "durchschnitt_14_tage":
            self._attr_state_class = SensorStateClass.MEASUREMENT
        elif key != "jahresprognose":
            self._attr_device_class = SensorDeviceClass.WATER
            self._attr_state_class = SensorStateClass.TOTAL

    async def async_added_to_hass(self):
        await super().async_added_to_hass()
        if self.key == "verbrauch_heute":
            registry = entity_registry.async_get(self.hass)
            baseline = registry.async_get_entity_id("number", "wassermanager", baseline_unique_id(self.coordinator.entry))
            self.async_on_remove(async_track_state_change_event(
                self.hass, self.coordinator.meter, self.coordinator.meter_changed
            ))
            if baseline:
                @callback
                def baseline_changed(_event):
                    self.hass.async_create_task(self.coordinator.async_request_refresh())
                self.async_on_remove(async_track_state_change_event(self.hass, baseline, baseline_changed))

    @property
    def native_value(self):
        return (self.coordinator.data or {}).get(self.key)

    @property
    def extra_state_attributes(self):
        data = self.coordinator.data or {}
        attributes = {"source_available": data.get("source_available", False)}
        if self.key == "verbrauch_heute":
            attributes["meter_entity"] = self.coordinator.meter
            attributes.update({key: data.get(key) for key in ("daily_liters", "today_points", "last_meter_m3", "last_meter_at")})
        if self.key == "jahresprognose":
            attributes.update(
                meter_entity=self.coordinator.meter,
                year=data.get("forecast_year"),
                remaining_days=data.get("forecast_remaining_days"),
                average_liters=data.get("durchschnitt_14_tage"),
            )
        if self.key == "durchschnitt_14_tage":
            attributes["valid_days"] = data.get("valid_days", 0)
        return attributes
