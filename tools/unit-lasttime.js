const {APP,grab}=require('./lib/harness');
const os=require('os'),P=require('path');
const SHOT=n=>P.join(os.tmpdir(),'voltlog-'+n);
const fs=require('fs'),js=fs.readFileSync(APP,'utf8').match(/<script>([\s\S]*)<\/script>/)[1];
let DB,TODAY='2026-08-23';
const SRC=[
  [/const e1rm=[^\n]*/,'e1rm'],[/const num=[^\n]*/,'num'],[/const isRev=[^\n]*/,'isRev'],
  [/const fmtDate=[^\n]*/,'fmtDate'],
  [/const daysAgo=[^\n]*/,'daysAgo'],
  [/function agoStr\(d\)\{[\s\S]*?\n\}/,'agoStr'],
  [/function prevEntry\(name,beforeDate,excludeId\)\{[\s\S]*?\n\}/,'prevEntry'],
  [/function setPills\(sets,rev\)\{[\s\S]*?\n\}/,'setPills'],
].map(([r,n])=>grab(r,n).replace(/^const /,'var ').replace(/^function /,'var _x=0;function '));
const todayStr=()=>TODAY;
eval(SRC.join(';\n'));

let fails=0;const t=(n,c,x='')=>{console.log((c?'  ok  ':'FAIL  ')+n+(c?'':'   '+x));if(!c)fails++;};
const st=(reps,weight,rpe)=>({reps,weight,rpe:rpe??null,type:'W'});
const S=(id,date,ents)=>({id,date,branch:'Main',entries:ents});
const E=(name,sets,o={})=>({exId:o.exId||'e1',name,cat:'Chest',load:o.load||'std',rev:!!o.rev,machine:o.machine||'',sets});

/* ---- agoStr ---- */
t('today',agoStr('2026-08-23')==='today',agoStr('2026-08-23'));
t('yesterday',agoStr('2026-08-22')==='yesterday',agoStr('2026-08-22'));
t('5 days',agoStr('2026-08-18')==='5 days ago',agoStr('2026-08-18'));
t('2 wks',agoStr('2026-08-09')==='2 wks ago',agoStr('2026-08-09'));
t('3 mo',agoStr('2026-05-25')==='3 mo ago',agoStr('2026-05-25'));
t('a future date does not read as negative',agoStr('2026-09-01')==='today',agoStr('2026-09-01'));

/* ---- prevEntry ---- */
DB={sessions:[
  S('a','2026-08-01',[E('Bench',[st(5,60)])]),
  S('b','2026-08-08',[E('Bench',[st(5,62.5)]),E('Row',[st(8,40)])]),
  S('c','2026-08-15',[E('Bench',[st(5,65)])]),
]};
t('picks the most recent',prevEntry('Bench','2026-08-23',null).date==='2026-08-15');
t('respects the cutoff date',prevEntry('Bench','2026-08-10',null).date==='2026-08-08');
t('cutoff is inclusive of the same day',prevEntry('Bench','2026-08-08',null).date==='2026-08-08');
t('excludes the session being edited',prevEntry('Bench','2026-08-15','c').date==='2026-08-08');
t('editing the oldest gives nothing',prevEntry('Bench','2026-08-01','a')===null);
t('unknown exercise gives nothing',prevEntry('Deadlift','2026-08-23',null)===null);
t('name match is trim/case-insensitive',prevEntry('  bENch ','2026-08-23',null).date==='2026-08-15');
t('returns the right entry, not just the session',prevEntry('Row','2026-08-23',null).entry.sets[0].weight===40);

// an entry with no sets is not a "last time"
DB.sessions.push(S('d','2026-08-20',[E('Bench',[])]));
t('skips an entry with no sets',prevEntry('Bench','2026-08-23',null).date==='2026-08-15');

// two sessions on one day: the later id wins, and the second sees the first
DB={sessions:[S('m1','2026-08-20',[E('Bench',[st(5,50)])]),
              S('m2','2026-08-20',[E('Bench',[st(5,55)])])]};
t('same day: later id wins',prevEntry('Bench','2026-08-23',null).entry.sets[0].weight===55);
t('same day: second session sees the first',prevEntry('Bench','2026-08-20','m2').entry.sets[0].weight===50);

/* ---- setPills ---- */
const heavy=[st(5,60),st(5,70),st(5,65)];
let h=setPills(heavy,false);
t('normal: heaviest is best',(h.match(/setpill best/g)||[]).length===1&&/best">5×70/.test(h),h);
const assisted=[st(8,40),st(8,25),st(8,30)];
h=setPills(assisted,true);
t('assisted: lightest is best',(h.match(/setpill best/g)||[]).length===1&&/best">8×25/.test(h),h);
h=setPills([st(8,''),st(10,'')],false);
t('bodyweight sets: nothing marked best',!/setpill best/.test(h),h);
h=setPills([st(5,60,8)],false);
t('rpe rendered when present',/@8/.test(h),h);
h=setPills([st(8,0),st(8,10)],true);
t('assisted: 0 kg is the best, not a blank',/best">8×0/.test(h),h);
h=setPills([st('',''),st(5,60)],false);
t('empty set renders as dashes',/–×–/.test(h),h);

console.log(fails?'\n'+fails+' FAILED':'\nall passed');process.exit(fails?1:0);
