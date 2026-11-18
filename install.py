#!/usr/bin/env python3
# SPDX-License-Identifier: CDDL-1.1
"""Install the read-only auditor CSV export into the local OpenIDM container."""
import argparse
import datetime
import json
import os
from pathlib import Path
import subprocess
import tempfile
import urllib.error
import urllib.request

ASSETS = Path(__file__).resolve().parent / 'assets'
MODULE = 'org/forgerock/openidm/ui/common/workflow/GovernanceReport'
MARKER = '<!-- Governance CSV export -->'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--container', default='openidm')
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--create-role', action='store_true', help='Create internal auditor role using OPENIDM_PASSWORD')
    parser.add_argument('--url', default='http://localhost:8081/openidm')
    parser.add_argument('--username', default='openidm-admin')
    args = parser.parse_args()
    def docker(*cmd):
        return subprocess.check_output(['docker', *cmd])
    if args.create_role and not os.environ.get('OPENIDM_PASSWORD'):
        parser.error('--create-role requires OPENIDM_PASSWORD')
    root = '/opt/openidm/'
    access_path = root + 'script/access.js'
    access = docker('exec', args.container, 'cat', access_path).decode()
    if 'httpAccessConfig' not in access:
        raise ValueError('Unsupported access configuration')
    rule_marker = '// Governance CSV auditor access'
    if rule_marker not in access:
        access += '\n' + rule_marker + '\nhttpAccessConfig.configs.push(' + json.dumps({
            'pattern':'endpoint/governanceReport', 'roles':'openidm-auditor,openidm-admin',
            'methods':'read', 'actions':''}) + ');\n'
    changes = {
        access_path: access,
        root + 'script/workflow/governanceReport.js': (ASSETS / 'governanceReport.js').read_text(),
        root + 'conf/endpoint-governanceReport.json': json.dumps({
            'type':'text/javascript', 'file':'workflow/governanceReport.js'}, indent=2) + '\n'
    }
    for ui in ('selfservice', 'admin'):
        base = root + 'ui/' + ui + '/'
        nav_path = base + 'extension/templates/common/NavigationTemplate.html'
        nav = docker('exec', args.container, 'cat', nav_path).decode()
        if MARKER not in nav:
            nav += '\n' + MARKER + '\n<script>require(["' + MODULE + '"], function (install) { install(); });</script>\n'
        changes[nav_path] = nav
        changes[base + 'extension/' + MODULE + '.js'] = (ASSETS / 'GovernanceReport.js').read_text()
    previous = {}
    for remote, content in changes.items():
        result = subprocess.run(['docker','exec',args.container,'cat',remote],capture_output=True)
        if result.returncode and subprocess.run(['docker','exec',args.container,'test','-e',remote]).returncode == 0:
            raise ValueError('Cannot read ' + remote)
        old = result.stdout.decode() if result.returncode == 0 else None
        if content != old:
            previous[remote] = old
    print('Files to update:', len(previous))
    if args.check:
        print('Validated endpoint, server-side role check and both navigation extensions; no changes made.')
        return
    if previous:
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        backup = root + 'workflow-backups/reporting-' + stamp
        docker('exec',args.container,'mkdir','-p',backup)
        docker('exec',args.container,'chmod','700',backup)
        with tempfile.TemporaryDirectory(prefix='openidm-reporting-') as directory:
            local = Path(directory)
            manifest = []
            for index, (remote, old) in enumerate(previous.items()):
                name = str(index)
                if old is not None:
                    docker('exec',args.container,'cp',remote,backup + '/' + name)
                manifest.append({'path':remote,'backup':name if old is not None else None})
            (local / 'manifest.json').write_text(json.dumps(manifest,indent=2))
            docker('cp',str(local / 'manifest.json'),args.container + ':' + backup + '/manifest.json')
            for index, remote in enumerate(previous):
                file = local / str(index)
                file.write_text(changes[remote])
                docker('exec',args.container,'mkdir','-p',str(Path(remote).parent))
                docker('cp',str(file),args.container + ':' + remote)
        print('Backup:',backup)
    if args.create_role:
        url = args.url.rstrip('/') + '/repo/internal/role/openidm-auditor'
        headers = {'X-OpenIDM-Username':args.username,'X-OpenIDM-Password':os.environ['OPENIDM_PASSWORD'],
                   'Content-Type':'application/json'}
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=30):
                pass
        except urllib.error.HTTPError as error:
            if error.code != 404:
                raise
            headers['If-None-Match'] = '*'
            with urllib.request.urlopen(urllib.request.Request(url,headers=headers,method='PUT',
                    data=json.dumps({'name':'Auditor','description':'Read governance CSV reports'}).encode()),timeout=30):
                pass
        print('Auditor role exists. Assign it only to approved users through authzRoles.')
    print('CSV extension installed. Reload the UI. Requires openidm-auditor or openidm-admin.')
    if not args.create_role:
        print('Role provisioning was not requested; use --create-role with OPENIDM_PASSWORD if needed.')


if __name__ == '__main__':
    main()
