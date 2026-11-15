"""Persistent January 1 meter reading."""

from homeassistant.components.number import NumberMode, RestoreNumber
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import UnitOfVolume
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import dt as dt_util


def baseline_unique_id(entry: ConfigEntry) -> str:
    """Return the stable registry key for the baseline."""
    return f"{entry.entry_id}_january_reading"


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Expose the annual baseline in Home Assistant."""
    async_add_entities([JanuaryReading(entry)])


class JanuaryReading(RestoreNumber):
    """Remember the last entered reading and its calendar year."""

    _attr_name = "Wassermanager Ablesewert 1. Januar"
    _attr_native_unit_of_measurement = UnitOfVolume.CUBIC_METERS
    _attr_native_min_value = 0
    _attr_native_max_value = 999999999
    _attr_native_step = 0.001
    _attr_icon = "wassermanager:meter"
    _attr_mode = NumberMode.BOX
    _attr_native_value = None
    _year = None

    def __init__(self, entry: ConfigEntry) -> None:
        self._attr_unique_id = baseline_unique_id(entry)

    @property
    def extra_state_attributes(self) -> dict:
        """Identify the year to which the reading belongs."""
        return {"year": self._year}

    async def async_added_to_hass(self) -> None:
        """Restore the reading and year after a restart."""
        await super().async_added_to_hass()
        state = await self.async_get_last_state()
        data = await self.async_get_last_number_data()
        if state is not None and data is not None:
            self._attr_native_value = data.native_value
            self._year = state.attributes.get("year")

    async def async_set_native_value(self, value: float) -> None:
        """Save the reading for the current Home Assistant calendar year."""
        self._attr_native_value = value
        self._year = dt_util.now().year
        self.async_write_ha_state()
