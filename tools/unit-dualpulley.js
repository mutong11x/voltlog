const {APP,grab}=require('./lib/harness');
const fs=require('fs');

let DB,draft,saved=[],toasts=[],confirmAnswer=true,curEx=null;
const save={exercises:()=>saved.push('exercises'),sessions:()=>saved.push('sessions')};
const toast=m=>toasts.push(m);
const confirm=m=>{toasts.push('[confirm] '+m);return confirmAnswer;};
const renderExList=()=>{},renderHistory=()=>{},renderDash=()=>{};
const document={querySelector:()=>null};

const SRC=[
  [/const e1rm=[^\n]*/,'e1rm'],[/const num=[^\n]*/,'num'],[/const isRev=[^\n]*/,'isRev'],
  [/const loadMult=[^\n]*/,'loadMult'],[/const minOf=[^\n]*/,'minOf'],
  [/const wMult=[^\n]*/,'wMult'],
  [/const effSets=en=>[\s\S]*?raw:st\.weight, dual:!!en\.dual\}\)\);/,'effSets'],
  [/const entryVol=[^\n]*/,'entryVol'],
  [/function setPills\(sets,rev\)\{[\s\S]*?\n\}/,'setPills'],
  [/function prMap\(\)\{[\s\S]*?\n\}/,'prMap'],[/const prsFor=[^\n]*/,'prsFor'],
  [/function exSessions\(\)\{[\s\S]*?\n\}/,'exSessions'],
].map(([r,n])=>grab(r,n).replace(/^const /,'var ').replace(/^function /,'var _d=0;function '));
eval(SRC.join(';\n'));

let fails=0;
const t=(n,c,x='')=>{console.log((c?'  ok  ':'FAIL  ')+n+(c?'':'   '+x));if(!c)fails++;};
const st=(reps,weight,rpe)=>({reps,weight,rpe:rpe??null,type:'W'});
const S=(id,date,ents)=>({id,date,branch:'Main',entries:ents});
const E=(name,sets,o={})=>({exId:o.exId||'e1',name,cat:'Back',load:o.load||'std',
  rev:!!o.rev,dual:!!o.dual,machine:'',sets});

/* ---- 1. the multiplier ---------------------------------------------- */
t('single is ×1',wMult({dual:false})===1);
t('dual is ×2',wMult({dual:true})===2);
t('missing dual reads as single',wMult({})===1&&wMult(null)===1);

const single=E('Lat Pulldown',[st(10,20)]);
const dual  =E('Lat Pulldown',[st(10,10)],{dual:true});
t('effSets doubles a dual weight',effSets(dual)[0].weight===20,JSON.stringify(effSets(dual)));
t('effSets keeps the pin setting in raw',effSets(dual)[0].raw===10);
t('effSets leaves a single weight alone',effSets(single)[0].weight===20&&effSets(single)[0].raw===20);
t('effSets does not mutate the entry',dual.sets[0].weight===10);
t('a blank weight stays blank, not 0',effSets(E('x',[st(8,null)],{dual:true}))[0].weight===null);
t('0 doubles to 0, not to blank',effSets(E('x',[st(8,0)],{dual:true}))[0].weight===0);

/* ---- 2. volume ------------------------------------------------------- */
t('dual entry volume doubles',entryVol(dual)===200,entryVol(dual));
t('10 on dual == 20 on single',entryVol(dual)===entryVol(single));
t('dual + per-side compose',entryVol(E('x',[st(10,10)],{dual:true,load:'side'}))===400);
t('assisted still wins: no volume',entryVol(E('x',[st(10,10)],{dual:true,rev:true}))===0);

/* ---- 3. PRs rank on the effective weight ----------------------------- */
DB={sessions:[
  S('a','2026-01-01',[E('Lat Pulldown',[st(10,20)])]),                  // 20 effective
  S('b','2026-01-08',[E('Lat Pulldown',[st(10,9)],{dual:true})]),       // 18 — NOT a PR
  S('c','2026-01-15',[E('Lat Pulldown',[st(10,11)],{dual:true})]),      // 22 — a PR
]};
let PM=prMap();
t('a lighter-looking dual set is not a PR',prsFor(PM,'b').prs.length===0,JSON.stringify(prsFor(PM,'b').prs));
t('a heavier effective dual set is a PR',prsFor(PM,'c').prs.length===1,JSON.stringify(prsFor(PM,'c').prs));
t('the PR value is the effective weight',prsFor(PM,'c').prs[0].val>20,JSON.stringify(prsFor(PM,'c').prs));

// assisted + dual: the record is the lowest EFFECTIVE weight
DB={sessions:[S('a','2026-02-01',[E('Assisted Pull-up',[st(8,30)],{rev:true})]),
              S('b','2026-02-08',[E('Assisted Pull-up',[st(8,20)],{rev:true,dual:true})])]}; // 40 eff — worse
PM=prMap();
t('assisted+dual: a higher effective assist is not a PR',prsFor(PM,'b').prs.length===0,JSON.stringify(prsFor(PM,'b').prs));

/* ---- 4. exSessions --------------------------------------------------- */
DB={sessions:[S('a','2026-03-01',[E('Lat Pulldown',[st(10,10),st(10,12)],{dual:true})])]};
curEx='Lat Pulldown';
let rows=exSessions();
t('top set is the effective weight',rows[0].top===24,rows[0].top);
t('est 1RM uses the effective weight',rows[0].orm>24,rows[0].orm);
t('the row is flagged dual',rows[0].dual===true);

// one exercise, two stations in one session — normalised per entry before flattening
DB={sessions:[S('a','2026-03-08',[E('Lat Pulldown',[st(10,10)],{dual:true}),
                                  E('Lat Pulldown',[st(10,15)])])]};
rows=exSessions();
t('mixed stations in one session rank correctly',rows[0].top===20,rows[0].top);
t('mixed stations sum volume correctly',rows[0].vol===350,rows[0].vol);

/* ---- 5. setPills shows raw, ranks effective -------------------------- */
let h=setPills(effSets(E('x',[st(10,10),st(10,12)],{dual:true})),false);
t('pills show the pin setting',/10×10/.test(h)&&/10×12/.test(h),h);
t('pills do not show the doubled number',!/10×24/.test(h),h);
t('heaviest effective set marked best',/best">10×12/.test(h),h);
h=setPills([st(5,60),st(5,70)],false);
t('a plain sets array still renders (no raw)',/5×60/.test(h)&&/best">5×70/.test(h),h);

/* ---- 6. the library setting is a default, not a rewrite --------------- */
// Regression guard for the real-world case: the SAME lift moves between stations week to week,
// so nothing may write a single station back over a mixed history.
const src=require('fs').readFileSync(APP,'utf8');
t('no setDual function survives',!/function setDual\s*\(/.test(src));
const handler=src.slice(src.indexOf("if(t.dataset.libdual!==undefined)"),src.indexOf("} else if(t.dataset.librev"));
t('the library handler writes only the library',/x\.dual=t\.checked;save\.exercises\(\);/.test(handler),handler.trim().slice(-90));
t('it never walks DB.sessions',!/DB\.sessions/.test(handler),handler);
t('it never saves sessions',!/save\.sessions/.test(handler),handler);
t('it never rewrites the draft',!/draft\.entries/.test(handler),handler);

/* ---- 7. mixed history stays mixed ------------------------------------ */
// two sessions of one lift on different stations: each keeps its own scale
DB={sessions:[S('a','2026-05-01',[E('Lat Pulldown',[st(10,20)])]),                 // single, 20 eff
              S('b','2026-05-08',[E('Lat Pulldown',[st(10,10)],{dual:true})])]};   // dual,   20 eff
curEx='Lat Pulldown';
rows=exSessions();
t('a mixed history lines up on effective weight',rows[0].top===20&&rows[1].top===20,
  JSON.stringify(rows.map(r=>r.top)));
t('and the volumes match too',rows[0].vol===rows[1].vol,rows[0].vol+' vs '+rows[1].vol);
PM=prMap();
t('neither session out-PRs the other',prsFor(PM,'b').prs.length===0,JSON.stringify(prsFor(PM,'b').prs));
t('each row keeps its own station',rows[0].dual===false&&rows[1].dual===true);

console.log(fails?'\n'+fails+' FAILED':'\nall passed');process.exit(fails?1:0);
