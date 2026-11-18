"""Opt-in history filter/paging test; removes only its own local fixtures."""
import concurrent.futures
import json
import os
import uuid
from urllib.parse import urlencode, quote
from urllib.request import Request, urlopen

BASE = os.getenv('OPENIDM_URL', 'http://localhost:8081/openidm').rstrip('/')
HEADERS = {'X-OpenIDM-Username':os.getenv('OPENIDM_USERNAME','openidm-admin'),
           'X-OpenIDM-Password':os.environ['OPENIDM_PASSWORD'], 'Content-Type':'application/json'}
def api(path, data=None, method=None):
    with urlopen(Request(BASE+'/'+path,headers=HEADERS,method=method,
            data=json.dumps(data).encode() if data is not None else None),timeout=30) as response:
        return json.load(response) if response.status != 204 else None

def report(filters, offset=0, size=50):
    return api('endpoint/governanceReport?'+urlencode({'report':'workflow-history','workflow':'servicePrincipalOwner',
        'filters':json.dumps(filters),'offset':offset,'pageSize':size}))

stamp = uuid.uuid4().hex
prefix = 'report-filter-test-'+stamp
created = []
user = None
try:
    user = api('managed/user?_action=create',{'userName':prefix,'givenName':'Filter','sn':stamp,
        'mail':'filter-fixture@example.invalid','accountStatus':'active'},'POST')
    catalog = api('endpoint/governanceReport?'+urlencode({'dictionary':'people','search':stamp}))
    assert any(item['id']==user['_id'] for item in catalog['items'])
    def create(i):
        identifier = prefix+'-'+str(i)
        body = {'subject':prefix,'subjectName':prefix,'processType':'servicePrincipalOwner','source':'test',
                'status':'accepted' if i>=51 else 'pending','newOwnerId':user['_id'], 'reviewer':prefix,
                'requester':prefix,'decidedBy':prefix if i>=51 else '',
                'createdAt':'2000-01-01T00:00:00.000Z' if i>=51 else '2026-01-01T00:00:00.000Z'}
        api('managed/entraOwnerRequest/'+identifier,body,'PUT')
        created.append(identifier)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(create,range(53)))
    first = report({'subject':prefix})
    assert len(first['rows'])==50 and first['nextOffset']==50
    status_index = first['columns'].index('Status')
    assert all(row[status_index]=='pending' for row in first['rows'])
    second = report({'subject':prefix},50)
    assert len(second['rows'])==3 and second['nextOffset'] is None
    filters={'subject':prefix,'status':'accepted','reviewer':user['_id'],'requester':user['_id'],'decidedBy':user['_id']}
    filtered=report(filters)
    assert len(filtered['rows'])==2
    assert all(row[status_index]=='accepted' for row in filtered['rows'])
    assert {row[0] for row in filtered['rows']}=={prefix+'-51',prefix+'-52'}
    export=report(filters,size=500)
    assert export['rows']==filtered['rows']
    assert len(report({'subject':prefix,'createdAt':{'to':'2001-01-01T00:00:00.000Z'}})['rows'])==2
    print('PASS: dictionary selection, AND filters, date ranges, matches beyond page one, 50-row paging and matching CSV query')
finally:
    for identifier in created:
        api('managed/entraOwnerRequest/'+quote(identifier,safe=''),method='DELETE')
    if user:
        api('managed/user/'+quote(user['_id'],safe=''),method='DELETE')
    print('Removed local history fixtures:',len(created))
