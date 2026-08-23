const {APP}=require('./lib/harness');
const os=require('os'),P=require('path');
const SHOT=n=>P.join(os.tmpdir(),'voltlog-'+n);
const puppeteer=require('puppeteer');
let fails=0;const errs=[];
const t=(n,c,x='')=>{console.log((c?'  ok  ':'FAIL  ')+n+(c?'':'   '+x));if(!c)fails++;};
(async()=>{
const b=await puppeteer.launch({args:['--no-sandbox','--allow-file-access-from-files']});
const p=await b.newPage();await p.setViewport({width:320,height:860});
p.on('pageerror',e=>errs.push(e.message));
p.on('dialog',async d=>{await d.accept();});
await p.evaluateOnNewDocument(()=>{
  const en=(name,cat,sets,o={})=>({exId:o.exId||'e1',name,cat,load:o.load||'std',rev:!!o.rev,
    dual:!!o.dual,machine:'',remarks:'',sets});
  const d={'voltlog:branches':['Main'],
    'voltlog:exercises':[{id:'e1',name:'Lat Pulldown',cat:'Back',load:'std'},
                         {id:'e2',name:'Barbell Bench Press',cat:'Chest',load:'std'}],
    'voltlog:sessions':[
      {id:'s1',date:'2026-08-01',branch:'Main',bodyweight:null,notes:'',entries:[
        en('Lat Pulldown','Back',[{reps:10,weight:10,rpe:8,type:'W'}]),
        en('Barbell Bench Press','Chest',[{reps:5,weight:60,rpe:8,type:'W'}],{exId:'e2'})]},
      {id:'s2',date:'2026-08-08',branch:'Main',bodyweight:null,notes:'',entries:[
        en('Lat Pulldown','Back',[{reps:10,weight:12,rpe:8,type:'W'}])]}],
    'voltlog:scans':[],'voltlog:settings':{lastBranch:'Main',libVer:5}};
  for(const k in d)localStorage.setItem(k,JSON.stringify(d[k]));
});
await p.goto('file://'+APP,{waitUntil:'networkidle2'});
await new Promise(r=>setTimeout(r,800));

const vol=()=>p.evaluate(()=>DB.sessions.reduce((a,s)=>a+s.entries.reduce((x,e)=>x+entryVol(e),0),0));
t('baseline volume treats the stack as read',await vol()===520,await vol());

// --- 1. library checkbox + backfill --------------------------------------
await p.evaluate(()=>openLib());
await new Promise(r=>setTimeout(r,250));
t('every library row has a Dual pulley box',
  await p.evaluate(()=>document.querySelectorAll('#libList input[data-libdual]').length===2));
t('the box renders as a real checkbox',await p.evaluate(()=>{
  const r=document.querySelector('#libList input[data-libdual]').getBoundingClientRect();
  return r.width>=14&&r.width<=24&&r.height>=14;}));
await p.evaluate(()=>{
  const x=DB.exercises.find(e=>e.name==='Lat Pulldown');
  document.querySelector(`#libList input[data-libdual="${x.id}"]`).click();});
await new Promise(r=>setTimeout(r,300));
t('library flag set',await p.evaluate(()=>!!DB.exercises.find(e=>e.name==='Lat Pulldown').dual));
t('past entries backfilled',await p.evaluate(()=>
  DB.sessions.every(s=>(s.entries.find(e=>e.name==='Lat Pulldown')||{dual:true}).dual===true)));
t('bench untouched',await p.evaluate(()=>DB.sessions[0].entries[1].dual===false));
t('volume rises by the pulldown only',await vol()===740,await vol());
t('the logged numbers are unchanged',await p.evaluate(()=>DB.sessions[0].entries[0].sets[0].weight===10));
t('persisted to storage',await p.evaluate(()=>
  JSON.parse(localStorage.getItem('voltlog:sessions'))[0].entries[0].dual===true));
t('checkbox stays ticked after re-render',await p.evaluate(()=>{
  const x=DB.exercises.find(e=>e.name==='Lat Pulldown');
  return document.querySelector(`#libList input[data-libdual="${x.id}"]`).checked===true;}));
await p.evaluate(()=>$('#libModal').classList.remove('open'));

// --- 2. dashboard uses the effective weight ------------------------------
await p.evaluate(()=>{go('dash');curEx='Lat Pulldown';curMetric='1rm';renderDash();renderExPicker();});
await new Promise(r=>setTimeout(r,800));
// est. 1RM on the EFFECTIVE weights: 20*(1+10/30)=26.7, 24*(1+10/30)=32
t('est 1RM chart uses the doubled weight',await p.evaluate(()=>{
  const c=dashCharts.find(c=>c.canvas.id==='exChart');
  return c&&c.data.datasets[0].data.join()==='26.7,32';}),
  await p.evaluate(()=>{const c=dashCharts.find(c=>c.canvas.id==='exChart');return c?c.data.datasets[0].data.join():'no chart';}));
await p.evaluate(()=>{curMetric='top';renderExPicker();});
await new Promise(r=>setTimeout(r,400));
t('top-set chart plots the doubled value',await p.evaluate(()=>{
  const c=dashCharts.find(c=>c.canvas.id==='exChart');
  return c&&c.data.datasets[0].data.join()==='20,24';}),
  await p.evaluate(()=>{const c=dashCharts.find(c=>c.canvas.id==='exChart');return c?c.data.datasets[0].data.join():'no chart';}));
const exlog=await p.evaluate(()=>$('#exLog').textContent.replace(/\s+/g,' ').trim());
t('the per-exercise log still shows the pin setting',/10×12/.test(exlog)&&!/10×24/.test(exlog),exlog.slice(0,110));
t('and marks it dual',/dual ×2/.test(exlog),exlog.slice(0,110));

// --- 3. history ----------------------------------------------------------
await p.evaluate(()=>{go('hist');renderHistory();});
await new Promise(r=>setTimeout(r,300));
const hist=await p.evaluate(()=>$('#histList').textContent.replace(/\s+/g,' ').trim());
t('history marks the dual entry',/dual · ×2/.test(hist),hist.slice(0,160));
t('history shows the pin setting, not the double',/10×10kg/.test(hist),hist.slice(0,200));

// --- 4. the log card: default from the library, override per entry --------
await p.evaluate(()=>{go('log');resetDraft();draft.branch='Main';$('#sessDate').value='2026-08-23';
  addExerciseToDraft(DB.exercises.find(e=>e.name==='Lat Pulldown'));});
await new Promise(r=>setTimeout(r,300));
t('new entry defaults to the library setting',await p.evaluate(()=>draft.entries[0].dual===true));
t('the Dual button is pre-selected',await p.evaluate(()=>
  document.querySelector('[data-pul][data-d="1"]').classList.contains('on')));
t('last-time band tags the previous session dual',await p.evaluate(()=>
  $('#exList').textContent.includes('dual · ×2')));
// switch this one session back to the single station
await p.evaluate(()=>document.querySelector('[data-pul][data-d="0"]').click());
await new Promise(r=>setTimeout(r,200));
t('per-entry override flips it',await p.evaluate(()=>draft.entries[0].dual===false));
t('the Single button becomes active',await p.evaluate(()=>
  document.querySelector('[data-pul][data-d="0"]').classList.contains('on')&&
  !document.querySelector('[data-pul][data-d="1"]').classList.contains('on')));
t('the override does not touch the library default',await p.evaluate(()=>
  DB.exercises.find(e=>e.name==='Lat Pulldown').dual===true));
t('switching station does not clear typed sets',await p.evaluate(()=>{
  draft.entries[0].sets[0].reps='10';renderExList();
  document.querySelector('[data-pul][data-d="1"]').click();
  return draft.entries[0].sets[0].reps==='10';}));

// --- 5. repeat carries the station ---------------------------------------
await p.evaluate(()=>{resetDraft();draft.branch='Main';$('#sessDate').value='2026-08-23';
  addExerciseToDraft(DB.exercises.find(e=>e.name==='Lat Pulldown'));
  draft.entries[0].dual=false;renderExList();
  document.querySelector('.lt-rep').click();});
await new Promise(r=>setTimeout(r,300));
t('repeat restores the station the numbers came from',await p.evaluate(()=>draft.entries[0].dual===true));
t('repeat copies the pin setting, not the double',await p.evaluate(()=>draft.entries[0].sets[0].weight===12));

// --- 6. save path --------------------------------------------------------
await p.evaluate(()=>{$('#sessDate').value='2026-08-22';$('#saveSess').click();});
await new Promise(r=>setTimeout(r,500));
t('saved entry carries dual',await p.evaluate(()=>{
  const s=DB.sessions.find(s=>s.date==='2026-08-22');return !!(s&&s.entries[0].dual);}));
t('and its volume is doubled',await p.evaluate(()=>{
  const s=DB.sessions.find(s=>s.date==='2026-08-22');return entryVol(s.entries[0])===240;}),
  await p.evaluate(()=>{const s=DB.sessions.find(s=>s.date==='2026-08-22');return entryVol(s.entries[0]);}));

// --- 7. layout -----------------------------------------------------------
await p.evaluate(()=>{go('log');resetDraft();draft.branch='Main';
  addExerciseToDraft(DB.exercises.find(e=>e.name==='Lat Pulldown'));});
await new Promise(r=>setTimeout(r,300));
t('no horizontal overflow at 320px',await p.evaluate(()=>
  document.documentElement.scrollWidth-document.documentElement.clientWidth<=0));
t('no page errors anywhere',errs.length===0,errs.join(' | '));
await p.screenshot({path:SHOT('dual.png')});
await p.evaluate(()=>openLib());await new Promise(r=>setTimeout(r,300));
await p.screenshot({path:SHOT('dual-lib.png')});
await b.close();
console.log(fails?'\n'+fails+' FAILED':'\nall passed');process.exit(fails?1:0);
})();
