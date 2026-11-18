import copy
import json
from pathlib import Path
import unittest
from install import merge_report_config, merge_history_indexes

class ConfigUpgradeTest(unittest.TestCase):
    def test_add_history_preserves_customizations_and_is_idempotent(self):
        defaults = json.loads((Path(__file__).parents[1] / 'assets/custom-reporting.json').read_text())
        original = {'defaultReport':'custom', 'reports':[{'id':'custom','columns':['private configuration']}]}
        updated = merge_report_config(original, defaults)
        self.assertEqual(updated['defaultReport'], 'custom')
        self.assertEqual(updated['reports'][0], original['reports'][0])
        self.assertEqual(updated['reports'][1]['id'], 'workflow-history')
        self.assertEqual(updated, merge_report_config(updated, defaults))
        self.assertEqual(len(original['reports']), 1)
        legacy = {'defaultReport':'ownership-history', 'reports':[copy.deepcopy(defaults['reports'][0])]}
        self.assertEqual(merge_report_config(legacy, defaults)['defaultReport'], 'workflow-history')

class IndexUpgradeTest(unittest.TestCase):
    def test_indexes_are_additive_and_idempotent(self):
        original={'dbStructure':{'orientdbClass':{'managed_user':{},'managed_entraOwnerRequest':{'index':[{'propertyName':'_openidm_id','indexType':'unique'}]}}}}
        additions=json.loads((Path(__file__).parents[1] / 'assets/history-indexes.json').read_text())
        updated=merge_history_indexes(original,additions)
        self.assertEqual(len(original['dbStructure']['orientdbClass']['managed_entraOwnerRequest']['index']),1)
        self.assertEqual(updated,merge_history_indexes(updated,additions))
        self.assertEqual(updated['dbStructure']['orientdbClass']['managed_entraOwnerRequest']['index'][0],original['dbStructure']['orientdbClass']['managed_entraOwnerRequest']['index'][0])
