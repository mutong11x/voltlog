const {APP,grab}=require('./lib/harness');
const os=require('os'),P=require('path');
const SHOT=n=>P.join(os.tmpdir(),'voltlog-'+n);
const fs=require('fs'),js=fs.readFileSync(APP,'utf8').match(/<script>([\s\S]*)<\/script>/)[1];

let DB,draft,curEx=null,saved=[],toasts=[],confirmAnswer=true,curMetric='1rm';
const save={exercises:()=>saved.push('exercises'),sessions:()=>saved.push('sessions')};
const toast=m=>toasts.push(m);
const confirm=m=>{toasts.push('[confirm] '+m);return confirmAnswer;};
const renderExList=()=>{},renderHistory=()=>{},renderDash=()=>{};
const document={querySelector:()=>null};

const SRC=[
  [/const e1rm=[^\n]*/,'e1rm'],
  [/const num=[^\n]*/,'num'],
  [/const isRev=[^\n]*/,'isRev'],
  [/const loadMult=[^\n]*/,'loadMult'],
  [/const minOf=[^\n]*/,'minOf'],
  [/const wMult=[^\n]*/,'wMult'],
  [/const effSets=en=>[\s\S]*?raw:st\.weight, dual:!!en\.dual\}\)\);/,'effSets'],
  [/const entryVol=[^\n]*/,'entryVol'],
  [/function prMap\(\)\{[\s\S]*?\n\}/,'prMap'],
  [/const prsFor=[^\n]*/,'prsFor'],
  [/function exSessions\(\)\{[\s\S]*?\n\}/,'exSessions'],
  [/const METRICS=[^\n]*/,'METRICS'],
  [/const metricVal=[^\n]*/,'metricVal'],
  [/const curExRev=[^\n]*/,'curExRev'],
  [/const metricsFor=[^\n]*/,'metricsFor'],
  [/const metricLabel=[^\n]*/,'metricLabel'],
  [/function setReverse\(x,on\)\{[\s\S]*?\n\}/,'setReverse']
].map(([re,n])=>grab(re,n).replace(/^const /,'var ').replace(/^function /,'var _x=0;function '));
eval(SRC.join(';\n'));

let fails=0;
const t=(n,c,x='')=>{console.log((c?'  ok  ':'FAIL  ')+n+(c?'':'   '+x));if(!c)fails++;};
const S=(id,date,entries)=>({id,date,branch:'Main',entries});
const E=(name,sets,o={})=>({exId:o.exId||'e1',name,cat:'Back',load:o.load||'std',rev:!!o.rev,sets});
const st=(reps,weight)=>({reps,weight,rpe:null,type:'W'});

/* ---- 1. volume exclusion --------------------------------------------- */
const norm=E('Pull-up',[st(8,20),st(8,20)]);
const rev =E('Assisted Pull-up',[st(8,20),st(8,20)],{rev:true});
const side=E('Split Squat',[st(10,30)],{load:'side'});
t('normal entry counts',entryVol(norm)===320,entryVol(norm));
t('per-side still doubles',entryVol(side)===600,entryVol(side));
t('reverse entry contributes 0',entryVol(rev)===0,entryVol(rev));
t('reverse beats per-side if both set',entryVol(E('x',[st(10,30)],{load:'side',rev:true}))===0);
t('missing rev reads as normal',entryVol({sets:[st(5,10)]})===50);
t('reverse leaves set count alone',rev.sets.length===2);

/* ---- 2. PR direction -------------------------------------------------- */
DB={sessions:[
  S('a','2026-01-01',[E('Assisted Pull-up',[st(8,40)],{rev:true})]),
  S('b','2026-01-08',[E('Assisted Pull-up',[st(8,30)],{rev:true})]),   // less help -> PR
  S('c','2026-01-15',[E('Assisted Pull-up',[st(8,45)],{rev:true})]),   // more help -> no PR
  S('d','2026-01-22',[E('Assisted Pull-up',[st(8,20)],{rev:true})]),   // less help -> PR
]};
let PM=prMap();
t('debut is New, not a PR',prsFor(PM,'a').news.includes('Assisted Pull-up')&&!prsFor(PM,'a').prs.length);
t('less assistance = PR',prsFor(PM,'b').prs.length===1&&prsFor(PM,'b').prs[0].val===30,JSON.stringify(prsFor(PM,'b').prs));
t('PR is labelled Assist',prsFor(PM,'b').prs[0].kind==='Assist'&&prsFor(PM,'b').prs[0].rev===true);
t('MORE assistance is NOT a PR',prsFor(PM,'c').prs.length===0,JSON.stringify(prsFor(PM,'c').prs));
t('running best is the minimum, not the latest',prsFor(PM,'d').prs.length===1&&prsFor(PM,'d').prs[0].val===20);
t('no 1RM PR ever fires for reverse',[...PM.values()].every(v=>v.prs.every(p=>p.kind==='Assist')));

// zero assistance is a real achievement, not a missing value
DB={sessions:[S('a','2026-01-01',[E('Assisted Pull-up',[st(8,10)],{rev:true})]),
              S('b','2026-01-08',[E('Assisted Pull-up',[st(8,0)],{rev:true})])]};
PM=prMap();
t('0 kg assist counts as a PR',prsFor(PM,'b').prs.length===1&&prsFor(PM,'b').prs[0].val===0,JSON.stringify(prsFor(PM,'b').prs));

// normal exercises are untouched
DB={sessions:[S('a','2026-01-01',[E('Bench',[st(5,60)])]),
              S('b','2026-01-08',[E('Bench',[st(5,70)])]),
              S('c','2026-01-15',[E('Bench',[st(5,50)])])]};
PM=prMap();
t('normal: heavier is still a PR',prsFor(PM,'b').prs.length===1&&prsFor(PM,'b').prs[0].kind==='1RM');
t('normal: lighter is not a PR',prsFor(PM,'c').prs.length===0);

/* ---- 3. dashboard rows ------------------------------------------------ */
DB={sessions:[S('a','2026-01-01',[E('Assisted Pull-up',[st(8,40),st(8,35)],{rev:true})]),
              S('b','2026-01-08',[E('Assisted Pull-up',[st(8,25),st(8,30)],{rev:true})])]};
curEx='Assisted Pull-up';
let rows=exSessions();
t('row carries rev',rows.every(r=>r.rev===true));
t('least = smallest weight of the session',rows[0].least===35&&rows[1].least===25,JSON.stringify(rows.map(r=>r.least)));
t('volume is 0 for reverse rows',rows.every(r=>r.vol===0));
t('top metric returns least for reverse',metricVal(rows[1],'top')===25);
t('curExRev detects it',curExRev()===true);
t('metrics hide 1RM and volume',metricsFor(true).map(m=>m[0]).join()==='top,reps');
t('top is relabelled',metricLabel(METRICS.find(m=>m[0]==='top'),true)==='Least assist');
t('normal exercise keeps all four metrics',metricsFor(false).length===4);
t('normal label unchanged',metricLabel(METRICS.find(m=>m[0]==='top'),false)==='Top set');

/* ---- 4. setReverse backfill ------------------------------------------- */
const fresh=()=>{
  DB={exercises:[{id:'e1',name:'Assisted Pull-up',cat:'Back',load:'std'}],
      sessions:[S('a','2026-01-01',[E('Assisted Pull-up',[st(8,40)])]),
                S('b','2026-01-08',[E('Assisted Pull-up',[st(8,30)],{exId:'stale'})]),
                S('c','2026-01-15',[E('Bench',[st(5,60)],{exId:'zz'})])]};
  draft={entries:[E('Assisted Pull-up',[st(8,20)])]};
  saved=[];toasts=[];confirmAnswer=true;
};
fresh();
const totalVol=()=>DB.sessions.reduce((a,s)=>a+s.entries.reduce((x,e)=>x+entryVol(e),0),0);
const before=totalVol();
t('flag applies',setReverse(DB.exercises[0],true)===true&&DB.exercises[0].rev===true);
t('backfilled by exId',DB.sessions[0].entries[0].rev===true);
t('backfilled by name (stale id)',DB.sessions[1].entries[0].rev===true);
t('other exercise untouched',DB.sessions[2].entries[0].rev===false);
t('unsaved draft backfilled',draft.entries[0].rev===true);
t('volume dropped',totalVol()===300&&before===860,before+' -> '+totalVol());
t('confirm names the session count',toasts.some(m=>/^\[confirm\][\s\S]*2 past sessions/.test(m)),JSON.stringify(toasts));
t('sessions persisted',saved.includes('sessions'));

fresh();confirmAnswer=false;
t('cancel returns false',setReverse(DB.exercises[0],true)===false);
t('cancel changes nothing',!DB.exercises[0].rev&&!DB.sessions[0].entries[0].rev&&saved.length===0);

fresh();setReverse(DB.exercises[0],true);saved=[];toasts=[];
t('un-flagging restores volume',setReverse(DB.exercises[0],false)===true&&totalVol()===860,totalVol());
t('idempotent: same value is a no-op',setReverse(DB.exercises[0],false)===false);

console.log(fails?'\n'+fails+' FAILED':'\nall '+(24)+'+ passed');
process.exit(fails?1:0);
