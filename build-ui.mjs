// SPDX-License-Identifier: CDDL-1.1
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {build} from 'esbuild';

await build({
  entryPoints:['src/ui/mount.tsx'], outfile:'assets/historyApp.js', bundle:true,
  tsconfig:'tsconfig.ui.json', jsx:'automatic', format:'iife',
  globalName:'WorkflowHistoryApp', target:['es2020'], minify:true,
  define:{'process.env.NODE_ENV':'"production"'}, legalComments:'eof',
  banner:{js:'(function () {'},
  footer:{js:'define([], function () { return WorkflowHistoryApp; }); }());'}
});

// Preserve notices for the packages embedded into the distributed browser bundle.
const require=createRequire(import.meta.url);
const packages=['preact','@tanstack/preact-table','@tanstack/table-core','@tanstack/preact-store','@tanstack/store'];
const licenses=await Promise.all(packages.map(async name=>{
  const file=require.resolve(name+'/package.json');
  const pkg=JSON.parse(await readFile(file,'utf8'));
  return name+' '+pkg.version+'\n'+await readFile(join(dirname(file),'LICENSE'),'utf8');
}));
await writeFile('assets/historyApp.LICENSE.txt',licenses.join('\n\n'));
