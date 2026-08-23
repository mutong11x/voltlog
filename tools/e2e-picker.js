const {APP}=require('./lib/harness');
const os=require('os'),P=require('path');
const SHOT=n=>P.join(os.tmpdir(),'voltlog-'+n);
const puppeteer=require('puppeteer');
let fails=0;const errs=[];
const t=(n,c,x='')=>{console.log((c?'  ok  ':'FAIL  ')+n+(c?'':'   '+x));if(!c)fails++;};
(async()=>{
const b=await puppeteer.launch({args:['--no-sandbox','--allow-file-access-from-files']});
const p=await b.newPage();await p.setViewport({width:320,height:880});
p.on('pageerror',e=>errs.push(e.message));
p.on('dialog',async d=>{await d.accept();});

const seed=sessions=>p.evaluateOnNewDocument(ss=>{
  localStorage.setItem('voltlog:branches',JSON.stringify(['Main']));
  localStorage.setItem('voltlog:exercises',JSON.stringify([]));
  localStorage.setItem('voltlog:sessions',JSON.stringify(ss));
  localStorage.setItem('voltlog:scans',JSON.stringify([]));
  localStorage.setItem('voltlog:settings',JSON.stringify({lastBranch:'Main',libVer:5}));
},sessions);

const E=(name,cat,w)=>({exId:'x',name,cat,load:'std',rev:false,dual:false,machine:'',remarks:'',
  sets:[{reps:5,weight:w,rpe:8,type:'W'}]});
const S=(id,date,ents)=>({id,date,branch:'Main',bodyweight:null,notes:'',entries:ents});

// oldest first in storage, so "first logged" and "most recent" differ — the whole point
await seed([
  S('s1','2026-06-01',[E('Barbell Bench Press','Chest',60),E('Cable Crunch','Core',20)]),
  S('s2','2026-08-01',[E('Back Squat','Legs',100)]),
  S('s3','2026-08-15',[E('Lat Pulldown','Back',40)]),
  S('s4','2026-08-22',[E('Lat Pulldown','Back',45),E('Barbell Curl','Arms',20)]),
]);
await p.goto('file://'+APP,{waitUntil:'networkidle2'});
await new Promise(r=>setTimeout(r,800));
await p.evaluate(()=>{go('dash');});
await new Promise(r=>setTimeout(r,800));

const chips=sel=>p.evaluate(s=>[...document.querySelectorAll(s)].map(b=>b.textContent.trim()),sel);
const onChip=sel=>p.evaluate(s=>{const b=document.querySelector(s+'.on');return b?b.textContent.trim():null;},sel);

// --- 1. both rows, Recent default ----------------------------------------
t('a body-part row renders',await p.evaluate(()=>!!document.querySelector('#exCats')));
const cats=await chips('#exCats .chip');
t('Recent is first',cats[0]==='Recent',JSON.stringify(cats));
t('only logged body parts get a tab',cats.join()==='Recent,Chest,Back,Legs,Arms,Core',JSON.stringify(cats));
t('Recent is selected by default',(await onChip('#exCats .chip'))==='Recent');

// --- 2. recency ordering + default selection ------------------------------
const ex=await chips('#exPick .chip');
t('most recently trained first',/^Barbell Curl/.test(ex[0])&&/^Lat Pulldown/.test(ex[1]),JSON.stringify(ex));
t('a same-day tie breaks by name, so the order is stable',
  ex.slice(0,2).join('|')===[...ex].slice(0,2).sort().join('|'),JSON.stringify(ex.slice(0,2)));
t('the oldest is last',/Bench Press|Cable Crunch/.test(ex[ex.length-1]),JSON.stringify(ex));
t('every logged exercise is listed',ex.length===5,JSON.stringify(ex));
t('opens on the most recently trained lift',await p.evaluate(()=>curEx==='Barbell Curl'),
  await p.evaluate(()=>curEx));
t('and that chip is the lit one',/^Barbell Curl/.test(await onChip('#exPick .chip')),
  await onChip('#exPick .chip'));
t('chips carry an age',await p.evaluate(()=>{
  const a=document.querySelector('#exPick .chip .age');return !!a&&/^(today|\d+(d|w|mo))$/.test(a.textContent);}),
  await p.evaluate(()=>{const a=document.querySelector('#exPick .chip .age');return a?a.textContent:'none';}));
t('the chart drew for that lift',await p.evaluate(()=>
  !!dashCharts.find(c=>c.canvas.id==='exChart')));

// --- 3. filtering by body part -------------------------------------------
await p.evaluate(()=>[...document.querySelectorAll('#exCats .chip')].find(b=>b.textContent.trim()==='Legs').click());
await new Promise(r=>setTimeout(r,500));
t('the tab becomes active',(await onChip('#exCats .chip'))==='Legs');
const legs=await chips('#exPick .chip');
t('only that body part is listed',legs.length===1&&/^Back Squat/.test(legs[0]),JSON.stringify(legs));
t('selection follows to that group',await p.evaluate(()=>curEx==='Back Squat'),await p.evaluate(()=>curEx));
t('the lit chip is one of the visible ones',/^Back Squat/.test(await onChip('#exPick .chip')));
t('the chart followed',await p.evaluate(()=>{
  const c=dashCharts.find(c=>c.canvas.id==='exChart');return !!c&&c.data.labels.length===1;}));
t('the metric seg still renders',await p.evaluate(()=>
  document.querySelectorAll('#exMetric button').length===4));

// a body part with two exercises picks the more recent
await p.evaluate(()=>[...document.querySelectorAll('#exCats .chip')].find(b=>b.textContent.trim()==='Back').click());
await new Promise(r=>setTimeout(r,400));
t('Back selects its most recent lift',await p.evaluate(()=>curEx==='Lat Pulldown'));

// --- 4. an explicit choice survives a re-render ---------------------------
await p.evaluate(()=>[...document.querySelectorAll('#exCats .chip')].find(b=>b.textContent.trim()==='Recent').click());
await new Promise(r=>setTimeout(r,400));
await p.evaluate(()=>[...document.querySelectorAll('#exPick .chip')].find(b=>/Bench Press/.test(b.textContent)).click());
await new Promise(r=>setTimeout(r,400));
t('picking an older lift works',await p.evaluate(()=>curEx==='Barbell Bench Press'));
await p.evaluate(()=>{go('log');go('dash');});
await new Promise(r=>setTimeout(r,700));
t('and it survives leaving and returning',await p.evaluate(()=>curEx==='Barbell Bench Press'),
  await p.evaluate(()=>curEx));

// --- 5. layout + errors ---------------------------------------------------
t('no horizontal page overflow at 320px',await p.evaluate(()=>
  document.documentElement.scrollWidth-document.documentElement.clientWidth<=0));
t('the chip rows scroll in their own container',await p.evaluate(()=>{
  const e=document.querySelector('#exCats');return getComputedStyle(e).overflowX==='auto';}));
t('no page errors',errs.length===0,errs.join(' | '));
await p.evaluate(()=>document.querySelector('#exCats').scrollIntoView());
await new Promise(r=>setTimeout(r,300));
await p.screenshot({path:SHOT('picker.png')});

// --- 6. empty state -------------------------------------------------------
const p2=await b.newPage();await p2.setViewport({width:320,height:880});
p2.on('pageerror',e=>errs.push('empty: '+e.message));
await p2.evaluateOnNewDocument(()=>{
  localStorage.setItem('voltlog:branches',JSON.stringify(['Main']));
  localStorage.setItem('voltlog:sessions',JSON.stringify([]));
  localStorage.setItem('voltlog:scans',JSON.stringify([]));
  localStorage.setItem('voltlog:settings',JSON.stringify({lastBranch:'Main',libVer:5}));});
await p2.goto('file://'+APP,{waitUntil:'networkidle2'});
await new Promise(r=>setTimeout(r,700));
await p2.evaluate(()=>go('dash'));
await new Promise(r=>setTimeout(r,600));
t('no sessions: both rows are empty',await p2.evaluate(()=>
  document.querySelector('#exCats').children.length===0&&document.querySelector('#exPick').children.length===0));
t('no sessions: prompt shown',await p2.evaluate(()=>$('#exPb').textContent.includes('Log workouts')));
t('no sessions: still no errors',errs.length===0,errs.join(' | '));

await b.close();
console.log(fails?'\n'+fails+' FAILED':'\nall passed');process.exit(fails?1:0);
})();
