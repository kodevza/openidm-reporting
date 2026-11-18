import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {build} from 'esbuild';
await build({entryPoints:['src/react/mount.tsx'],outfile:'assets/historyApp.js',bundle:true,
  tsconfig:'tsconfig.react.json',jsx:'automatic',format:'iife',globalName:'WorkflowHistoryReact',target:['es2020'],minify:true,
  define:{'process.env.NODE_ENV':'"production"'},legalComments:'eof',
  banner:{js:'(function () {'},footer:{js:'define([], function () { return WorkflowHistoryReact; }); }());'}});

const require=createRequire(import.meta.url);
const packages=['react','react-dom','scheduler','@tanstack/table-core','@tanstack/react-table','@tanstack/store','@tanstack/react-store'];
const licenses=await Promise.all(packages.map(async name=>{
  const file=require.resolve(name+'/package.json',{paths:[process.cwd(),join(process.cwd(),'node_modules/@tanstack/react-table')]});
  const pkg=JSON.parse(await readFile(file,'utf8'));
  return name+' '+pkg.version+'\n'+await readFile(join(dirname(file),'LICENSE'),'utf8');
}));
await writeFile('assets/historyApp.LICENSE.txt',licenses.join('\n\n'));
