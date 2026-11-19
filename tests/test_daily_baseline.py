"""Exercise the production calculation without importing Home Assistant."""
import ast
import unittest
from datetime import datetime, timedelta
from math import isfinite
from pathlib import Path
from types import SimpleNamespace as N
from zoneinfo import ZoneInfo

path = Path(__file__).parents[1] / 'custom_components/wassermanager/sensor.py'
source = ast.parse(path.read_text())
functions = [node for node in source.body if isinstance(node, ast.FunctionDef) and node.name in ('reading', 'difference', 'calculate')]
module = ast.Module(body=[ast.ImportFrom(module='__future__', names=[ast.alias(name='annotations')], level=0), *functions], type_ignores=[])
ns = dict(datetime=datetime, timedelta=timedelta, isfinite=isfinite)
exec(compile(ast.fix_missing_locations(module), str(path), 'exec'), ns)
TZ = ZoneInfo('Europe/Berlin')
def state(time, value):
    return N(last_updated=datetime.fromisoformat(time), state=str(value), attributes={'unit_of_measurement':'m³'})
def calculate(history, current):
    return ns['calculate'](history, current, None, datetime(2026,11,19,16,tzinfo=TZ))

class DailyBaselineTests(unittest.TestCase):
    def test_ignores_higher_previous_day_reading(self):
        result=calculate([state('2026-11-18T23:59:00+01:00',854),state('2026-11-19T03:00:00+01:00',853.2)],state('2026-11-19T14:00:00+01:00',853.324))
        self.assertEqual(result['verbrauch_heute'],124)
        self.assertEqual(result['today_points'],[(180,0),(840,124)])

    def test_first_reading_zero_and_no_today_reading_unknown(self):
        first=state('2026-11-19T10:00:00+01:00',853)
        self.assertEqual(calculate([],first)['verbrauch_heute'],0)
        self.assertIsNone(calculate([],state('2026-11-18T23:59:00+01:00',853))['verbrauch_heute'])

    def test_each_day_uses_own_first_reading_despite_gaps(self):
        result=calculate([state('2026-11-17T08:00:00+01:00',850),state('2026-11-17T20:00:00+01:00',850.2)],state('2026-11-19T08:00:00+01:00',852))
        self.assertEqual(result['daily_liters']['2026-11-17'],200)
        self.assertIsNone(result['daily_liters']['2026-11-18'])
        self.assertEqual(result['durchschnitt_14_tage'],200)

    def test_invalid_first_value_and_out_of_order_history(self):
        result=calculate([state('2026-11-19T12:00:00+01:00',853.3),state('2026-11-19T01:00:00+01:00','unavailable'),state('2026-11-19T00:30:00+00:00',853.2)],state('2026-11-19T14:00:00+01:00',853.4))
        self.assertEqual(result['verbrauch_heute'],200)

    def test_backward_change_within_day_remains_invalid(self):
        result=calculate([state('2026-11-19T01:00:00+01:00',854)],state('2026-11-19T12:00:00+01:00',853))
        self.assertIsNone(result['verbrauch_heute'])
