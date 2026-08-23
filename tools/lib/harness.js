/* Shared plumbing for the VOLTLOG checks.
   The app is one file with an inline <script>, so there is nothing to import: tests pull the real
   function text out of index.html and eval it against stubs. That keeps the tests honest — they
   run the shipped code, not a copy — at the cost of this small amount of ceremony. */
const fs=require('fs'),path=require('path');

const ROOT=path.resolve(__dirname,'..','..');
const APP=path.join(ROOT,'index.html');

const readApp=()=>fs.readFileSync(APP,'utf8');
const inlineScript=()=>readApp().match(/<script>([\s\S]*)<\/script>/)[1];

/* Pull one function or const out of the inline script by regex. Throws loudly rather than
   silently testing nothing, which is the failure mode that matters here. */
function grab(re,label){
  const m=inlineScript().match(re);
  if(!m)throw new Error('harness: could not find '+(label||re)+' in index.html — did it get renamed?');
  return m[0];
}

/* `const` bindings created inside eval do not leak to the caller's scope, so rewrite the leading
   declaration to `var`, which does. Returns one string for a single direct eval by the caller —
   the caller must eval it, because only a *direct* eval reaches their scope. */
function sources(specs){
  return specs.map(([re,name])=>grab(re,name)
    .replace(/^const /,'var ')
    .replace(/^function /,'var _decl=0;function ')).join(';\n');
}

/* Tiny assertion reporter: prints as it goes, exits non-zero if anything failed. */
function reporter(title){
  let fails=0;
  const t=(name,cond,detail='')=>{
    console.log((cond?'  ok  ':'FAIL  ')+name+(cond?'':'   '+detail));
    if(!cond)fails++;
  };
  t.done=()=>{
    console.log(fails?'\n'+fails+' FAILED in '+title:'\nall passed');
    process.exit(fails?1:0);
  };
  t.fail=msg=>{fails++;console.log('FAIL  '+msg);};
  return t;
}

module.exports={ROOT,APP,readApp,inlineScript,grab,sources,reporter};
