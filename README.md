# Wassermanager

Eigenes Home-Assistant-Panel mit einer Vorschau in `preview.html`. Die Vorschau
lässt sich direkt im Browser öffnen und verwendet Demodaten.

## Installation in Home Assistant

1. Kopiere `www/wassermanager/panel.js` in den Home-Assistant-Konfigurationsordner
   nach `www/wassermanager/panel.js`.
2. Ermittle unter **Entwicklerwerkzeuge → Zustände** die Entitäts-ID des
   kumulierten Zählerstands unter `watermeter`. Verwende einen Sensor in m³
   oder Litern.
3. Ergänze `configuration.yaml` wie unten. Falls `panel_custom:` bereits
   existiert, hänge den Eintrag an die vorhandene Liste an.

```yaml
panel_custom:
  - name: water-manager-panel
    url_path: wassermanager
    sidebar_title: Wassermanager
    sidebar_icon: mdi:water
    module_url: /local/wassermanager/panel.js
    config:
      entity: sensor.watermeter_value
```

Ersetze `sensor.watermeter_value` bei Bedarf durch deine Entitäts-ID. Wenn
der Sensor kein Einheitenattribut liefert, nimmt das Panel m³ an. Für einen
einheitenlosen Liter-Sensor ergänze unter `config` die Zeile `unit: L`.
Prüfe die Konfiguration und starte Home Assistant neu. Danach findest du
**Wassermanager** in der Seitenleiste.

## Berechnung

- **Heute** verwendet den aktuellen Zählerstand minus der letzten Ablesung
  des Vortags. Dadurch kann der erste Verbrauch nach der letzten Ablesung
  vor Mitternacht dem heutigen Tag zugerechnet werden.
- **Täglicher Verbrauch** zeigt die Differenz zwischen den letzten
  Ablesungen zweier aufeinanderfolgender Kalendertage in Litern. Grundlage
  sind die verfügbaren Recorder-Daten und die Zeitzone von Home Assistant.
  Fehlende Tage oder fallende Zählerstände erscheinen als Lücken. Der
  Verlauf wird beim Öffnen und während der Anzeige regelmäßig geladen.
- **Seit 1. Januar** verwendet den aktuellen Zählerstand minus dem
  eingetragenen Ablesewert in m³. Der Ablesewert wird pro Sensor und
  Kalenderjahr im jeweiligen Browser gespeichert. Verwende bei einem
  Zählertausch einen durchgängigen kumulierten Sensor.

Die Liveansicht verwendet die bestehende Home-Assistant-Sitzung für die
History-API. Es werden keine Zugangsdaten im Projekt hinterlegt.
