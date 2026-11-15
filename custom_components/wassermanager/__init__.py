"""Wassermanager sidebar panel."""

from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url, async_remove_panel
from homeassistant.components.http import StaticPathConfig
from homeassistant.components.panel_custom import async_register_panel
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

DOMAIN = "wassermanager"
STATIC_URL = "/wassermanager-static"
PANEL_PATH = "wassermanager"
VERSION = "0.1.1"


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Register the frontend and configure its meter entity."""
    data = hass.data.setdefault(DOMAIN, {})
    if not data.get("static_registered"):
        await hass.http.async_register_static_paths([
            StaticPathConfig(
                STATIC_URL, str(Path(__file__).parent / "frontend"), False
            )
        ])
        add_extra_js_url(hass, f"{STATIC_URL}/sidebar-icon.js?v={VERSION}")
        data["static_registered"] = True

    await async_register_panel(
        hass,
        frontend_url_path=PANEL_PATH,
        webcomponent_name="water-manager-panel",
        sidebar_title="Wassermanager",
        sidebar_icon="wassermanager:meter",
        module_url=f"{STATIC_URL}/panel.js?v={VERSION}",
        config={"entity": entry.data["entity"]},
    )
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Remove the sidebar panel."""
    async_remove_panel(hass, PANEL_PATH)
    return True
