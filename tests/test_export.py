"""Offline tests for streaming CLI CSV export and atomic rollback."""
import io
import json
from pathlib import Path
import tempfile
import unittest
from urllib.parse import parse_qs, urlsplit
from unittest.mock import Mock

from export import export_report


class ExportTest(unittest.TestCase):
    def test_two_pages_write_one_csv_and_pass_report_id(self):
        requests = []
        def fetch(request, timeout):
            requests.append((request, timeout))
            offset = parse_qs(urlsplit(request.full_url).query)['offset'][0]
            payload = {
                'report': 'approvals', 'header': '"Process";"Actor"',
                'csv': '"p1";"a"' if offset == '0' else '"p2";"b"',
                'nextOffset': 500 if offset == '0' else None,
            }
            return io.BytesIO(json.dumps(payload).encode())
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / 'report.csv'
            export_report('http://localhost/openidm', 'auditor', 'not-logged', 'approvals', target, fetch)
            self.assertEqual(target.read_bytes().decode('utf-8-sig'),
                             '"Process";"Actor"\r\n"p1";"a"\r\n"p2";"b"\r\n')
            self.assertEqual(len(requests), 2)
            self.assertIn('report=approvals', requests[0][0].full_url)
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)

    def test_partial_failed_export_does_not_overwrite_existing_report(self):
        count = 0
        def fetch(request, timeout):
            nonlocal count
            count += 1
            return io.BytesIO(json.dumps({
                'report': 'a', 'header': '"h"' if count == 1 else '"changed"',
                'csv': '"x"', 'nextOffset': 500 if count == 1 else None,
            }).encode())
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / 'report.csv'
            target.write_text('previous')
            with self.assertRaisesRegex(ValueError, 'schema changed'):
                export_report('http://localhost/openidm', 'u', 'p', 'a', target, fetch)
            self.assertEqual(target.read_text(), 'previous')
            self.assertEqual(sorted(item.name for item in Path(temp).iterdir()), ['report.csv'])

    def test_export_crosses_sources_with_offset_reset(self):
        requests = []
        def fetch(request, timeout):
            params = parse_qs(urlsplit(request.full_url).query)
            requests.append(params)
            second = params['sourceIndex'] == ['1']
            return io.BytesIO(json.dumps({'report':'history','header':'"Subject"',
                'csv':'"group"' if second else '"application"',
                'nextOffset':None if second else 0,
                'nextSourceIndex':None if second else 1}).encode())
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / 'history.csv'
            export_report('http://localhost/openidm','u','p','history',target,fetch)
            self.assertEqual(target.read_bytes().decode('utf-8-sig'), '"Subject"\r\n"application"\r\n"group"\r\n')
            self.assertEqual(requests[1]['sourceIndex'], ['1'])
            self.assertEqual(requests[1]['offset'], ['0'])


if __name__ == '__main__':
    unittest.main()
