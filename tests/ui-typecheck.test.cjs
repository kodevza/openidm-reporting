const {test}=require('node:test');
const {execFileSync}=require('node:child_process');
const path=require('node:path');

test('Preact UI form handlers compile with strict DOM event types',()=>{
 execFileSync(process.execPath,[require.resolve('typescript/bin/tsc'),'-p','tsconfig.ui.json'],{
  cwd:path.join(__dirname,'..'),stdio:'pipe'
 });
});
