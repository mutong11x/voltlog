const {APP,grab}=require('./lib/harness');

let DB,TODAY='2026-08-23';
const todayStr=()=>TODAY;
const CAT_COLORS={Chest:1,Back:1,Legs:1,Shoulders:1,Arms:1,Core:1,Other:1};
const SRC=[
  [/const daysAgo=[^\n]*/,'daysAgo'],
  [/function agoShort\(d\)\{[\s\S]*?\n\}/,'agoShort'],
  [/function exIndex\(\)\{[\s\S]*?\n\}/,'exIndex'],
  [/const exCats=[^\n]*/,'exCats'],
  [/const exFilter=[^\n]*/,'exFilter'],
].map(([r,n])=>grab(r,n).replace(/^const /,'var ').replace(/^function /,'var _d=0;function '));
const RECENT='Recent';
eval(SRC.join(';\n'));

let fails=0;
const t=(n,c,x='')=>{console.log((c?'  ok  ':'FAIL  ')+n+(c?'':'   '+x));if(!c)fails++;};
const E=(name,cat)=>({exId:'x',name,cat,load:'std',sets:[{reps:5,weight:50,rpe:null,type:'W'}]});
const S=(id,date,ents)=>({id,date,branch:'Main',entries:ents});

/* ---- agoShort: chip-sized, same thresholds as agoStr ------------------ */
t('today',agoShort('2026-08-23')==='today',agoShort('2026-08-23'));
t('a future date does not go negative',agoShort('2026-09-01')==='today',agoShort('2026-09-01'));
t('1 day',agoShort('2026-08-22')==='1d',agoShort('2026-08-22'));
t('13 days is still days',agoShort('2026-08-10')==='13d',agoShort('2026-08-10'));
t('14 days becomes weeks',agoShort('2026-08-09')==='2w',agoShort('2026-08-09'));
t('59 days is still weeks',agoShort('2026-06-25')==='8w',agoShort('2026-06-25'));
t('60 days becomes months',agoShort('2026-06-24')==='2mo',agoShort('2026-06-24'));
t('it stays short enough for a chip',['2026-08-23','2026-08-10','2026-06-25','2025-08-23']
  .every(d=>agoShort(d).length<=5),JSON.stringify(['2026-08-10','2025-08-23'].map(agoShort)));

/* ---- exIndex ---------------------------------------------------------- */
DB={sessions:[
  S('a','2026-08-01',[E('Barbell Bench Press','Chest'),E('Lat Pulldown','Back')]),
  S('b','2026-08-10',[E('Back Squat','Legs')]),
  S('c','2026-08-22',[E('Lat Pulldown','Back')]),
]};
let idx=exIndex();
t('one row per exercise',idx.length===3,JSON.stringify(idx.map(x=>x.name)));
t('most recently trained first',idx[0].name==='Lat Pulldown',JSON.stringify(idx.map(x=>x.name)));
t('then the next most recent',idx[1].name==='Back Squat',JSON.stringify(idx.map(x=>x.name)));
t('last is the oldest',idx[2].name==='Barbell Bench Press');
t('last date is the LATEST, not the first',idx[0].last==='2026-08-22',idx[0].last);
t('category carried through',idx[0].cat==='Back'&&idx[2].cat==='Chest');

// a re-categorised lift files under its current body part
DB={sessions:[S('a','2026-08-01',[E('Cable Fly','Other')]),
              S('b','2026-08-20',[E('Cable Fly','Chest')])]};
t('cat comes from the most recent entry',exIndex()[0].cat==='Chest',exIndex()[0].cat);
// ...even when the sessions are stored out of order
DB={sessions:[S('b','2026-08-20',[E('Cable Fly','Chest')]),
              S('a','2026-08-01',[E('Cable Fly','Other')])]};
t('and does not depend on storage order',exIndex()[0].cat==='Chest',exIndex()[0].cat);

// entries with no sets are not a training record
DB={sessions:[S('a','2026-08-01',[E('Bench','Chest')]),
              S('b','2026-08-20',[{exId:'x',name:'Ghost',cat:'Back',sets:[]}])]};
t('an entry with no sets is ignored',exIndex().length===1&&exIndex()[0].name==='Bench',
  JSON.stringify(exIndex().map(x=>x.name)));

// same name, different case/spacing is one exercise
DB={sessions:[S('a','2026-08-01',[E('Bench','Chest')]),
              S('b','2026-08-20',[E('  bench ','Chest')])]};
t('name matching is trim/case-insensitive',exIndex().length===1,JSON.stringify(exIndex()));

// two lifts trained the same day sort by name, so the order is stable
DB={sessions:[S('a','2026-08-20',[E('Zercher Squat','Legs'),E('Arnold Press','Shoulders')])]};
t('same-day ties break by name',exIndex().map(x=>x.name).join()==='Arnold Press,Zercher Squat',
  JSON.stringify(exIndex().map(x=>x.name)));

t('no sessions gives an empty index',(DB={sessions:[]},exIndex().length===0));

/* ---- exCats: only body parts you have actually logged ----------------- */
DB={sessions:[S('a','2026-08-01',[E('Bench','Chest'),E('Lat Pulldown','Back')]),
              S('b','2026-08-20',[E('Back Squat','Legs')])]};
idx=exIndex();
let cats=exCats(idx);
t('only logged body parts appear',cats.join()==='Chest,Back,Legs',cats.join());
t('empty categories are excluded',!cats.includes('Arms')&&!cats.includes('Core'),cats.join());
t('order follows the library, not recency',cats.indexOf('Chest')<cats.indexOf('Back'),cats.join());

/* ---- exFilter --------------------------------------------------------- */
t('Recent returns everything',exFilter(idx,RECENT).length===3);
t('Recent keeps the recency order',exFilter(idx,RECENT)[0].name==='Back Squat');
t('a body part narrows it',exFilter(idx,'Back').map(x=>x.name).join()==='Lat Pulldown');
t('filtering does not mutate the index',exFilter(idx,'Back')&&idx.length===3);
t('every tab yields at least one exercise',exCats(idx).every(c=>exFilter(idx,c).length>0));
t('an unlogged body part is empty',exFilter(idx,'Arms').length===0);

console.log(fails?'\n'+fails+' FAILED':'\nall passed');process.exit(fails?1:0);
