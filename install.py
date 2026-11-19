#!/usr/bin/env python3
# SPDX-License-Identifier: CDDL-1.1
"""Install the config-driven, read-only CSV reports into the local OpenIDM container."""
import argparse
import datetime
import hashlib
import re
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
WORKFLOW_UI = MODULE.rsplit('/', 1)[0]
MY_TASKS_MARKER = '<!-- Reporting My Tasks -->'
REPORT_STYLESHEET = 'css/workflow-history.css'


def register_my_tasks(html):
    html = re.sub(r'<!-- Reporting My Tasks -->\n<script>[^\n]*</script>\n', '', html)
    anchor = '<script data-main='
    if anchor not in html:
        raise ValueError('Unsupported UI index: RequireJS startup not found')
    loader = (
        MY_TASKS_MARKER + '\n<script>(function (startup) { '
        'var config = startup.config || (startup.config = {}); '
        f'var reporting = config[{json.dumps(MODULE)}] || (config[{json.dumps(MODULE)}] = {{}}); '
        'reporting.myTasks = true; '
        '}(require));</script>\n'
    )
    return html.replace(anchor, loader + anchor, 1)


def version_reporting_assets(html, version):
    def replace(match):
        value = re.sub(r'&reporting=[^&"\']*', '', match.group(2))
        return match.group(1) + value + '&reporting=' + version + match.group(3)
    updated, count = re.subn(r'(urlArgs\s*:\s*["\'])([^"\']*)(["\'])', replace, html)
    if count != 1:
        raise ValueError('Expected exactly one RequireJS urlArgs in UI index.html')
    return updated


def link_reporting_stylesheet(html, version):
    link = f'<link rel="stylesheet" href="{REPORT_STYLESHEET}?reporting={version}">'
    existing = r'<link rel="stylesheet" href="' + re.escape(REPORT_STYLESHEET) + r'\?reporting=[^"]*">'
    updated, count = re.subn(existing, link, html)
    if count:
        return updated
    updated, count = re.subn(r'(?im)^([ \t]*)(</head>)', r'\1' + link + r'\n\1\2', html, count=1)
    if count != 1:
        raise ValueError('Unsupported UI index: closing head tag not found')
    return updated


def merge_report_config(existing, defaults):
    """Add the common history profile without replacing administrator-owned profiles."""
    import copy
    result = copy.deepcopy(existing)
    profiles = result['reports']
    if not any(p['id'] == 'workflow-history' for p in profiles):
        profiles.append(copy.deepcopy(next(p for p in defaults['reports'] if p['id'] == 'workflow-history')))
        if existing == {'defaultReport':'ownership-history', 'reports':[defaults['reports'][0]]}:
            result['defaultReport'] = 'workflow-history'
    return result


def merge_history_indexes(existing, additions):
    import copy
    result = copy.deepcopy(existing)
    classes = result['dbStructure']['orientdbClass']
    for name, indexes in additions.items():
        if name not in classes:
            raise ValueError('Missing workflow history class: ' + name)
        current = classes[name].setdefault('index', [])
        for index in indexes:
            keys = index.get('propertyNames', [index.get('propertyName')])
            if not any(item.get('propertyNames', [item.get('propertyName')]) == keys for item in current):
                current.append(copy.deepcopy(index))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--container', default='openidm')
    parser.add_argument('--install-indexes', action='store_true', help='Merge reporting indexes into the existing OrientDB configuration')
    parser.add_argument('--reload', action='store_true', help='Compile the updated endpoint immediately using OPENIDM_PASSWORD')
    parser.add_argument('--sync-defaults', action='store_true', help='Apply the repository workflow-history profile, including default column visibility')
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--create-role', action='store_true', help='Create internal auditor role using OPENIDM_PASSWORD')
    parser.add_argument('--url', default='http://localhost:8081/openidm')
    parser.add_argument('--username', default='openidm-admin')
    args = parser.parse_args()
    def docker(*cmd):
        return subprocess.check_output(['docker', *cmd])
    if (args.create_role or args.reload) and not os.environ.get('OPENIDM_PASSWORD'):
        parser.error('--create-role and --reload require OPENIDM_PASSWORD')
    generated_assets = (
        'historyApp.js', 'historyApp.css', 'historyApp.LICENSE.txt',
        'historyView.js', 'reportEndpoint.js', 'reportUI.js',
    )
    missing_assets = [name for name in generated_assets if not (ASSETS / name).is_file()]
    if missing_assets:
        parser.error(f'Missing build assets: {", ".join(missing_assets)}. Run npm ci && npm run build before installing.')
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
    personal_marker = '// Personal workflow reporting access'
    if personal_marker not in access:
        access += '\n' + personal_marker + '\nhttpAccessConfig.configs.push(' + json.dumps({
            'pattern':'endpoint/governanceReport', 'roles':'openidm-authorized',
            'methods':'read', 'actions':'',
            'customAuthz':"request.additionalParameters.myTasks === 'true'"}) + ');\n'
    changes = {
        access_path: access,
        root + 'script/workflow/governanceReport.js': (ASSETS / 'reportEndpoint.js').read_text(),
        root + 'conf/endpoint-governanceReport.json': json.dumps({
            'type':'text/javascript', 'file':'workflow/governanceReport.js'}, indent=2) + '\n'
    }
    if args.install_indexes:
        repo_path = root + 'conf/repo.orientdb.json'
        existing_repo = json.loads(docker('exec', args.container, 'cat', repo_path))
        merged_repo = merge_history_indexes(existing_repo, json.loads((ASSETS / 'history-indexes.json').read_text()))
        if merged_repo != existing_repo:
            changes[repo_path] = json.dumps(merged_repo, indent=2) + '\n'
    # Add a missing built-in profile while preserving administrator-defined reports.
    config_path = root + 'conf/custom-reporting.json'
    defaults = json.loads((ASSETS / 'custom-reporting.json').read_text())
    if subprocess.run(['docker','exec',args.container,'test','-e',config_path]).returncode != 0:
        changes[config_path] = json.dumps(defaults, indent=2) + '\n'
    else:
        existing = json.loads(docker('exec', args.container, 'cat', config_path))
        merged = merge_report_config(existing, defaults)
        if args.sync_defaults:
            profile = next(p for p in defaults['reports'] if p['id'] == 'workflow-history')
            merged['reports'] = [profile if p['id'] == 'workflow-history' else p for p in merged['reports']]
            merged['defaultReport'] = 'workflow-history'
            for p in merged['reports']:
                if p['id'] == 'ownership-history' and p['title'] == 'Historia zmian ownershipu':
                    p['title'] = 'Ownership History'
        if merged != existing:
            changes[config_path] = json.dumps(merged, indent=2) + '\n'
    for ui in ('selfservice', 'admin'):
        base = root + 'ui/' + ui + '/'
        nav_path = base + 'extension/templates/common/NavigationTemplate.html'
        nav = docker('exec', args.container, 'cat', nav_path).decode()
        if MARKER not in nav:
            nav += '\n' + MARKER + '\n<script>require(["' + MODULE + '"], function (install) { install(); });</script>\n'
        changes[nav_path] = nav
        # Register on startup as well as navigation so bookmarked pages and reloads work.
        index_path = base + 'extension/index.html'
        result = subprocess.run(['docker','exec',args.container,'cat',index_path],capture_output=True)
        index = result.stdout.decode() if result.returncode == 0 else docker('exec', args.container, 'cat', base + 'default/index.html').decode()
        startup_marker = '<!-- Workflow history startup -->'
        if startup_marker not in index:
            bootstrap = startup_marker + '\n<script>(function (config) { var previous = config.callback; config.callback = function () { ' + \
                'if (previous) { previous.apply(this, arguments); } require(["' + MODULE + '"], function (install) { install(); }); ' + \
                '}; }(require));</script>\n'
            anchor = '<script data-main='
            if anchor not in index:
                raise ValueError('Unsupported UI index: RequireJS startup not found')
            index = index.replace(anchor, bootstrap + anchor, 1)
        versioned_assets = ['reportUI.js', 'historyView.js', 'historyApp.js', 'historyApp.css', 'WorkflowHistory.html']
        if ui == 'selfservice':
            index = register_my_tasks(index)
            changes[base + 'extension/' + WORKFLOW_UI + '/ReportingMyTasks.js'] = None
        version = hashlib.sha256(b''.join((ASSETS / name).read_bytes() for name in versioned_assets)).hexdigest()[:16]
        changes[index_path] = link_reporting_stylesheet(version_reporting_assets(index, version), version)
        changes[base + 'extension/' + REPORT_STYLESHEET] = (ASSETS / 'historyApp.css').read_text()
        # Remove the loader from the superseded footer registration if it exists.
        footer_path = base + 'extension/templates/common/FooterTemplate.html'
        result = subprocess.run(['docker','exec',args.container,'cat',footer_path],capture_output=True)
        if result.returncode == 0 and MARKER in result.stdout.decode():
            footer = result.stdout.decode()
            loader = '\n' + MARKER + '\n<script>require(["' + MODULE + '"], function (install) { install(); });</script>\n'
            changes[footer_path] = footer.replace(loader, '')
        changes[base + 'extension/' + MODULE + '.js'] = (ASSETS / 'reportUI.js').read_text()
        changes[base + 'extension/' + MODULE.rsplit('/', 1)[0] + '/WorkflowHistory.js'] = (ASSETS / 'historyView.js').read_text()
        changes[base + 'extension/' + MODULE.rsplit('/', 1)[0] + '/WorkflowHistoryApp.js'] = (ASSETS / 'historyApp.js').read_text()
        changes[base + 'extension/' + MODULE.rsplit('/', 1)[0] + '/WorkflowHistoryApp.LICENSE.txt'] = (ASSETS / 'historyApp.LICENSE.txt').read_text()
        changes[base + 'extension/templates/reports/WorkflowHistory.html'] = (ASSETS / 'WorkflowHistory.html').read_text()
        # Old React AMD modules are obsolete after the Preact migration.
        for legacy in ('WorkflowHistoryReact.js', 'WorkflowHistoryReact.LICENSE.txt'):
            changes[base + 'extension/' + MODULE.rsplit('/', 1)[0] + '/' + legacy] = None
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
        print('Validated endpoint, report config installation, access rule and navigation extensions; no changes made.')
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
                content = changes[remote]
                if content is None:
                    docker('exec', args.container, 'rm', '-f', remote)
                    continue
                file = local / str(index)
                file.write_text(content)
                docker('exec',args.container,'mkdir','-p',str(Path(remote).parent))
                docker('cp',str(file),args.container + ':' + remote)
        print('Backup:',backup)
    if args.reload:
        headers = {'X-OpenIDM-Username':args.username, 'X-OpenIDM-Password':os.environ['OPENIDM_PASSWORD'],
                   'Content-Type':'application/json'}
        request = urllib.request.Request(args.url.rstrip('/') + '/script?_action=compile', headers=headers,
            data=json.dumps({'type':'text/javascript','file':'workflow/governanceReport.js'}).encode(), method='POST')
        with urllib.request.urlopen(request, timeout=30) as response:
            if json.load(response) is not True:
                raise RuntimeError('Endpoint compilation did not succeed')
        print('Updated reporting endpoint compiled and active.')
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
    print('Workflow History and Self Service My Tasks installed. Reload the UI.')
    print('Report profiles: ' + config_path + ' (existing configuration is preserved).')
    if not args.create_role:
        print('Role provisioning was not requested; use --create-role with OPENIDM_PASSWORD if needed.')


if __name__ == '__main__':
    main()
