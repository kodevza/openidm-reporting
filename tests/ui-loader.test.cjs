const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../assets/reportUI.js'),'utf8');
test('startup registration precedes routing and authorized navigation exposes one report',async()=>{
 const dom=new JSDOM('<div id="mainNavHolder"><ul class="navbar-nav"></ul></div>');const $=require('jquery')(dom.window);
 let install;const router={init(){assert.equal(this.configuration.routes.workflowHistory.url,'reports/workflow-history/');this.router={route(){}};}};
 vm.runInNewContext(source,{define(names,factory){install=factory($,{serviceCall(){return Promise.resolve({});}},router,{loggedUser:{id:"admin"}});}});
 install();install();router.configuration={routes:{}};router.init();await new Promise(setImmediate);
 assert.equal($('#governance-report-download').length,1);assert.equal($('#governance-report-download a').text(),'Workflow History');
});
test('host view unmounts Preact when its DOM is removed and can mount again',async()=>{
 const dom=new JSDOM('<div id="wrapper"><div id="content"></div></div>');let view,mounts=0,unmounts=0;
 const $=require('jquery')(dom.window),AbstractView={extend(spec){return class {constructor(){Object.assign(this,spec);}parentRender(cb){$('#content').html('<div id="workflow-history-body"></div>');cb();}};}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/historyView.js'),'utf8'),{window:dom.window,document:dom.window.document,MutationObserver:dom.window.MutationObserver,
  define(names,factory){view=factory(AbstractView,{getResource(){}},{mount(){mounts++;return()=>unmounts++;}});}});
 view.render();assert.equal(mounts,1);$('#content').empty();await new Promise(setImmediate);assert.equal(unmounts,1);
 view.render();assert.equal(mounts,2);view.render();assert.equal(unmounts,2);
});

test('login startup registers the route without probing protected reports',async()=>{
 const dom=new JSDOM('<div id="mainNavHolder"><ul class="navbar-nav"></ul></div>');
 const $=require('jquery')(dom.window);let install,calls=0;
 const router={configuration:{routes:{}},router:{route(){}},getCurrentHash(){return 'login/';}};
 const delegate={getResource(){calls++;return Promise.resolve({});},serviceCall(){calls++;return Promise.resolve({});}};
 vm.runInNewContext(source,{define(names,factory){install=factory($,delegate,router,{});}});
 install();await new Promise(setImmediate);
 assert.equal(calls,0);
 assert.ok(router.configuration.routes.workflowHistory);
 assert.equal($('#governance-report-download').length,0);
});
test('denied report capability checks are handled quietly for signed-in users',async()=>{
 const dom=new JSDOM('<div id="mainNavHolder"><ul class="navbar-nav"></ul></div>');
 const $=require('jquery')(dom.window);let install,options;
 const router={configuration:{routes:{workflowHistory:{}}},router:{route(){}}};
 vm.runInNewContext(source,{define(names,factory){install=factory($,{serviceCall(params){options=params;return Promise.reject({status:403});}},router,{loggedUser:{id:'user'}});}});
 install();await new Promise(setImmediate);
 assert.equal(options.url,'endpoint/governanceReport?capabilities=true');
 assert.equal(Number(options.errorsHandlers.forbidden.status),403);
 assert.equal(Number(options.errorsHandlers.unauthorized.status),401);
 assert.equal($('#governance-report-download').length,0);
});

test('Self Service registers My Tasks independently of auditor access',async()=>{
 const dom=new JSDOM('<div id="mainNavHolder"><ul class="navbar-nav"></ul></div>');
 const $=require('jquery')(dom.window);
 let install;
 const routes={};
 const router={configuration:{routes},router:{route(){}},getCurrentHash(){return '';}};
 vm.runInNewContext(source,{define(names,factory){
  install=factory($,{serviceCall(){return Promise.reject({status:403});}},router,{loggedUser:{id:'user'}},
    {config(){return {myTasks:true};}});
 }});
 install();install();await new Promise(setImmediate);
 assert.equal(routes.reportingMyTasks.url,'reports/my-tasks/');
 assert.equal($('#reporting-my-tasks a').attr('href'),'#reports/my-tasks/');
 assert.equal($('#reporting-my-tasks').length,1);
 assert.equal($('#governance-report-download').length,0);
});
