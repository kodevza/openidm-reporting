import copy
import json
from pathlib import Path
import unittest
from install import merge_report_config

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

class CacheVersionTest(unittest.TestCase):
    def test_reporting_version_preserves_other_versions_and_replaces_itself(self):
        from install import version_reporting_assets
        original = 'var require = {urlArgs : "v=7.1.2&ownerSearch=abc"};'
        updated = version_reporting_assets(original, '123')
        self.assertIn('v=7.1.2&ownerSearch=abc&reporting=123', updated)
        self.assertEqual(version_reporting_assets(updated, '123'), updated)
        self.assertIn('&reporting=456', version_reporting_assets(updated, '456'))
        self.assertEqual(version_reporting_assets(updated, '456').count('&reporting='), 1)

    def test_my_tasks_tab_replaces_legacy_dashboard_registration(self):
        from install import register_my_tasks
        original = (
            '<!-- Reporting My Tasks -->\n'
            '<script>require.map = {"TasksDashboard":"ReportingMyTasks"};</script>\n'
            '<script data-main="main"></script>'
        )
        updated = register_my_tasks(original)
        self.assertIn('reporting.myTasks = true', updated)
        self.assertNotIn('TasksDashboard', updated)
        self.assertEqual(register_my_tasks(updated), updated)
