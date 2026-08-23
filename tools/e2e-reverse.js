const {APP,grab}=require('./lib/harness');
const os=require('os'),P=require('path');
const SHOT=n=>P.join(os.tmpdir(),'voltlog-'+n);
const puppeteer=require('puppeteer');
const path='file://'+APP;
let fails=0;
const t=(n,c,x='')=>{console.log((c?'  ok  ':'FAIL  ')+n+(c?'':'   '+x));if(!c)fails++;};

(async()=>{
const browser=await puppeteer.launch({args:['--no-sandbox','--allow-file-access-from-files']});
const page=await browser.newPage();
await page.setViewport({width:320,height:720});           // the 320px floor CLAUDE.md requires
page.on('pageerror',e=>{console.log('PAGE ERROR: '+e.message);fails++;});
page.on('dialog',async d=>{console.log('  [dialog] '+d.message().split('\n')[0]);await d.accept();});

// seed storage before the app boots
await page.evaluateOnNewDocument(()=>{
  const ex=[{id:'e1',name:'Assisted Pull-up',cat:'Back',load:'std'},
            {id:'e2',name:'Barbell Bench Press',cat:'Chest',load:'std'}];
  const mk=(id,date,w)=>({id,date,branch:'Main',bodyweight:null,notes:'',entries:[
    {exId:'e1',name:'Assisted Pull-up',cat:'Back',load:'std',machine:'',remarks:'',sets:[{reps:8,weight:w,rpe:null,type:'W'}]},
    {exId:'e2',name:'Barbell Bench Press',cat:'Chest',load:'std',machine:'',remarks:'',sets:[{reps:5,weight:60,rpe:8,type:'W'}]}]});
  const d={'voltlog:branches':['Main'],'voltlog:exercises':ex,
    'voltlog:sessions':[mk('s1','2026-08-01',40),mk('s2','2026-08-08',30),mk('s3','2026-08-15',45)],
    'voltlog:scans':[],'voltlog:settings':{lastBranch:'Main',libVer:5}};
  for(const k in d) localStorage.setItem(k,JSON.stringify(d[k]));
});
await page.goto('file://'+APP,{waitUntil:'networkidle2'});
await new Promise(r=>setTimeout(r,900));

const volOf=()=>page.evaluate(()=>DB.sessions.reduce((a,s)=>a+s.entries.reduce((x,e)=>x+entryVol(e),0),0));
t('app booted without errors',true);
t('baseline volume counts the assisted lift',await volOf()===1820,await volOf());

// --- open the library and tick the Assisted box for real -----------------
await page.evaluate(()=>{openLib();});
await new Promise(r=>setTimeout(r,250));
const boxes=await page.$$('#libList input[type=checkbox][data-librev]');
t('every library row has an Assisted checkbox',boxes.length===2,boxes.length);
const boxVisible=await page.evaluate(()=>{
  const b=document.querySelector('#libList input[data-librev]');const r=b.getBoundingClientRect();
  return {w:Math.round(r.width),h:Math.round(r.height),vis:getComputedStyle(b).appearance};
});
t('checkbox survives the global input reset',boxVisible.w>=14&&boxVisible.w<=24&&boxVisible.h>=14,JSON.stringify(boxVisible));

// click the Assisted box on the Assisted Pull-up row
await page.evaluate(()=>{
  const x=DB.exercises.find(e=>e.name==='Assisted Pull-up');
  const b=document.querySelector(`#libList input[data-librev="${x.id}"]`);
  b.click();
});
await new Promise(r=>setTimeout(r,300));
t('library flag set',await page.evaluate(()=>!!DB.exercises.find(e=>e.name==='Assisted Pull-up').rev));
t('past entries backfilled',await page.evaluate(()=>DB.sessions.every(s=>s.entries.find(e=>e.name==='Assisted Pull-up').rev===true)));
t('volume dropped to bench only',await volOf()===900,await volOf());
t('flag persisted to storage',await page.evaluate(()=>JSON.parse(localStorage.getItem('voltlog:sessions'))[0].entries[0].rev===true));
t('checkbox stays ticked after re-render',await page.evaluate(()=>{
  const x=DB.exercises.find(e=>e.name==='Assisted Pull-up');
  return document.querySelector(`#libList input[data-librev="${x.id}"]`).checked===true;}));

await page.evaluate(()=>$('#libModal').classList.remove('open'));

// --- dashboard ------------------------------------------------------------
await page.evaluate(()=>{go('dash');renderDash();});
await new Promise(r=>setTimeout(r,700));
const weekVolTile=await page.evaluate(()=>[...document.querySelectorAll('#weekStats .stat')].map(e=>e.textContent.trim()));
t('week stats render',weekVolTile.length===4,JSON.stringify(weekVolTile));
const stack=await page.evaluate(()=>{
  const c=dashCharts.find(c=>c.canvas.id==='volChart');
  return c?c.data.datasets.map(d=>({label:d.label,total:d.data.reduce((a,b)=>a+b,0)})):null;});
t('assisted work contributes nothing to the Back stack',
  !stack.some(d=>d.label==='Back'&&d.total>0),JSON.stringify(stack));

await page.evaluate(()=>{curEx='Assisted Pull-up';renderExPicker();});
await new Promise(r=>setTimeout(r,500));
const mets=await page.evaluate(()=>[...document.querySelectorAll('#exMetric button')].map(b=>b.textContent));
t('1RM and Volume hidden, Top set relabelled',JSON.stringify(mets)==='["Least assist","Reps"]',JSON.stringify(mets));
const pb=await page.evaluate(()=>$('#exPb').textContent);
t('best = least assistance (30), not the most (45)',/Best\s*30\s*kg/.test(pb),pb);
const exlog=await page.evaluate(()=>$('#exLog').textContent.replace(/\s+/g,' '));
t('per-exercise log says assisted, no volume figure',/assisted/.test(exlog)&&!/kg\b.*\d+kg/.test(exlog.split('assisted')[1]||''),exlog.slice(0,120));

// --- PR direction, end to end --------------------------------------------
const prs=await page.evaluate(()=>{const M=prMap();
  return DB.sessions.map(s=>({d:s.date,prs:prsFor(M,s.id).prs.map(p=>p.kind+':'+p.val),news:prsFor(M,s.id).news}));});
t('debut marks New only',prs[0].prs.length===0&&prs[0].news.length===2,JSON.stringify(prs[0]));
t('40->30 assist fires an Assist PR',prs[1].prs.includes('Assist:30'),JSON.stringify(prs[1]));
t('30->45 assist fires nothing for the assisted lift',!prs[2].prs.some(p=>p.startsWith('Assist')),JSON.stringify(prs[2]));

// --- history view ---------------------------------------------------------
await page.evaluate(()=>{go('hist');renderHistory();});
await new Promise(r=>setTimeout(r,300));
const hist=await page.evaluate(()=>$('#histList').textContent.replace(/\s+/g,' '));
t('history marks the assisted entry',/assisted · no vol/.test(hist),hist.slice(0,150));
t('history session volume excludes it',/300 kg vol/.test(hist),hist.match(/[\d,]+ kg vol/g));

// --- logging a new one through the real save path -------------------------
await page.evaluate(()=>{
  go('log');resetDraft();draft.branch='Main';
  addExerciseToDraft(DB.exercises.find(e=>e.name==='Assisted Pull-up'));
  draft.entries[0].sets[0]={reps:'8',weight:'15',rpe:'',type:'W'};
  renderExList();
});
await new Promise(r=>setTimeout(r,250));
const tag=await page.evaluate(()=>$('#exList').textContent.replace(/\s+/g,' '));
t('log card shows the assisted pill',/assisted · no vol/i.test(tag),tag.slice(0,140));
await page.evaluate(()=>{$('#sessDate').value='2026-08-22';$('#saveSess').click();});
await new Promise(r=>setTimeout(r,500));
t('new entry saved carrying rev',await page.evaluate(()=>{
  const s=DB.sessions.find(s=>s.date==='2026-08-22');return !!(s&&s.entries[0].rev);}));
t('new session adds no volume',await volOf()===900,await volOf());
t('15kg assist beats the 30kg record',await page.evaluate(()=>{
  const s=DB.sessions.find(s=>s.date==='2026-08-22');
  return prsFor(prMap(),s.id).prs.some(p=>p.kind==='Assist'&&p.val===15);}));

// --- no horizontal overflow at 320px --------------------------------------
await page.evaluate(()=>{openLib();});
await new Promise(r=>setTimeout(r,300));
const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
t('no horizontal overflow at 320px',overflow<=0,'overflow '+overflow+'px');
await page.screenshot({path: SHOT('lib.png')});

await browser.close();
console.log(fails?'\n'+fails+' FAILED':'\nall passed');
process.exit(fails?1:0);
})();
