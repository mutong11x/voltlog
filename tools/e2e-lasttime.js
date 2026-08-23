const {APP,grab}=require('./lib/harness');
const os=require('os'),P=require('path');
const SHOT=n=>P.join(os.tmpdir(),'voltlog-'+n);
const puppeteer=require('puppeteer');
let fails=0;const errs=[];
const t=(n,c,x='')=>{console.log((c?'  ok  ':'FAIL  ')+n+(c?'':'   '+x));if(!c)fails++;};
(async()=>{
const b=await puppeteer.launch({args:['--no-sandbox','--allow-file-access-from-files']});
const p=await b.newPage();await p.setViewport({width:320,height:820});
p.on('pageerror',e=>errs.push(e.message));
p.on('dialog',async d=>{await d.accept();});
await p.evaluateOnNewDocument(()=>{
  const en=(name,cat,sets,o={})=>({exId:o.exId||'e1',name,cat,load:o.load||'std',rev:!!o.rev,
    machine:o.machine||'',remarks:'',sets});
  const d={'voltlog:branches':['Main'],
    'voltlog:exercises':[{id:'e1',name:'Barbell Bench Press',cat:'Chest',load:'std'},
                         {id:'e2',name:'Assisted Pull-up',cat:'Back',load:'std',rev:true},
                         {id:'e3',name:'Hip Thrust',cat:'Legs',load:'std'}],
    'voltlog:sessions':[
      {id:'s1',date:'2026-08-01',branch:'Main',bodyweight:null,notes:'',entries:[
        en('Barbell Bench Press','Chest',[{reps:5,weight:57.5,rpe:7,type:'W'},{reps:5,weight:60,rpe:8,type:'W'}])]},
      {id:'s2',date:'2026-08-09',branch:'Main',bodyweight:null,notes:'',entries:[
        en('Barbell Bench Press','Chest',[{reps:5,weight:60,rpe:7,type:'W'},{reps:5,weight:62.5,rpe:8,type:'W'},
                                          {reps:4,weight:65,rpe:9,type:'W'}],{machine:'seat 4, pad 2'}),
        en('Assisted Pull-up','Back',[{reps:8,weight:30,rpe:8,type:'W'},{reps:8,weight:25,rpe:9,type:'W'}],
           {exId:'e2',rev:true})]}],
    'voltlog:scans':[],'voltlog:settings':{lastBranch:'Main',libVer:5}};
  for(const k in d)localStorage.setItem(k,JSON.stringify(d[k]));
});
await p.goto('file://'+APP,{waitUntil:'networkidle2'});
await new Promise(r=>setTimeout(r,800));

const addEx=async name=>{await p.evaluate(n=>{
  go('log');draft.branch='Main';
  addExerciseToDraft(DB.exercises.find(e=>e.name===n));},name);
  await new Promise(r=>setTimeout(r,250));};
const txt=async()=>p.evaluate(()=>$('#exList').textContent.replace(/\s+/g,' ').trim());

// --- 1. the band itself ---------------------------------------------------
await p.evaluate(()=>{resetDraft();$('#sessDate').value='2026-08-23';});
await addEx('Barbell Bench Press');
let s=await txt();
t('band shows the most recent session',/Last time · 9 Aug 26/.test(s),s.slice(0,110));
t('relative age shown',/2 wks ago/.test(s),s.slice(0,110));
t('all three sets, verbatim',/5×60/.test(s)&&/5×62\.5/.test(s)&&/4×65/.test(s),s.slice(0,160));
t('rpe carried through',/@9/.test(s));
t('machine note shown',/seat 4, pad 2/.test(s));
t('heaviest set marked best',await p.evaluate(()=>{
  const b=document.querySelector('.lt-sets .setpill.best');return b&&b.textContent.startsWith('4×65');}));
t('exactly one best marker',await p.evaluate(()=>document.querySelectorAll('.lt-sets .setpill.best').length===1));
t('draft rows are still empty',await p.evaluate(()=>draft.entries[0].sets.every(x=>x.reps===''&&x.weight==='')));

// --- 2. repeat ------------------------------------------------------------
await p.evaluate(()=>document.querySelector('.lt-rep').click());
await new Promise(r=>setTimeout(r,300));
const sets=await p.evaluate(()=>draft.entries[0].sets);
t('repeat fills all three sets',sets.length===3,JSON.stringify(sets));
t('reps and weights copied',sets[0].reps===5&&sets[0].weight===60&&sets[2].weight===65,JSON.stringify(sets));
t('RPE deliberately NOT copied',sets.every(x=>x.rpe===''),JSON.stringify(sets.map(x=>x.rpe)));
t('inputs show the values',await p.evaluate(()=>
  [...document.querySelectorAll('.setrow input[data-f=weight]')].map(i=>i.value).join()==='60,62.5,65'));
t('sets are copies, not references to the stored session',await p.evaluate(()=>{
  draft.entries[0].sets[0].weight='999';
  return DB.sessions.find(x=>x.id==='s2').entries[0].sets[0].weight===60;}));

// --- 3. overwrite guard ---------------------------------------------------
await p.evaluate(()=>{resetDraft();$('#sessDate').value='2026-08-23';});
await addEx('Barbell Bench Press');
let confirmed=false;p.on('dialog',()=>{confirmed=true;});
await p.evaluate(()=>{draft.entries[0].sets[0].reps='3';renderExList();});
await new Promise(r=>setTimeout(r,150));
await p.evaluate(()=>document.querySelector('.lt-rep').click());
await new Promise(r=>setTimeout(r,300));
t('typed data triggers a confirm before overwrite',confirmed);

// --- 4. first-ever exercise ----------------------------------------------
await p.evaluate(()=>{resetDraft();$('#sessDate').value='2026-08-23';});
await addEx('Hip Thrust');
s=await txt();
t('never-logged exercise says first time',/First time logging this/i.test(s),s.slice(0,90));
t('and offers no repeat button',await p.evaluate(()=>!document.querySelector('.lt-rep')));

// --- 5. assisted lift -----------------------------------------------------
await p.evaluate(()=>{resetDraft();$('#sessDate').value='2026-08-23';});
await addEx('Assisted Pull-up');
t('assisted: LIGHTEST set marked best',await p.evaluate(()=>{
  const b=document.querySelector('.lt-sets .setpill.best');return b&&b.textContent.startsWith('8×25');}),
  await p.evaluate(()=>document.querySelector('.lt-sets').textContent));
t('assisted tag shown',/assisted/i.test(await txt()));

// --- 6. editing an old session shows the one BEFORE it --------------------
await p.evaluate(()=>{loadSessionToDraft('s2');});
await new Promise(r=>setTimeout(r,350));
s=await txt();
t('editing s2 shows s1, not itself',/Last time · 1 Aug 26/.test(s),s.slice(0,120));
t('and shows s1 sets',/5×57\.5/.test(s),s.slice(0,140));
t('editing the oldest session says first time',await p.evaluate(async()=>{
  loadSessionToDraft('s1');return $('#exList').textContent.includes('First time logging this');}));

// --- 7. Stats log unchanged by the setPills extraction --------------------
await p.evaluate(()=>{resetDraft();go('dash');curEx='Barbell Bench Press';renderDash();renderExPicker();});
await new Promise(r=>setTimeout(r,700));
const exlog=await p.evaluate(()=>$('#exLog').textContent.replace(/\s+/g,' ').trim());
t('Stats per-exercise log still renders',/5×62\.5/.test(exlog)&&/4×65/.test(exlog),exlog.slice(0,120));
t('Stats log still marks one best per session',await p.evaluate(()=>
  [...document.querySelectorAll('.exlog-row')].every(r=>r.querySelectorAll('.setpill.best').length<=1)));

// --- 8. layout ------------------------------------------------------------
await p.evaluate(()=>{resetDraft();$('#sessDate').value='2026-08-23';go('log');});
await addEx('Barbell Bench Press');
t('no horizontal overflow at 320px',await p.evaluate(()=>
  document.documentElement.scrollWidth-document.documentElement.clientWidth<=0));
t('no page errors anywhere',errs.length===0,errs.join(' | '));
await p.screenshot({path: SHOT('last.png')});
await b.close();
console.log(fails?'\n'+fails+' FAILED':'\nall passed');process.exit(fails?1:0);
})();
