const {APP,grab}=require('./lib/harness');
const os=require('os'),P=require('path');
const SHOT=n=>P.join(os.tmpdir(),'voltlog-'+n);
const fs=require('fs'),src=fs.readFileSync(APP,'utf8');
const js=src.match(/<script>([\s\S]*)<\/script>/)[1];

// --- stubs -------------------------------------------------------------
let DB, draft, curEx=null, saved=[], toasts=[], confirmAnswer=true, rendered=[];
const save={exercises:()=>saved.push('exercises'),sessions:()=>saved.push('sessions'),settings:()=>saved.push('settings')};
const toast=m=>toasts.push(m);
const confirm=m=>{toasts.push('[confirm] '+m);return confirmAnswer;};
const renderExList=()=>rendered.push('exList'), renderHistory=()=>rendered.push('hist'), renderDash=()=>rendered.push('dash');
const uid=()=>'u'+Math.random().toString(36).slice(2,7);
const document={querySelector:()=>null};
const CAT_COLORS={Chest:1,Back:1,Legs:1,Shoulders:1,Arms:1,Core:1,Other:1};
const entryVol=e=>e.sets.reduce((a,s)=>a+s.weight*s.reps,0)*(e.load==='side'?2:1);

const LIB_VER=+js.match(/const LIB_VER\s*=\s*(\d+)/)[1];
const SEED_EX=[], seedExercises=()=>[];
eval(grab(/function recategorize\(x,cat\)\{[\s\S]*?\n\}/,'recategorize'));
eval(grab(/function migrateLibrary\(\)\{[\s\S]*?\n\}/,'migrateLibrary'));

// --- fixture -----------------------------------------------------------
const fresh=()=>{
  DB={exercises:[{id:'e1',name:'Cable Row',cat:'Back',load:'std'},
                 {id:'e2',name:'Face Pull',cat:'Shoulders',load:'std'}],
      sessions:[{id:'s1',date:'2026-08-01',entries:[
                  {exId:'e1',name:'Cable Row',cat:'Other',load:'std',sets:[{weight:50,reps:10}]},
                  {exId:'zz',name:'Face Pull',cat:'Other',load:'std',sets:[{weight:20,reps:12}]}]},
                {id:'s2',date:'2026-08-08',entries:[
                  {exId:'e9',name:'Gone Lift',cat:'Other',load:'std',sets:[{weight:10,reps:5}]}]}],
      settings:{libVer:4}};
  draft={branch:null,entries:[{exId:'e1',name:'Cable Row',cat:'Other',load:'std',sets:[]}],editingId:null};
  saved=[];toasts=[];rendered=[];
};
const cats=()=>DB.sessions.flatMap(s=>s.entries.map(e=>e.name+'='+e.cat)).join(' | ');
const vol=()=>{const d={};DB.sessions.forEach(s=>s.entries.forEach(e=>{const c=CAT_COLORS[e.cat]?e.cat:'Other';d[c]=(d[c]||0)+entryVol(e);}));return d;};

let fails=0;
const t=(name,cond,extra='')=>{console.log((cond?'  ok  ':'FAIL  ')+name+(cond?'':'  '+extra));if(!cond)fails++;};

// 1. migration resyncs cat by id AND by name; leaves orphans alone
fresh();
const ran=migrateLibrary();
t('migration ran',ran===true);
t('libVer bumped to '+LIB_VER,DB.settings.libVer===LIB_VER,DB.settings.libVer);
t('matched by exId -> Back',DB.sessions[0].entries[0].cat==='Back',cats());
t('matched by name (stale id) -> Shoulders',DB.sessions[0].entries[1].cat==='Shoulders',cats());
t('exercise no longer in library keeps its cat',DB.sessions[1].entries[0].cat==='Other',cats());
t('no volume moved into a wrong bucket',JSON.stringify(vol())==='{"Back":500,"Shoulders":240,"Other":50}',JSON.stringify(vol()));
t('migration is silent (no confirm/toast)',toasts.length===0,JSON.stringify(toasts));

// 2. migration is guarded — does not re-run on an already-current install
fresh();DB.settings.libVer=LIB_VER;
t('guarded: no-op when already current',migrateLibrary()===false&&DB.sessions[0].entries[0].cat==='Other',cats());

// 3. recategorize backfills + confirms
fresh();confirmAnswer=true;
const r=recategorize(DB.exercises[0],'Arms');
t('recategorize returns true',r===true);
t('library updated',DB.exercises[0].cat==='Arms');
t('past entry backfilled by id',DB.sessions[0].entries[0].cat==='Arms',cats());
t('unsaved draft backfilled',draft.entries[0].cat==='Arms',draft.entries[0].cat);
t('other exercise untouched',DB.sessions[0].entries[1].cat==='Other',cats());
t('confirm shown with session count',toasts.some(m=>/^\[confirm\][\s\S]*1 past session\b/.test(m)),JSON.stringify(toasts));
t('sessions persisted',saved.includes('sessions')&&saved.includes('exercises'),JSON.stringify(saved));

// 4. cancelling changes nothing
fresh();confirmAnswer=false;
t('cancel returns false',recategorize(DB.exercises[0],'Arms')===false);
t('cancel leaves library alone',DB.exercises[0].cat==='Back');
t('cancel leaves history alone',DB.sessions[0].entries[0].cat==='Other',cats());
t('cancel persists nothing',saved.length===0,JSON.stringify(saved));

// 5. no history -> no confirm, no session write
fresh();confirmAnswer=false;DB.sessions=[];draft.entries=[];
t('no past entries: applies without asking',recategorize(DB.exercises[0],'Core')===true&&DB.exercises[0].cat==='Core');
t('no past entries: no confirm, no session save',toasts.length===0&&!saved.includes('sessions'),JSON.stringify(toasts)+JSON.stringify(saved));

// 6. same category is a no-op
fresh();
t('same cat is a no-op',recategorize(DB.exercises[0],'Back')===false&&saved.length===0);
t('empty cat is a no-op',recategorize(DB.exercises[0],'')===false);

// 7. name matching is trim/case-insensitive
fresh();confirmAnswer=true;DB.sessions[0].entries[0].exId='stale';DB.sessions[0].entries[0].name='  cable ROW ';
recategorize(DB.exercises[0],'Legs');
t('name match is trimmed + case-insensitive',DB.sessions[0].entries[0].cat==='Legs',cats());

console.log(fails?'\n'+fails+' FAILED':'\nall passed');
process.exit(fails?1:0);
