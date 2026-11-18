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
 vm.runInNewContext(source,{define(names,factory){install=factory($,{getResource(){return Promise.resolve({});}},router);}});
 install();install();router.configuration={routes:{}};router.init();await new Promise(setImmediate);
 assert.equal($('#governance-report-download').length,1);assert.equal($('#governance-report-download a').text(),'Workflow History');
});
test('host view unmounts React when its DOM is removed and can mount again',async()=>{
 const dom=new JSDOM('<div id="wrapper"><div id="content"></div></div>');let view,mounts=0,unmounts=0;
 const $=require('jquery')(dom.window),AbstractView={extend(spec){return class {constructor(){Object.assign(this,spec);}parentRender(cb){$('#content').html('<div id="workflow-history-body"></div>');cb();}};}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/historyView.js'),'utf8'),{document:dom.window.document,MutationObserver:dom.window.MutationObserver,
  define(names,factory){view=factory($,AbstractView,{getResource(){}},{mount(){mounts++;return()=>unmounts++;}});}});
 view.render();assert.equal(mounts,1);$('#content').empty();await new Promise(setImmediate);assert.equal(unmounts,1);
 view.render();assert.equal(mounts,2);view.render();assert.equal(unmounts,2);
});
