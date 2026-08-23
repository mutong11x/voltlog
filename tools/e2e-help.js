const {APP}=require('./lib/harness');
const os=require('os'),P=require('path');
const SHOT=n=>P.join(os.tmpdir(),'voltlog-'+n);
const puppeteer=require('puppeteer');
let fails=0;const errs=[];
const t=(n,c,x='')=>{console.log((c?'  ok  ':'FAIL  ')+n+(c?'':'   '+x));if(!c)fails++;};
(async()=>{
const b=await puppeteer.launch({args:['--no-sandbox','--allow-file-access-from-files']});
const p=await b.newPage();await p.setViewport({width:320,height:800});
p.on('pageerror',e=>errs.push(e.message));

// a first-run install: the guide must work with no data at all
await p.evaluateOnNewDocument(()=>{
  ['branches','exercises','sessions','scans','settings'].forEach(k=>localStorage.removeItem('voltlog:'+k));
});
await p.goto('file://'+APP,{waitUntil:'networkidle2'});
await new Promise(r=>setTimeout(r,800));

// --- 1. reachable from Settings -------------------------------------------
t('the Help entry exists in Settings',await p.evaluate(()=>!!document.querySelector('#helpBtn')));
t('it is labelled clearly',await p.evaluate(()=>/how it works/i.test($('#helpBtn').textContent)),
  await p.evaluate(()=>$('#helpBtn').textContent));
await p.evaluate(()=>openMore());
await new Promise(r=>setTimeout(r,300));
t('Settings opens',await p.evaluate(()=>$('#moreModal').classList.contains('open')));
await p.evaluate(()=>$('#helpBtn').click());
await new Promise(r=>setTimeout(r,350));
t('tapping it closes Settings',await p.evaluate(()=>!$('#moreModal').classList.contains('open')));
t('and opens the guide',await p.evaluate(()=>$('#helpModal').classList.contains('open')));

// --- 2. sections render, collapsed ----------------------------------------
const titles=await p.evaluate(()=>[...document.querySelectorAll('#helpBody .hitem .date')].map(e=>e.textContent.trim()));
t('every section renders',titles.length===await p.evaluate(()=>HELP_SECTIONS.length),JSON.stringify(titles));
t('sections match the data',await p.evaluate(()=>
  [...document.querySelectorAll('#helpBody .hitem .date')].map(e=>e.textContent.trim()).join('|')
  ===HELP_SECTIONS.map(s=>s.t).join('|')));
t('all start collapsed',await p.evaluate(()=>
  [...document.querySelectorAll('#helpBody .hdetail')].every(d=>!d.classList.contains('open'))));
t('collapsed bodies are not visible',await p.evaluate(()=>
  getComputedStyle(document.querySelector('#helpBody .hdetail')).display==='none'));

// --- 3. expanding ----------------------------------------------------------
await p.evaluate(()=>[...document.querySelectorAll('#helpBody .hitem-top')]
  .find(e=>/Volume/i.test(e.textContent)).click());
await new Promise(r=>setTimeout(r,250));
const open=await p.evaluate(()=>{
  const d=[...document.querySelectorAll('#helpBody .hdetail')].filter(x=>x.classList.contains('open'));
  return d.length===1?d[0].textContent.replace(/\s+/g,' ').trim():null;});
t('tapping a heading expands exactly one section',open!==null,'expected one open section');
t('the volume section explains per side',/per side/i.test(open||''),(open||'').slice(0,110));
t('...and assisted',/assisted/i.test(open||''));
t('...and dual pulley',/dual pulley/i.test(open||''));
t('the prose actually rendered as HTML, not escaped',await p.evaluate(()=>
  document.querySelectorAll('#helpBody .hdetail.open p').length>=2),
  await p.evaluate(()=>document.querySelectorAll('#helpBody .hdetail.open p').length));
t('no raw tags leaked into the text',!/<\/?(p|b|ul|li)>/.test(open||''),(open||'').slice(0,90));

// a second tap collapses it again
await p.evaluate(()=>[...document.querySelectorAll('#helpBody .hitem-top')]
  .find(e=>/Volume/i.test(e.textContent)).click());
await new Promise(r=>setTimeout(r,250));
t('tapping again collapses it',await p.evaluate(()=>
  [...document.querySelectorAll('#helpBody .hdetail')].every(d=>!d.classList.contains('open'))));

// --- 4. layout + closing ---------------------------------------------------
await p.evaluate(()=>[...document.querySelectorAll('#helpBody .hitem-top')].forEach(e=>e.click()));
await new Promise(r=>setTimeout(r,300));
t('with everything open, no horizontal overflow at 320px',await p.evaluate(()=>
  document.documentElement.scrollWidth-document.documentElement.clientWidth<=0));
t('the sheet itself does not overflow sideways',await p.evaluate(()=>{
  const s=document.querySelector('#helpModal .sheet');return s.scrollWidth<=s.clientWidth+1;}));
await p.screenshot({path:SHOT('help.png')});
await p.evaluate(()=>$('#helpModal').click());   // backdrop
await new Promise(r=>setTimeout(r,300));
t('tapping the backdrop closes it',await p.evaluate(()=>!$('#helpModal').classList.contains('open')));
t('no page errors',errs.length===0,errs.join(' | '));

await b.close();
console.log(fails?'\n'+fails+' FAILED':'\nall passed');process.exit(fails?1:0);
})();
