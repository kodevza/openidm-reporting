const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../assets/governanceReport.js'), 'utf8');
function run({roles=['openidm-auditor'], params={}, method='read', records=[]}={}) {
    const calls=[];
    const result=vm.runInNewContext(source, {request:{method,additionalParameters:params},
        context:{security:{authorization:{roles}}}, openidm:{query(...args){calls.push(args);return {result:records};}}});
    return {result,calls};
}
test('ordinary and anonymous users cannot read report or probe capabilities',()=>{
    for (const roles of [[],['openidm-authorized']]) {
        assert.throws(()=>run({roles}), e=>e.code===403);
        assert.throws(()=>run({roles,params:{capabilities:'true'}}), e=>e.code===403);
    }
});
test('capabilities probe does not read records; writes rejected',()=>{
    for(const roles of [['openidm-auditor'],['openidm-admin']]) {
        assert.equal(run({roles,params:{capabilities:'true'}}).calls.length,0);
    }
    assert.throws(()=>run({method:'create'}),e=>e.code===405);
});
test('CSV preserves quotes, semicolons, newlines, Unicode and blocks formulas',()=>{
    const {result,calls}=run({records:[{_id:'p1',servicePrincipalName:'Żółć; "app"\nname',reason:'  =HYPERLINK("bad")',status:'accepted',password:'secret',decidedAt:'2026-11-18T10:00:00Z'}]});
    assert.ok(result.csv.includes('"Żółć; ""app""\nname"'));
    assert.ok(result.csv.includes('"\'  =HYPERLINK(""bad"")"'));
    assert.ok(!result.csv.includes('secret'));
    assert.ok(result.csv.includes('ownership_assignment'));
    assert.equal(result.nextOffset,null);
    assert.equal(calls[0][1]._pageSize,500);
});
test('paging continues after a full page and validates offsets',()=>{
    assert.equal(run({records:Array(500).fill({_id:'x'})}).result.nextOffset,500);
    assert.equal(run({params:{offset:'500'}}).calls[0][1]._pagedResultsOffset,500);
    for(const offset of ['-1','1.2','x','1 or true','1000000000']) {
        assert.throws(()=>run({params:{offset}}),e=>e.code===400);
    }
});
