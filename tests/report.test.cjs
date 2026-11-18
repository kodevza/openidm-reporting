const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/reportEndpoint.js'), 'utf8');
const shippedConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/custom-reporting.json'), 'utf8'));
const defaultConfig = {...shippedConfig, defaultReport:'ownership-history', reports:[shippedConfig.reports[0]]};
function run({roles=['openidm-auditor'], params={}, method='read', records=[], config=defaultConfig, wrapped=false, definitions=[], users=[], principals=[]}={}) {
    const wrap = value => wrapped ? {toString(){return JSON.stringify(value);}} : value;
    const calls=[];
    const reads=[];
    const result=vm.runInNewContext(source, {request:{method,additionalParameters:params},
        context:{security:{authorization:{roles}}}, openidm:{
            read(id){reads.push(id); return wrap(config);},
            query(...args){calls.push(args);return wrap({result:args[0] === 'workflow/processdefinition' ? definitions : (args[0] === 'managed/user' ? users : (args[0] === 'managed/entraServicePrincipal' ? principals : records))});}
        }});
    return {result,calls,reads};
}
function secondReport(){
    const config = JSON.parse(JSON.stringify(defaultConfig));
    config.reports.push({
        id:'approval-tasks', title:'Akceptacje', filename:'approval-tasks.csv',
        source:'managed/approvalRecord', filter:'/status eq "closed"',
        columns:[
            {header:'Process',path:'process.id'},
            {header:'Approver',path:'approval.actor.name'},
            {header:'Outcome',path:'status'},
            {header:'Type',value:'approval'}
        ]
    });
    return config;
}
test('ordinary and anonymous users cannot read report or probe capabilities',()=>{
    for (const roles of [[],['openidm-authorized']]) {
        assert.throws(()=>run({roles}), e=>e.code===403);
        assert.throws(()=>run({roles,params:{capabilities:'true'}}), e=>e.code===403);
    }
});
test('capabilities lists configured report IDs without querying records; writes rejected',()=>{
    for(const roles of [['openidm-auditor'],['openidm-admin']]) {
        const {result,calls,reads}=run({roles,params:{capabilities:'true'},config:secondReport()});
        assert.equal(calls.length,0);
        assert.deepEqual(JSON.parse(JSON.stringify(result.reports)), [
            {id:'ownership-history',title:'Ownership History'},
            {id:'approval-tasks',title:'Akceptacje'}
        ]);
        assert.deepEqual(reads,['config/custom/reporting']);
    }
    assert.throws(()=>run({method:'create'}),e=>e.code===405);
});
test('default report retains old ownership CSV columns and prevents formula injection',()=>{
    const {result,calls}=run({records:[{_id:'p1',servicePrincipalName:'Żółć; "app"\nname',
        reason:'  =HYPERLINK("bad")',status:'accepted',password:'secret'}]});
    assert.ok(result.header.startsWith('"processId";'));
    assert.equal(result.filename,'governance-ownership-history.csv');
    assert.ok(result.csv.includes('"Żółć; ""app""\nname"'));
    assert.ok(result.csv.includes('"\'  =HYPERLINK(""bad"")"'));
    assert.ok(!result.csv.includes('secret'));
    assert.ok(result.csv.includes('ownership_assignment'));
    assert.equal(result.nextOffset,null);
    assert.equal(calls[0][0],'managed/entraOwnerRequest');
    assert.equal(calls[0][1]._pageSize,500);
});
test('another process uses its configured source, filter, columns, nested fields and constants',()=>{
    const {result,calls}=run({config:secondReport(),params:{report:'approval-tasks'},records:[{
        process:{id:'abc'},approval:{actor:{name:'John'}},status:'closed',unrelated:'should not export'
    }]});
    assert.equal(result.report,'approval-tasks');
    assert.equal(result.filename,'approval-tasks.csv');
    assert.equal(result.header,'"Process";"Approver";"Outcome";"Type"');
    assert.equal(result.csv,'"abc";"John";"closed";"approval"');
    assert.equal(calls[0][0],'managed/approvalRecord');
    assert.equal(calls[0][1]._queryFilter,'/status eq "closed"');
    assert.deepEqual(JSON.parse(JSON.stringify(calls[0][2])),['_id','process','approval','status']);
});
test('caller cannot override resource or filter and cannot select unknown report',()=>{
    const {calls}=run({config:secondReport(),params:{report:'approval-tasks',
        source:'config',_queryFilter:'true',fields:'password'}});
    assert.equal(calls[0][0],'managed/approvalRecord');
    assert.equal(calls[0][1]._queryFilter,'/status eq "closed"');
    assert.ok(!calls[0][2].includes('password'));
    for (const report of ['none','__proto__','constructor',42]) {
        assert.throws(()=>run({params:{report}}),e=>e.code===400);
    }
});
test('missing, null and structured values export predictably',()=>{
    const config=secondReport();
    config.reports[1].columns=[
        {header:'missing',path:'missing.foo'},
        {header:'null',path:'nil'},
        {header:'nested',path:'payload'}
    ];
    const {result}=run({config,params:{report:'approval-tasks'},records:[
        {nil:null,payload:['a','b']}
    ]});
    assert.equal(result.csv,'"";"";"[""a"",""b""]"');
});
test('paging continues after a full page and validates offsets',()=>{
    assert.equal(run({records:Array(500).fill({_id:'x'})}).result.nextOffset,500);
    assert.equal(run({params:{offset:'500'}}).calls[0][1]._pagedResultsOffset,500);
    for(const offset of ['-1','1.2','x','1 or true','1000000000']) {
        assert.throws(()=>run({params:{offset}}),e=>e.code===400);
    }
});
test('invalid admin configuration fails closed before any query',()=>{
    for (const change of [
        config=>{config.reports[0].source='config/custom/reporting';},
        config=>{config.reports[0].columns[0].path='__proto__.polluted';},
        config=>{config.reports[0].columns[0]={header:'raw',path:'password',value:'leak'};},
        config=>{config.reports[0].filename='../report.csv';},
        config=>{config.reports.push({...config.reports[0]});},
        config=>{config.defaultReport='missing';}
    ]) {
        const config=JSON.parse(JSON.stringify(defaultConfig));
        change(config);
        let queryCalled=false;
        assert.throws(()=>run({config}),e=>e.code===500);
        assert.equal(queryCalled,false);
    }
});

test('OpenIDM JSON wrappers support capabilities and CSV query results',()=>{
    const {result:capabilities}=run({wrapped:true,params:{capabilities:'true'}});
    assert.equal(capabilities.reports[0].id,'ownership-history');
    const {result}=run({wrapped:true,records:[{_id:'wrapped-record',reason:'=formula'}]});
    assert.equal(result.report,'ownership-history');
    assert.ok(result.csv.startsWith('"wrapped-record";'));
    assert.ok(result.csv.includes("'=formula"));
    assert.equal(result.nextOffset,null);
});

test('table and CSV use the same projection without CSV escaping table cells', () => {
    const {result} = run({config:shippedConfig, records:[{_id:'p', subject:'object-id', reason:'=formula', password:'hidden'}]});
    assert.equal(result.report, 'workflow-history');
    assert.equal(result.rows[0][3], 'object-id');
    assert.equal(result.rows[0][10], '=formula');
    assert.ok(result.csv.includes("'=formula"));
    assert.ok(!JSON.stringify(result).includes('hidden'));
    assert.equal(result.columns[3], 'Subject');
});
test('one history report pages across configured workflow collections', () => {
    const config=JSON.parse(JSON.stringify(shippedConfig));
    config.reports[1].sources.push('managed/otherWorkflow');
    const first=run({config,records:[{_id:'a',subject:'app'}]}).result;
    assert.equal(first.nextOffset,0);
    assert.equal(first.nextSourceIndex,1);
    const second=run({config,params:{sourceIndex:'1',offset:'0'},records:[{_id:'b',subject:'group'}]});
    assert.equal(second.calls[0][0],'managed/otherWorkflow');
    assert.equal(second.result.nextOffset,null);
    assert.equal(second.result.rows[0][3],'group');
    const full=run({config,records:Array(500).fill({_id:'a'})}).result;
    assert.equal(full.nextOffset,500);
    assert.equal(full.nextSourceIndex,0);
    for (const sourceIndex of ['-1','2','x','01']) {
        assert.throws(()=>run({config,params:{sourceIndex}}),e=>e.code===400);
    }
    config.reports[1].sources.push('config/authentication');
    assert.throws(()=>run({config}),e=>e.code===500);
});

test('workflow catalog includes available definitions once per key, including workflows without history',()=>{
    const {result,calls}=run({config:shippedConfig,params:{capabilities:'true',workflows:'true'}, definitions:[
        {key:'approval',name:'Approval',version:1}, {key:'approval',name:'Approval',version:2},
        {key:'certification',name:'Certification',version:1}
    ]});
    assert.deepEqual(JSON.parse(JSON.stringify(result.workflows)),[{id:'approval',title:'Approval'},{id:'certification',title:'Certification'}]);
    assert.equal(calls.length,1);
    assert.equal(calls[0][0],'workflow/processdefinition');
    assert.deepEqual(JSON.parse(JSON.stringify(calls[0][2])),['key','name','version']);
    assert.equal(result.columns.find(c=>c.header==='Subject').visible,true);
    assert.equal(result.columns.find(c=>c.header==='Tenant ID').visible,false);
});
test('workflow selection filters authoritative history server-side and rejects unknown keys',()=>{
    const {calls}=run({config:shippedConfig,params:{workflow:'approval'},definitions:[{key:'approval',name:'Approval'}]});
    assert.equal(calls[1][1]._queryFilter,'(true) and /processType eq "approval"');
    assert.throws(()=>run({config:shippedConfig,params:{workflow:'unknown'}}),e=>e.code===400);
    const config=JSON.parse(JSON.stringify(shippedConfig));
    config.reports[1].columns[0].visible='false';
    assert.throws(()=>run({config}),e=>e.code===500);
});

const tenantId='11111111-1111-1111-1111-111111111111';
const entraUserId='22222222-2222-2222-2222-222222222222';
const subjectId='33333333-3333-3333-3333-333333333333';
test('reviewer and deciding actor display full names with tenant-scoped Entra links while preserving original identities',()=>{
    const {result,calls}=run({config:shippedConfig,records:[{_id:'p',subject:subjectId,subjectType:'servicePrincipal',source:'entra',tenantId,
        newOwnerId:'local-account',reviewer:'pre-login-name',decidedBy:'oidc-subject'}],
        users:[{givenName:'Ada',sn:'Lovelace',displayName:'Different label',entraObjectId:entraUserId,entraTenantId:tenantId}],
        principals:[{sourceId:subjectId,tenantId,appId:'44444444-4444-4444-4444-444444444444',servicePrincipalType:'Application'}]});
    const reviewer=result.columns.indexOf('Reviewer'), actor=result.columns.indexOf('Decided By'), subject=result.columns.indexOf('Subject');
    assert.equal(result.rows[0][reviewer],'Ada Lovelace');
    assert.equal(result.rows[0][actor],'Ada Lovelace');
    assert.equal(result.rawRows[0][actor],'oidc-subject');
    assert.equal(result.rawRows[0][reviewer],'pre-login-name');
    assert.equal(result.links[0][reviewer],`https://entra.microsoft.com/${tenantId}/#view/Microsoft_AAD_UsersAndTenants/UserProfileMenuBlade/~/overview/userId/${entraUserId}`);
    assert.ok(result.links[0][subject].includes('ManagedAppMenuBlade/~/Overview/objectId/'+subjectId+'/appId/'));
    assert.ok(!result.links[0][reviewer].includes('local-account'));
    assert.ok(result.csv.includes('Ada Lovelace'));
    const lookup=calls.find(c=>c[0]==='managed/user');
    assert.ok(lookup[1]._queryFilter.includes('/_id eq "local-account"'));
    assert.ok(lookup[1]._queryFilter.includes('/entraTenantId eq "'+tenantId+'"'));
    assert.ok(!lookup[2].includes('password'));
});
test('missing, ambiguous and cross-tenant users retain original text without an Entra link',()=>{
    for(const users of [[],[{},{}],[{givenName:'Wrong',sn:'Tenant',entraObjectId:entraUserId,entraTenantId:subjectId}]]) {
        const {result}=run({config:shippedConfig,records:[{_id:'p',decidedBy:'actor',tenantId}],users});
        const i=result.columns.indexOf('Decided By');
        assert.equal(result.rows[0][i],'actor');assert.equal(result.links[0][i],null);
    }
    const {result}=run({config:shippedConfig,records:[{_id:'p',decidedBy:'local-user'}],users:[{givenName:'Local',sn:'User'}]});
    const i=result.columns.indexOf('Decided By');assert.equal(result.rows[0][i],'Local User');assert.equal(result.links[0][i],null);
});
test('links reject unknown sources, unsupported types and invalid identifiers; pending decisions remain empty',()=>{
    for(const change of [{source:'other'},{tenantId:'javascript:alert(1)'},{subject:'not-an-entra-id'},{subjectType:'unknown'}]) {
        const {result}=run({config:shippedConfig,records:[{_id:'p',source:'entra',tenantId,subject:subjectId,subjectType:'servicePrincipal',...change}]});
        assert.equal(result.links[0][result.columns.indexOf('Subject')],null);
        assert.equal(result.rows[0][result.columns.indexOf('Decided By')],'');
    }
});
test('identity lookups escape filter literals, cache repeats and validate presentation paths',()=>{
    const identity='name" or true or /userName eq "other';
    const {calls}=run({config:shippedConfig,records:[{decidedBy:identity},{decidedBy:identity}]});
    const lookups=calls.filter(c=>c[0]==='managed/user');
    assert.equal(lookups.length,1);
    assert.ok(lookups[0][1]._queryFilter.includes(JSON.stringify(identity)));
    const config=JSON.parse(JSON.stringify(shippedConfig));
    config.reports[1].columns.find(c=>c.header==='Reviewer').presentation.localIdPath='__proto__.secret';
    assert.throws(()=>run({config}),e=>e.code===500);
});

test('service principal deep links include the application ID and actual principal type',()=>{
    const appId='44444444-4444-4444-4444-444444444444';
    const {result}=run({config:shippedConfig,records:[{source:'entra',tenantId,subject:subjectId,subjectType:'servicePrincipal'}],
        principals:[{sourceId:subjectId,tenantId,appId,servicePrincipalType:'ManagedIdentity'}]});
    const href=result.links[0][result.columns.indexOf('Subject')];
    assert.ok(href.includes('/appId/'+appId));
    assert.ok(href.includes('/servicePrincipalType/ManagedIdentity/'));
    assert.ok(href.includes('/objectId/'+subjectId));
});

test('service principal links fail closed for missing, ambiguous or mismatched inventory',()=>{
    const principal={sourceId:subjectId,tenantId,appId:'44444444-4444-4444-4444-444444444444',servicePrincipalType:'Application'};
    for(const principals of [[],[principal,principal],[{...principal,appId:'bad'}],[{...principal,tenantId:subjectId}]]) {
        const {result}=run({config:shippedConfig,records:[{source:'entra',tenantId,subject:subjectId,subjectType:'servicePrincipal'}],principals});
        assert.equal(result.links[0][result.columns.indexOf('Subject')],null);
    }
});

test('people dictionary is paged and searches names without reading report rows',()=>{
    const users=Array.from({length:21},(_,i)=>({_id:'user-'+i,givenName:'Ada',sn:'Lovelace',password:'hidden'}));
    const {result,calls}=run({params:{dictionary:'people',search:'Ada Love'},users});
    assert.equal(result.items.length,20);assert.equal(result.nextOffset,20);
    assert.equal(result.items[0].title,'Ada Lovelace');
    assert.equal(calls.length,1);assert.equal(calls[0][0],'managed/user');
    assert.equal(calls[0][1]._pageSize,21);
    assert.ok(calls[0][1]._queryFilter.includes('/sn sw "Love"'));
    assert.ok(!JSON.stringify(result).includes('hidden'));
    assert.throws(()=>run({roles:[],params:{dictionary:'people'}}),e=>e.code===403);
});
test('column filters and page size are pushed into the source query before pagination',()=>{
    const {calls,result}=run({config:shippedConfig,params:{pageSize:'50',offset:'50',filters:JSON.stringify({subject:'abc" or true',status:'accepted',createdAt:{from:'2026-01-01T00:00:00.000Z'}})},records:Array(51).fill({_id:'x'})});
    const query=calls.find(c=>c[0]==='managed/entraOwnerRequest')[1];
    assert.equal(query._pageSize,51);assert.equal(query._pagedResultsOffset,50);assert.equal(query._sortKeys,'-createdAt,-_id');
    assert.ok(query._queryFilter.includes('/subject sw '+JSON.stringify('abc" or true')));
    assert.ok(query._queryFilter.includes('/status eq "accepted"'));
    assert.ok(query._queryFilter.includes('/createdAt ge "2026-01-01T00:00:00.000Z"'));
    assert.equal(result.nextOffset,100);
});
test('person filters use selected account IDs and recorded login aliases, not display names',()=>{
    const users=[{_id:'person-id',userName:'oidc-now',entraOidcSubject:'oidc-now',entraWorkflowAliases:['oidc-old']}];
    const {calls}=run({config:shippedConfig,params:{filters:JSON.stringify({reviewer:'person-id',requester:'person-id',decidedBy:'person-id'})},users});
    const query=calls.find(c=>c[0]==='managed/entraOwnerRequest')[1]._queryFilter;
    assert.ok(query.includes('/newOwnerId eq "person-id"'));assert.ok(query.includes('/decidedBy eq "oidc-old"'));assert.ok(query.includes('/requester eq "oidc-now"'));
    assert.equal(calls.filter(c=>c[0]==='managed/user').length,1);
});
test('unknown fields, invalid dictionaries and malformed date ranges fail closed',()=>{
    for(const filters of [{password:'x'},{status:'acceptate'},{reviewer:'unknown'},{createdAt:{from:'bad'}},{createdAt:{from:'2026-02-01T00:00:00.000Z',to:'2026-01-01T00:00:00.000Z'}},[]]) {
        assert.throws(()=>run({config:shippedConfig,params:{filters:JSON.stringify(filters)}}),e=>e.code===400);
    }
    assert.throws(()=>run({config:shippedConfig,params:{pageSize:'100000'}}),e=>e.code===400);
});
