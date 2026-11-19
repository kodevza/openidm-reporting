const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<div id="content"></div>',{url:'http://localhost/admin/'});
for(const name of ['window','document','HTMLElement','MutationObserver','localStorage'])global[name]=dom.window[name];
Object.defineProperty(global,'navigator',{value:dom.window.navigator,configurable:true});
const {h,render:renderPreact}=require('preact');
const {act}=require('preact/test-utils');
const {fireEvent,waitFor,screen}=require('@testing-library/dom');
const mounted=new Set();
function render(vnode) {
 const container=document.createElement('div');document.body.appendChild(container);
 act(()=>renderPreact(vnode,container));mounted.add(container);
 function unmount() {if(!mounted.delete(container))return;act(()=>renderPreact(null,container));container.remove();}
 return {container,unmount};
}
function cleanup() {for(const container of [...mounted]){act(()=>renderPreact(null,container));container.remove();mounted.delete(container);}}
const path=require('node:path');
const fs=require('node:fs');
const {buildSync}=require('esbuild');
const root=path.join(__dirname,'..');
const stylesheet=document.createElement('style');
stylesheet.textContent=fs.readFileSync(path.join(root,'assets/historyApp.css'),'utf8');
document.head.appendChild(stylesheet);
const output=path.join(root,'node_modules/.cache/history-ui-tests.cjs');
buildSync({stdin:{contents:"export {HistoryApp} from './src/ui/history/HistoryApp'; export {exportHistory} from './src/ui/history/export'; export {mount} from './src/ui/mount';",resolveDir:root,loader:'ts'},outfile:output,tsconfig:path.join(root,'tsconfig.ui.json'),jsx:'automatic',bundle:true,platform:'node',format:'cjs',external:['preact','preact/*']});
const {HistoryApp,exportHistory,mount}=require(output);
const catalog={workflows:[{id:'approval',title:'Approval Workflow'},{id:'certification',title:'Certification'}],columns:[
 {header:'Subject',visible:true,key:'subject',filterType:'text'},
 {header:'Status',visible:true,key:'status',filterType:'enum',filterValues:[{id:'accepted',title:'Accepted'},{id:'rejected',title:'Rejected'}]},
 {header:'Reviewer',visible:true,key:'reviewer',filterType:'person'},
 {header:'Tenant ID',visible:false,key:'tenantId'}]};
function page(rows,extra={}){return {report:'workflow-history',columns:catalog.columns.map(c=>c.header),rows,header:'"Subject";"Status";"Reviewer";"Tenant ID"',csv:'"id";"accepted";"Ada";"tenant"',filename:'workflow-history.csv',nextOffset:null,nextSourceIndex:null,...extra};}
function setup(fetch=()=>Promise.resolve(page([['id','accepted','Ada','tenant']])),reportCatalog=catalog) {
 const calls=[];
 const request=uri=>{calls.push(uri);if(uri.includes('capabilities=true'))return Promise.resolve(reportCatalog);
  if(uri.includes('dictionary=people'))return Promise.resolve({items:[{id:'person-id',title:'Ada Lovelace',description:'ada@example.test'}],nextOffset:null});return fetch(uri);};
 const view=render(h(HistoryApp,{request}));return {...view,calls,request};
}
async function choose(value='approval'){await screen.findByLabelText('Workflow');await act(async()=>{fireEvent.change(screen.getByLabelText('Workflow'),{target:{value}});});}
afterEach(()=>{cleanup();localStorage.clear();});
test('actual Preact mount/unmount owns only its legacy host node',async()=>{
 const node=document.createElement('div');document.body.appendChild(node);
 const unmount=mount(node,async()=>catalog);
 await waitFor(()=>assert.ok(node.querySelector('#history-workflow')));
 await act(async()=>unmount());
 assert.equal(node.childElementCount,0);
 node.remove();
});
test('workflow history defaults to All workflows and loads combined history',async()=>{
 const ui=setup();
 const workflow=await screen.findByLabelText('Workflow');
 assert.equal(workflow.value,'*');
 assert.equal(workflow.selectedOptions[0].textContent,'All workflows');
 await screen.findByText('id');
 const uri=ui.calls.find(uri=>uri.includes('report='));
 assert.equal(new URL(uri,'http://local').searchParams.get('workflow'),null);
 assert.equal(screen.getByRole('button',{name:'Download CSV'}).disabled,false);
});
test('Preact and TanStack render inline rows, safe links and the existing workflow catalog',async()=>{
 const href='https://entra.microsoft.com/11111111-1111-1111-1111-111111111111/#view/Microsoft_AAD_UsersAndTenants/UserProfileMenuBlade/~/overview/userId/22222222-2222-2222-2222-222222222222';
 const ui=setup(()=>Promise.resolve(page([['<img src=x>','accepted','Ada Lovelace','tenant']],{links:[[null,null,href,null]],rawRows:[['<img src=x>','accepted','oidc-subject','tenant']]})));
 await choose();await screen.findByText('<img src=x>');
 assert.equal(ui.container.querySelector('img'),null);
 assert.equal(ui.container.querySelector('[data-table-engine]').dataset.tableEngine,'tanstack-preact-table');
 const link=screen.getByRole('link',{name:'Ada Lovelace'});assert.equal(link.href,href);assert.equal(link.rel,'noopener noreferrer');assert.match(link.title,/oidc-subject/);
 assert.equal(screen.getByRole('option',{name:'Certification'}).value,'certification');
 assert.equal(ui.container.querySelectorAll('th').length,3);
});
test('status links to the task even when Process ID is hidden',async()=>{
 const columns=[...catalog.columns,{header:'Process ID',visible:false,key:'_id',filterType:'text'}];
 setup(()=>Promise.resolve(page([
  ['has-id','accepted','Ada','tenant','123'],
  ['missing-id','rejected','Ada','tenant',null]
 ],{columns:columns.map(column=>column.header),taskIds:['456',null]})),{...catalog,columns});
 const status=await screen.findByRole('link',{name:'accepted'});
 assert.equal(status.getAttribute('href'),'../admin/#workflow/taskinstance/456');
 assert.equal(screen.queryByRole('link',{name:'rejected'}),null);
 act(()=>fireEvent.click(screen.getByRole('button',{name:'Configure columns'})));
 act(()=>fireEvent.click(screen.getByRole('checkbox',{name:'Process ID'})));
 assert.equal(screen.getByRole('link',{name:'123'}).getAttribute('href'),'../admin/#workflow/processinstance/123');
});
test('TanStack filters serialize stable person IDs, status and text with server paging',async()=>{
 const ui=setup();await choose();await screen.findByText('id');
 act(()=>fireEvent.click(screen.getByRole('button',{name:'Filter Reviewer'})));
 act(()=>fireEvent.click(screen.getByRole('button',{name:'Filter Status'})));
 act(()=>fireEvent.click(screen.getByRole('button',{name:'Filter Subject'})));
 act(()=>fireEvent.click(screen.getByLabelText('Reviewer')));
 await screen.findByRole('option',{name:'Ada Lovelace ada@example.test'});
 act(()=>fireEvent.click(screen.getByRole('option',{name:'Ada Lovelace ada@example.test'})));
 fireEvent.change(screen.getByLabelText('Status'),{target:{value:'accepted'}});
 fireEvent.input(screen.getByLabelText('Subject ID'),{target:{value:'abc'}});
 await waitFor(()=>{const uri=ui.calls.filter(u=>u.includes('report=')).at(-1),params=new URL(uri,'http://local').searchParams;
  assert.deepEqual(JSON.parse(params.get('filters')),{reviewer:'person-id',status:'accepted',subject:'abc'});assert.equal(params.get('pageSize'),'50');assert.equal(params.get('offset'),'0');});
 fireEvent.click(screen.getByRole('button',{name:'Clear filters'}));
 await waitFor(()=>assert.equal(new URL(ui.calls.filter(u=>u.includes('report=')).at(-1),'http://local').searchParams.get('filters'),'{}'));
});
test('filters live beneath their columns and hidden filters remain removable with controls collapsed',async()=>{
 const ui=setup();await choose();await screen.findByText('id');
 assert.equal(screen.queryByLabelText('Subject ID'),null);
 act(()=>fireEvent.click(screen.getByRole('button',{name:'Filter Subject'})));
 assert.equal(screen.queryByLabelText('Status'),null);
 const input=screen.getByLabelText('Subject ID');
 assert.ok(input.closest('thead'));
 assert.equal(input.closest('th').cellIndex,0);
 assert.ok([...ui.container.querySelectorAll('thead th')].every(header=>window.getComputedStyle(header).verticalAlign==='top'));
 fireEvent.input(input,{target:{value:'abc'}});
 await waitFor(()=>assert.equal(JSON.parse(new URL(ui.calls.filter(u=>u.includes('report=')).at(-1),'http://local').searchParams.get('filters')).subject,'abc'));
 act(()=>fireEvent.click(screen.getByRole('button',{name:'Filter Subject'})));
 assert.equal(screen.queryByLabelText('Subject ID'),null);
 assert.ok(screen.getByRole('button',{name:'Remove Subject filter'}));
 act(()=>fireEvent.click(screen.getByRole('button',{name:'Configure columns'})));
 act(()=>fireEvent.click(screen.getByRole('checkbox',{name:'Subject'})));
 assert.equal(screen.queryByLabelText('Subject ID'),null);
 assert.match(screen.getByRole('button',{name:'Remove Subject filter'}).textContent,/hidden column/);
 fireEvent.click(screen.getByRole('button',{name:'Remove Subject filter'}));
 await waitFor(()=>assert.equal(new URL(ui.calls.filter(u=>u.includes('report=')).at(-1),'http://local').searchParams.get('filters'),'{}'));
 assert.equal(screen.queryByRole('group',{name:'Active column filters'}),null);
});
test('column visibility uses TanStack state and preserves/reset browser preferences',async()=>{
 const ui=setup();await choose();await screen.findByText('id');
 act(()=>fireEvent.click(screen.getByRole('button',{name:'Configure columns'})));
 act(()=>fireEvent.click(screen.getByRole('checkbox',{name:'Tenant ID'})));
 assert.equal(ui.container.querySelectorAll('th').length,4);
 ui.unmount();const next=setup();await screen.findByLabelText('Workflow');
 assert.equal(next.container.querySelectorAll('th').length,4);
 act(()=>fireEvent.click(screen.getByRole('button',{name:'Configure columns'})));act(()=>fireEvent.click(screen.getByRole('button',{name:'Reset to defaults'})));
 assert.equal(next.container.querySelectorAll('th').length,3);assert.equal(localStorage.getItem('openidm.workflow-history.columns.v1'),null);
});
test('manual pagination navigates source cursors and resets when filters change',async()=>{
 const ui=setup(uri=>Promise.resolve(new URL(uri,'http://local').searchParams.get('sourceIndex')==='1'?page([['second','accepted','Ada','tenant']]):page([['first','accepted','Ada','tenant']],{nextOffset:0,nextSourceIndex:1})));
 await choose();await screen.findByText('first');fireEvent.click(screen.getByRole('button',{name:'Next'}));await screen.findByText('second');
 assert.equal(screen.getByRole('button',{name:'Next'}).disabled,true);
 fireEvent.click(screen.getByRole('button',{name:'Previous'}));await screen.findByText('first');
 act(()=>fireEvent.click(screen.getByRole('button',{name:'Filter Status'})));
 fireEvent.change(screen.getByLabelText('Status'),{target:{value:'accepted'}});
 await waitFor(()=>{const p=new URL(ui.calls.filter(u=>u.includes('report=')).at(-1),'http://local').searchParams;assert.equal(p.get('sourceIndex'),'0');assert.equal(JSON.parse(p.get('filters')).status,'accepted');});
});
test('late responses cannot replace a newer workflow selection and failures allow refresh',async()=>{
 let finish;
 const ui=setup(uri=>new URL(uri,'http://local').searchParams.get('workflow')==='approval'?new Promise(resolve=>finish=resolve):Promise.resolve(page([['new','accepted','Ada','tenant']])));
 await choose();await choose('certification');await screen.findByText('new');
 await act(async()=>finish(page([['stale','accepted','Ada','tenant']])));
 assert.equal(screen.queryByText('stale'),null);ui.unmount();
 let fail=true;
 setup(()=>fail?Promise.reject(Error('offline')):Promise.resolve(page([['retry','accepted','Ada','tenant']])));
 await choose();await screen.findByText(/Unable to load workflow history/);fail=false;fireEvent.click(screen.getByRole('button',{name:'Refresh'}));await screen.findByText('retry');
});
test('CSV records selected workflow name/key once and preserves all filtered source pages',async()=>{
 const calls=[],controller=new AbortController();
 const result=await exportHistory(async uri=>{calls.push(uri);return calls.length===1?page([],{nextOffset:0,nextSourceIndex:1}):page([]);},
  {id:'approval',title:'Approval "Workflow"'},{status:'accepted'},controller.signal);
 const text=await result.blob.text();
 assert.ok(text.startsWith('"Selected Workflow";"Approval ""Workflow"""\r\n"Workflow Key";"approval"\r\n'));
 assert.equal(text.match(/Selected Workflow/g).length,1);
 assert.equal(text.match(/"Subject";"Status"/g).length,1);
 assert.equal(calls.length,2);assert.equal(new URL(calls[1],'http://local').searchParams.get('sourceIndex'),'1');
 for(const uri of calls){const p=new URL(uri,'http://local').searchParams;assert.equal(p.get('workflow'),'approval');assert.equal(p.get('pageSize'),'500');assert.equal(JSON.parse(p.get('filters')).status,'accepted');}
 const all=await exportHistory(async()=>page([]),{id:'*',title:'All workflows'},{},controller.signal);
 assert.match(await all.blob.text(),/"Selected Workflow";"All workflows"/);
});
test('CSV rejects changed schemas, invalid cursors and canceled exports',async()=>{
 let count=0;
 await assert.rejects(()=>exportHistory(async()=>++count===1?page([],{nextOffset:500,nextSourceIndex:0}):page([],{header:'changed'}),{id:'approval',title:'Approval'},{},new AbortController().signal),/schema changed/);
 await assert.rejects(()=>exportHistory(async()=>page([],{nextOffset:0,nextSourceIndex:0}),{id:'approval',title:'Approval'},{},new AbortController().signal),/Invalid report paging/);
 const controller=new AbortController();controller.abort();
 await assert.rejects(()=>exportHistory(async()=>page([]),{id:'approval',title:'Approval'},{},controller.signal),{name:'AbortError'});
});

test('people dropdown searches inside its menu and supports keyboard selection and dismissal',async()=>{
 const ui=setup();await choose();await screen.findByText('id');
 act(()=>fireEvent.click(screen.getByRole('button',{name:'Filter Reviewer'})));
 const trigger=screen.getByLabelText('Reviewer');
 assert.equal(screen.queryByLabelText('Search Reviewer'),null);
 act(()=>fireEvent.click(trigger));
 const search=await screen.findByLabelText('Search Reviewer');
 assert.equal(document.activeElement,search);
 fireEvent.input(search,{target:{value:'Ada'}});
 await waitFor(()=>assert.ok(ui.calls.some(uri=>uri.includes('dictionary=people')&&new URL(uri,'http://local').searchParams.get('search')==='Ada')));
 await screen.findByRole('option',{name:'Ada Lovelace ada@example.test'});
 act(()=>fireEvent.keyDown(search,{key:'ArrowDown'}));
 assert.equal(document.activeElement.textContent,'All');
 act(()=>fireEvent.keyDown(document.activeElement,{key:'ArrowDown'}));
 act(()=>fireEvent.click(document.activeElement));
 assert.equal(trigger.textContent,'Ada Lovelace▾');
 assert.equal(screen.queryByRole('listbox'),null);
 assert.equal(document.activeElement,trigger);
 act(()=>fireEvent.click(trigger));
 act(()=>fireEvent.keyDown(screen.getByLabelText('Search Reviewer'),{key:'Escape'}));
 assert.equal(trigger.getAttribute('aria-expanded'),'false');
 assert.equal(screen.queryByLabelText('Search Reviewer'),null);
 assert.equal(ui.container.querySelectorAll('col').length,3);
 assert.equal(window.getComputedStyle(ui.container.querySelector('table')).tableLayout,'fixed');
});
