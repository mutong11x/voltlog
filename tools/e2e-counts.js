const {APP}=require('./lib/harness');
const puppeteer=require('puppeteer');
let fails=0;const errs=[];
const t=(n,c,x='')=>{console.log((c?'  ok  ':'FAIL  ')+n+(c?'':'   '+x));if(!c)fails++;};
(async()=>{
const b=await puppeteer.launch({args:['--no-sandbox','--allow-file-access-from-files']});
const p=await b.newPage();await p.setViewport({width:320,height:820});
p.on('pageerror',e=>errs.push(e.message));

// one session with a single exercise and a single set, one with two exercises and five sets
await p.evaluateOnNewDocument(()=>{
  const set=(r,w)=>({reps:r,weight:w,rpe:8,type:'W'});
  const en=(name,cat,sets)=>({exId:'x',name,cat,load:'std',rev:false,dual:false,
    machine:'',remarks:'',sets});
  localStorage.setItem('voltlog:branches',JSON.stringify(['Main']));
  localStorage.setItem('voltlog:exercises',JSON.stringify([]));
  localStorage.setItem('voltlog:sessions',JSON.stringify([
    {id:'one',date:'2026-08-10',branch:'Main',bodyweight:null,notes:'',
     entries:[en('Barbell Bench Press','Chest',[set(5,60)])]},
    {id:'many',date:'2026-08-20',branch:'Main',bodyweight:null,notes:'',
     entries:[en('Barbell Bench Press','Chest',[set(5,60),set(5,62.5),set(4,65)]),
              en('Lat Pulldown','Back',[set(10,40),set(10,42.5)])]},
  ]));
  localStorage.setItem('voltlog:scans',JSON.stringify([]));
  localStorage.setItem('voltlog:settings',JSON.stringify({lastBranch:'Main',libVer:5}));
});
await p.goto('file://'+APP,{waitUntil:'networkidle2'});
await new Promise(r=>setTimeout(r,800));

// --- History meta line ----------------------------------------------------
await p.evaluate(()=>{go('hist');});
await new Promise(r=>setTimeout(r,400));
const meta=await p.evaluate(()=>[...document.querySelectorAll('#histList .meta')].map(e=>e.textContent.replace(/\s+/g,' ').trim()));
t('history: singular exercise and set',/1 exercise · 1 set ·/.test(meta.join(' | ')),JSON.stringify(meta));
t('history: no "1 exercises"',!/1 exercises/.test(meta.join(' | ')),JSON.stringify(meta));
t('history: no "1 sets"',!/\b1 sets\b/.test(meta.join(' | ')),JSON.stringify(meta));
t('history: plural still plural',/2 exercises · 5 sets ·/.test(meta.join(' | ')),JSON.stringify(meta));

// --- Stats per-exercise log ------------------------------------------------
await p.evaluate(()=>{go('dash');curEx='Barbell Bench Press';renderDash();renderExPicker();});
await new Promise(r=>setTimeout(r,800));
const rows=await p.evaluate(()=>[...document.querySelectorAll('#exLog .exlog-tot')].map(e=>e.textContent.replace(/\s+/g,' ').trim()));
t('exercise log: singular set',rows.some(r=>/\b1 set\b/.test(r)),JSON.stringify(rows));
t('exercise log: no "1 sets"',!rows.some(r=>/\b1 sets\b/.test(r)),JSON.stringify(rows));
t('exercise log: plural still plural',rows.some(r=>/\b3 sets\b/.test(r)),JSON.stringify(rows));

// --- the surrounding text is intact ---------------------------------------
t('history still shows volume',/kg vol/.test(meta.join(' | ')),JSON.stringify(meta));
t('exercise log still shows volume',rows.some(r=>/kg/.test(r)),JSON.stringify(rows));
t('no page errors',errs.length===0,errs.join(' | '));

await b.close();
console.log(fails?'\n'+fails+' FAILED':'\nall passed');process.exit(fails?1:0);
})();
