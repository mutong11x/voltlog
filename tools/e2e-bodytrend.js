const {APP}=require('./lib/harness');
const os=require('os'),P=require('path');
const SHOT=n=>P.join(os.tmpdir(),'voltlog-'+n);
const puppeteer=require('puppeteer');
let fails=0;const errs=[];
const t=(n,c,x='')=>{console.log((c?'  ok  ':'FAIL  ')+n+(c?'':'   '+x));if(!c)fails++;};

const seedInto=(page,scans)=>page.evaluateOnNewDocument(ss=>{
  localStorage.setItem('voltlog:branches',JSON.stringify(['Main']));
  localStorage.setItem('voltlog:exercises',JSON.stringify([]));
  localStorage.setItem('voltlog:sessions',JSON.stringify([]));
  localStorage.setItem('voltlog:scans',JSON.stringify(ss));
  localStorage.setItem('voltlog:settings',JSON.stringify({lastBranch:'Main',libVer:5}));
},scans);

(async()=>{
const b=await puppeteer.launch({args:['--no-sandbox','--allow-file-access-from-files']});
const p=await b.newPage();await p.setViewport({width:320,height:900});
p.on('pageerror',e=>errs.push(e.message));

// Composition + Segmental + some Health. Deliberately NO whr, bwi, subc, bfm, water fields.
const scan=(id,date,o)=>Object.assign({id,date},o);
await seedInto(p,[
  scan('a','2026-06-01',{weight:82,lbm:62,smm:35,tbf:24,vfl:8,vfa:90,bioage:33,bmr:1680,
    larm_l:3.1,rarm_l:3.2,larm_f:.6,rarm_f:.6,lleg_l:9.1,rleg_l:9.3,lleg_f:2.1,rleg_f:2.0,
    torso_l:27,torso_f:9}),
  scan('b','2026-08-01',{weight:80,lbm:63,smm:36,tbf:21,vfl:7,vfa:80,bioage:32,bmr:1700,
    larm_l:3.3,rarm_l:3.3,larm_f:.5,rarm_f:.5,lleg_l:9.4,rleg_l:9.5,lleg_f:1.9,rleg_f:1.9,
    torso_l:28,torso_f:8}),
]);
await p.goto('file://'+APP,{waitUntil:'networkidle2'});
await new Promise(r=>setTimeout(r,800));
await p.evaluate(()=>go('body'));
await new Promise(r=>setTimeout(r,900));

const chips=sel=>p.evaluate(s=>[...document.querySelectorAll(s)].map(b=>b.textContent.trim()),sel);
const onChip=sel=>p.evaluate(s=>{const b=document.querySelector(s+'.on');return b?b.textContent.trim():null;},sel);

// --- 1. both rows, sensible defaults --------------------------------------
t('a group row renders',await p.evaluate(()=>!!document.querySelector('#trendCats')));
const groups=await chips('#trendCats .chip');
t('groups in order',groups.join()==='Composition,Segmental,Health',JSON.stringify(groups));
t('Composition selected by default',(await onChip('#trendCats .chip'))==='Composition');
const mets=await chips('#trendPick .chip');
t('opens on Weight',(await onChip('#trendPick .chip'))==='Weight',await onChip('#trendPick .chip'));
t('curTrend matches',await p.evaluate(()=>curTrend==='weight'),await p.evaluate(()=>curTrend));
t('the trend chart drew',await p.evaluate(()=>!!bodyChartObjs.find(c=>c.canvas&&c.canvas.id==='trendChart')));
t('the composition overview still renders',await p.evaluate(()=>
  !!bodyChartObjs.find(c=>c.canvas&&c.canvas.id==='compChart')));

// --- 2. unmeasured metrics are hidden --------------------------------------
t('measured metrics are shown',mets.includes('Weight')&&mets.includes('Skeletal muscle'),JSON.stringify(mets));
t('unmeasured Subcut. fat is hidden',!mets.includes('Subcut. fat'),JSON.stringify(mets));
t('unmeasured Body fat mass is hidden',!mets.includes('Body fat mass'),JSON.stringify(mets));
t('Composition shows only the four measured',mets.length===4,JSON.stringify(mets));

// --- 3. switching group ----------------------------------------------------
await p.evaluate(()=>[...document.querySelectorAll('#trendCats .chip')].find(b=>b.textContent.trim()==='Health').click());
await new Promise(r=>setTimeout(r,500));
t('the tab becomes active',(await onChip('#trendCats .chip'))==='Health');
const health=await chips('#trendPick .chip');
t('Health lists only measured health metrics',health.join()==='Visceral lvl/area,Bio age,BMR',JSON.stringify(health));
t('unmeasured Waist:hip is hidden',!health.includes('Waist:hip'),JSON.stringify(health));
t('unmeasured Water is hidden',!health.includes('Water TBW/ICF/ECF'),JSON.stringify(health));
t('selection follows into the group',await p.evaluate(()=>curTrend==='visceral'),await p.evaluate(()=>curTrend));
t('the lit chip is a visible one',(await onChip('#trendPick .chip'))==='Visceral lvl/area');
t('the chart redrew',await p.evaluate(()=>{
  const c=bodyChartObjs.find(c=>c.canvas&&c.canvas.id==='trendChart');
  return !!c&&c.data.datasets.length===2;}));   // visceral is dual-axis: level + area

await p.evaluate(()=>[...document.querySelectorAll('#trendCats .chip')].find(b=>b.textContent.trim()==='Segmental').click());
await new Promise(r=>setTimeout(r,500));
t('Segmental selects its first metric',await p.evaluate(()=>curTrend==='armlean'));
t('the L/R gap note renders',await p.evaluate(()=>/vs R/.test($('#trendInfo').textContent)),
  await p.evaluate(()=>$('#trendInfo').textContent));

// picking a metric directly still works
await p.evaluate(()=>[...document.querySelectorAll('#trendPick .chip')].find(b=>b.textContent.trim()==='Torso lean/fat').click());
await new Promise(r=>setTimeout(r,400));
t('picking a metric directly works',await p.evaluate(()=>curTrend==='torso'));

// --- 4. layout + errors -----------------------------------------------------
t('no horizontal page overflow at 320px',await p.evaluate(()=>
  document.documentElement.scrollWidth-document.documentElement.clientWidth<=0));
t('no page errors',errs.length===0,errs.join(' | '));
await p.evaluate(()=>{const e=[...document.querySelectorAll('#bodyCharts .k')].find(x=>/Detailed/.test(x.textContent));
  window.scrollTo(0,e.getBoundingClientRect().top+window.scrollY-8);});
await new Promise(r=>setTimeout(r,300));
await p.screenshot({path:SHOT('bodytrend.png')});

// --- 5. a scan carrying none of these fields --------------------------------
const p2=await b.newPage();await p2.setViewport({width:320,height:900});
p2.on('pageerror',e=>errs.push('bare: '+e.message));
await seedInto(p2,[{id:'x',date:'2026-08-01',cal:2200,macro_p:150}]);
await p2.goto('file://'+APP,{waitUntil:'networkidle2'});
await new Promise(r=>setTimeout(r,800));
await p2.evaluate(()=>go('body'));
await new Promise(r=>setTimeout(r,700));
t('bare scan: both rows empty',await p2.evaluate(()=>
  document.querySelector('#trendCats').children.length===0&&
  document.querySelector('#trendPick').children.length===0));
t('bare scan: a note explains why',await p2.evaluate(()=>
  /No detailed measurements/.test($('#trendInfo').textContent)),
  await p2.evaluate(()=>$('#trendInfo').textContent));
t('bare scan: no stale trend chart',await p2.evaluate(()=>
  !bodyChartObjs.find(c=>c.canvas&&c.canvas.id==='trendChart')));
t('bare scan: no errors',errs.length===0,errs.join(' | '));

await b.close();
console.log(fails?'\n'+fails+' FAILED':'\nall passed');process.exit(fails?1:0);
})();
