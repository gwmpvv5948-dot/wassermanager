"""Configure the water meter used by the sidebar panel."""

import voluptuous as vol

from homeassistant.config_entries import ConfigFlow
from homeassistant.helpers.selector import EntitySelector, EntitySelectorConfig

from . import DOMAIN


class WassermanagerConfigFlow(ConfigFlow, domain=DOMAIN):
    """Set up one Wassermanager panel."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Select the cumulative water meter sensor."""
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        if user_input is not None:
            return self.async_create_entry(title="Wassermanager", data=user_input)
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({
                vol.Required("entity"): EntitySelector(
                    EntitySelectorConfig(domain="sensor")
                )
            }),
        )
