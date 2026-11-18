#!/usr/bin/env python3
# SPDX-License-Identifier: CDDL-1.1
"""Download one configured OpenIDM report to a CSV file (Python stdlib only)."""
import argparse
import json
import os
from pathlib import Path
import tempfile
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def export_report(base, username, password, report_id, destination, fetch=urlopen):
    """Fetch JSON pages; write CSV only when the entire export succeeds."""
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8-sig', newline='',
                                         prefix='.report-', suffix='.tmp',
                                         dir=str(destination.parent), delete=False) as output:
            temporary = Path(output.name)
            offset, source_index, header = 0, 0, None
            while True:
                params = urlencode({'report': report_id, 'offset': offset, 'sourceIndex': source_index})
                uri = base.rstrip('/') + '/endpoint/governanceReport?' + params
                request = Request(uri, headers={
                    'X-OpenIDM-Username': username,
                    'X-OpenIDM-Password': password,
                    'X-OpenIDM-NoSession': 'true',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json',
                })
                with fetch(request, timeout=30) as response:
                    page = json.load(response)
                if page.get('report') != report_id or not isinstance(page.get('header'), str):
                    raise ValueError('Unexpected report schema or ID')
                if header is None:
                    header = page['header']
                    output.write(header + '\r\n')
                elif page['header'] != header:
                    raise ValueError('Report schema changed during export')
                if not isinstance(page.get('csv'), str):
                    raise ValueError('Missing CSV page')
                if page['csv']:
                    output.write(page['csv'] + '\r\n')
                if 'nextOffset' not in page:
                    raise ValueError('Missing nextOffset')
                following = page['nextOffset']
                if following is None:
                    break
                next_source = page.get('nextSourceIndex', source_index)
                if (type(following) is not int or following < 0 or type(next_source) is not int
                        or next_source not in (source_index, source_index + 1)
                        or (next_source == source_index and following <= offset)
                        or (next_source > source_index and following != 0)):
                    raise ValueError('Invalid nextOffset')
                offset, source_index = following, next_source
        os.replace(temporary, destination)
        return destination
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default=os.getenv('OPENIDM_URL', 'http://localhost:8081/openidm'))
    parser.add_argument('--report', required=True, help='Configured report ID')
    parser.add_argument('--output', required=True, type=Path, help='Destination CSV')
    args = parser.parse_args()
    username = os.getenv('OPENIDM_USERNAME', 'openidm-admin')
    password = os.getenv('OPENIDM_PASSWORD')
    if not password:
        parser.error('OPENIDM_PASSWORD environment variable is required')
    print(export_report(args.url, username, password, args.report, args.output))


if __name__ == '__main__':
    main()
