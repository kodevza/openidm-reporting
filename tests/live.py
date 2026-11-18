"""Live authorization/export check with disposable local accounts; no Graph writes."""
import json
import os
import secrets
import urllib.error
import urllib.request
import uuid

BASE = os.environ.get('OPENIDM_URL', 'http://localhost:8081/openidm').rstrip('/')
ADMIN = (os.environ.get('OPENIDM_USERNAME', 'openidm-admin'), os.environ['OPENIDM_PASSWORD'])


def call(path, identity=None, body=None, method='GET'):
    headers = {'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest',
               'X-OpenIDM-NoSession': 'true'}
    if identity:
        headers.update({'X-OpenIDM-Username': identity[0], 'X-OpenIDM-Password': identity[1]})
    if method == 'DELETE':
        status, current = call(path, identity)
        if status != 200:
            return status, current
        headers['If-Match'] = current['_rev']
    if method == 'PUT':
        headers['If-None-Match'] = '*'
    request = urllib.request.Request(BASE + '/' + path, headers=headers, method=method,
        data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)


created = []
try:
    identities = {}
    for role in ('openidm-authorized', 'openidm-auditor'):
        name = 'report-test-' + uuid.uuid4().hex
        password = secrets.token_urlsafe(30)
        roles = ['openidm-authorized'] + ([role] if role != 'openidm-authorized' else [])
        status, _ = call('repo/internal/user/' + name, ADMIN, {
            'userName': name, 'password': password,
            'roles': [{'_ref': 'repo/internal/role/' + item} for item in roles]}, 'PUT')
        assert status in (200, 201), ('Fixture creation failed', status)
        created.append(name)
        identities[role] = (name, password)
    assert call('endpoint/governanceReport')[0] == 401
    assert call('endpoint/governanceReport', identities['openidm-authorized'])[0] == 403
    assert call('endpoint/governanceReport?capabilities=true', identities['openidm-authorized'])[0] == 403
    auditor = identities['openidm-auditor']
    cap_status, capabilities = call('endpoint/governanceReport?capabilities=true', auditor)
    assert cap_status == 200
    catalog_status, catalog = call('endpoint/governanceReport?capabilities=true&workflows=true', auditor)
    assert catalog_status == 200
    assert any(item['id'] == 'servicePrincipalOwner' for item in catalog['workflows'])
    status, filtered = call('endpoint/governanceReport?report=workflow-history&workflow=servicePrincipalOwner', auditor)
    assert status == 200
    assert 'Subject' in filtered['columns']
    workflow_column = filtered['columns'].index('Workflow')
    assert all(row[workflow_column] == 'servicePrincipalOwner' for row in filtered['rows'])
    assert call('endpoint/governanceReport?report=workflow-history&workflow=unknown', auditor)[0] == 400

    assert any(item['id'] == 'ownership-history' for item in capabilities['reports'])
    status, report = call('endpoint/governanceReport?report=ownership-history&offset=0', auditor)
    assert status == 200, ('Auditor export failed', status)
    assert report['filename'].endswith('.csv')
    assert report['header'].startswith('"processId";')
    assert isinstance(report['csv'], str)
    assert call('managed/entraOwnerRequest?_queryFilter=true', auditor)[0] == 403
    assert call('endpoint/governanceReport?offset=-1', auditor)[0] == 400
    assert call('endpoint/governanceReport?report=not-configured', auditor)[0] == 400
    assert call('endpoint/governanceReport', ADMIN)[0] == 200
    print('PASS: anonymous 401, ordinary user 403, auditor/admin CSV 200, raw data denied, invalid offset 400')
    print('CSV payload bytes:', len(report['csv'].encode('utf-8')))
finally:
    failed = []
    for name in created:
        if call('repo/internal/user/' + name, ADMIN, method='DELETE')[0] not in (200, 204):
            failed.append(name)
    if failed:
        raise RuntimeError('Fixture cleanup failed: ' + ', '.join(failed))
    print('Disposable local accounts removed:', len(created))
