const {APP,grab}=require('./lib/harness');
const os=require('os'),P=require('path');
const SHOT=n=>P.join(os.tmpdir(),'voltlog-'+n);
const puppeteer=require('puppeteer');
let fails=0;const errs=[];
const t=(n,c,x='')=>{console.log((c?'  ok  ':'FAIL  ')+n+(c?'':'   '+x));if(!c)fails++;};
(async()=>{
const b=await puppeteer.launch({args:['--no-sandbox','--allow-file-access-from-files']});
const p=await b.newPage();await p.setViewport({width:320,height:800});
p.on('pageerror',e=>errs.push(e.message));
p.on('dialog',async d=>await d.accept());
// sessions with NO rpe anywhere — the case that used to crash
await p.evaluateOnNewDocument(()=>{
  const mk=(id,date)=>({id,date,branch:'Main',bodyweight:null,notes:'',entries:[
    {exId:'e2',name:'Barbell Bench Press',cat:'Chest',load:'std',machine:'',remarks:'',sets:[{reps:5,weight:60,rpe:null,type:'W'}]}]});
  const d={'voltlog:branches':['Main'],
    'voltlog:exercises':[{id:'e2',name:'Barbell Bench Press',cat:'Chest',load:'std'}],
    'voltlog:sessions':[mk('s1','2026-08-01'),mk('s2','2026-08-08')],
    'voltlog:scans':[],'voltlog:settings':{lastBranch:'Main',libVer:5}};
  for(const k in d)localStorage.setItem(k,JSON.stringify(d[k]));
});
await p.goto('file://'+APP,{waitUntil:'networkidle2'});
await new Promise(r=>setTimeout(r,800));

const visitDash=async()=>{await p.evaluate(()=>go('dash'));await new Promise(r=>setTimeout(r,450));};
await visitDash();
t('1st visit: empty state shown',await p.evaluate(()=>getComputedStyle($('#rpeEmpty')).display!=='none'));
t('1st visit: canvas hidden, not destroyed',await p.evaluate(()=>!!$('#rpeChart')&&getComputedStyle($('#rpeChart').parentElement).display==='none'));
await p.evaluate(()=>go('log'));await visitDash();
t('2nd visit does not throw',errs.length===0,errs.join(' | '));
await p.evaluate(()=>go('hist'));await visitDash();
await p.evaluate(()=>go('body'));await visitDash();
t('4 visits, still no errors',errs.length===0,errs.join(' | '));
t('canvas still in the DOM',await p.evaluate(()=>!!document.querySelector('#rpeChart')));

// now log an RPE and confirm the chart comes back without a reload
await p.evaluate(()=>{
  DB.sessions[0].entries[0].sets[0].rpe=8;DB.sessions[1].entries[0].sets[0].rpe=9;
  save.sessions();go('log');});
await visitDash();
t('chart returns once RPE exists',await p.evaluate(()=>getComputedStyle($('#rpeChart').parentElement).display!=='none'&&getComputedStyle($('#rpeEmpty')).display==='none'));
t('and it actually drew',await p.evaluate(()=>dashCharts.some(c=>c.canvas.id==='rpeChart')));
// and back to empty again
await p.evaluate(()=>{DB.sessions.forEach(s=>s.entries.forEach(e=>e.sets.forEach(st=>st.rpe=null)));save.sessions();go('log');});
await visitDash();
t('returns to the empty state cleanly',await p.evaluate(()=>getComputedStyle($('#rpeEmpty')).display!=='none'));
t('no errors across the whole run',errs.length===0,errs.join(' | '));
await p.screenshot({path: SHOT('rpe.png')});
await b.close();
console.log(fails?'\n'+fails+' FAILED':'\nall passed');process.exit(fails?1:0);
})();
