// Use the coordinator's published daily values in every consumption display.
const amount = value => value == null || String(value).trim()==='' || !Number.isFinite(Number(value)) || Number(value)<0 ? null : Number(value);
export function publishedDailyConsumption(states, meter, calendar) {
  const matches = state => state?.attributes?.meter_entity===meter && state.attributes.daily_liters && typeof state.attributes.daily_liters==='object';
  const preferred=states?.['sensor.wassermanager_verbrauch_heute'];
  const source=matches(preferred)?preferred:Object.values(states ?? {}).find(state=>state?.entity_id?.startsWith('sensor.') && matches(state));
  if (!source) return null;
  const value=amount(source.state);
  const unit=String(source.attributes.unit_of_measurement ?? 'L').toLowerCase();
  const today=value===null?null:['m³','m3'].includes(unit)?value:['l','liter','liters'].includes(unit)?value/1000:null;
  return {source:source.entity_id,days:calendar.days.slice(1).map(day=>({day,value:day===calendar.today?today:((liters)=>liters===null?null:liters/1000)(amount(source.attributes.daily_liters[day]))}))};
}
