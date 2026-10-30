import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import ts from '../../../node_modules/typescript/lib/typescript.js';
import { buildInputDigest, listCompilerFiles } from '../../../scripts/build-identity.mjs';
import { checkBuild } from '../../../scripts/start-lib.mjs';
const root=process.cwd(),dist=path.join(root,'packages/ts-shell/dist');
const result=checkBuild({root,dist,version:JSON.parse(fs.readFileSync('packages/ts-shell/package.json')).version,executablePolicy:'ignore'});
if(!result.ok)throw Error(result.reason);
const manifest=result.manifest,current=listCompilerFiles(root),input=buildInputDigest(root,current);
if(JSON.stringify(current)!==JSON.stringify(manifest.compilerInputs)||input.digest!==manifest.inputsDigest)throw Error('inputs mismatch');
const count=text=>{let total=0;const visit=node=>{
  if((ts.isFunctionDeclaration(node)||ts.isFunctionExpression(node))&&node.name)total++;
  else if(ts.isMethodDeclaration(node)||ts.isConstructorDeclaration(node)||ts.isGetAccessorDeclaration(node)||ts.isSetAccessorDeclaration(node))total++;
  else if((ts.isVariableDeclaration(node)||ts.isPropertyDeclaration(node)||ts.isPropertyAssignment(node))&&node.initializer
    &&(ts.isArrowFunction(node.initializer)||ts.isFunctionExpression(node.initializer)))total++;
  ts.forEachChild(node,visit);
};visit(ts.createSourceFile('source.ts',text,ts.ScriptTarget.Latest,true));return total;};
const report={buildId:manifest.buildId,inputsDigest:manifest.inputsDigest,compilerInputs:current.length,files:input.files,
  compilerMatch:true,digestMatch:true,callables:{}};
for(const file of ['packages/ts-shell/src/cli/interactive/externalEditor.ts']){
  const source=fs.readFileSync(file,'utf8'),previous=execFileSync('rtk',['proxy','git','show','HEAD:'+file],{encoding:'utf8'});
  report.callables[file]={count:count(source),previousCount:count(previous),sourceSha256:createHash('sha256').update(source).digest('hex')};
}
fs.writeFileSync('.tmp/composer-cli/build.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
