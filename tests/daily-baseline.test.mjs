import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('../custom_components/wassermanager/frontend/panel.js',import.meta.url),'utf8');
const context=vm.createContext({Intl,Date});
vm.runInContext(source.slice(0,source.indexOf('class WaterManagerPanel')),context);
const result=vm.runInContext(`dailyConsumption([
 {state:'854',last_updated:'2026-11-18T23:59:00+01:00'},
 {state:'853.2',last_updated:'2026-11-19T03:00:00+01:00'}
],{state:'853.324',last_updated:'2026-11-19T14:00:00+01:00'},calendar(new Date('2026-11-19T16:00:00+01:00'),'Europe/Berlin'))`,context);
assert.ok(Math.abs(result.at(-1).value-.124)<1e-9);
assert.equal(result.at(-2).value,0);
assert.equal(result.at(-3).value,null);
console.log('Panel daily baseline checks passed');
