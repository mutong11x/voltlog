const {APP,grab}=require('./lib/harness');

const SRC=[[/const HELP_SECTIONS=\[[\s\S]*?\n\];/,'HELP_SECTIONS']]
  .map(([r,n])=>grab(r,n).replace(/^const /,'var '));
eval(SRC.join(';\n'));

let fails=0;
const t=(n,c,x='')=>{console.log((c?'  ok  ':'FAIL  ')+n+(c?'':'   '+x));if(!c)fails++;};
const all=HELP_SECTIONS.map(s=>s.html).join('\n');
const allLower=all.toLowerCase();

/* ---- well-formed ------------------------------------------------------ */
t('has sections',HELP_SECTIONS.length>=5,HELP_SECTIONS.length);
t('every section has a title',HELP_SECTIONS.every(s=>typeof s.t==='string'&&s.t.trim().length>0));
t('every section has a body',HELP_SECTIONS.every(s=>typeof s.html==='string'&&s.html.trim().length>40));
t('no duplicate titles',new Set(HELP_SECTIONS.map(s=>s.t)).size===HELP_SECTIONS.length,
  JSON.stringify(HELP_SECTIONS.map(s=>s.t)));
t('titles are short enough for a row',HELP_SECTIONS.every(s=>s.t.length<=48),
  JSON.stringify(HELP_SECTIONS.map(s=>s.t).filter(x=>x.length>48)));

/* ---- balanced tags: an unclosed one would break the whole sheet -------- */
const tagCount=(h,tag)=>[(h.match(new RegExp('<'+tag+'[ >]','g'))||[]).length,
                         (h.match(new RegExp('</'+tag+'>','g'))||[]).length];
['p','b','i','ul','li','span'].forEach(tag=>{
  const bad=HELP_SECTIONS.filter(s=>{const [o,c]=tagCount(s.html,tag);return o!==c;});
  t('<'+tag+'> balanced in every section',bad.length===0,JSON.stringify(bad.map(s=>s.t)));
});
t('no stray angle brackets from a typo',!/<\s|\s>/.test(all.replace(/\n/g,' ').replace(/=>/g,'')));

/* ---- the guard that matters: every rule that moves numbers is documented */
// If a fourth volume modifier is ever added, this fails and asks for a paragraph.
t('explains per side',/per side/.test(allLower));
t('explains assisted',/assisted/.test(allLower));
t('explains dual pulley',/dual pulley/.test(allLower));
t('says assisted is excluded from volume',/left out of volume|excluded from volume/.test(allLower),
  'no phrase saying assisted work is not counted');
t('says dual counts double',/double/.test(allLower));
t('says per side does not change top set',/top set and estimated 1rm stay/.test(allLower));

/* ---- and the things a new user will not guess -------------------------- */
t('explains PRs are point-in-time',/before<\/i> that session|logged <i>before/.test(all),
  'no explanation that a PR beats what came BEFORE that session');
t('explains the New badge',/\bnew\b/.test(allLower));
t('names Evolt for PDF import',/evolt/.test(allLower));
t('says other scan formats may follow',/may follow|other scan formats/.test(allLower));
t('explains manual scan entry',/manually/.test(allLower));
t('says data is device-local',/this device/.test(allLower));
t('points at export for backups',/export/.test(allLower));
t('mentions accounts and sync as planned',/accounts and syncing|accounts and sync/.test(allLower));
t('sync is an intention, not a dated promise',!/\b20\d\d\b/.test(all)&&!/\bnext (month|release|version)\b/.test(allLower),
  'the guide should not commit to a date');

/* ---- which library settings rewrite history --------------------------- */
const lib=HELP_SECTIONS.find(s=>/library/i.test(s.t));
t('there is a library section',!!lib);
t('library section covers renaming',/renaming/i.test(lib.html));
t('library section covers body part',/body part/i.test(lib.html));
t('library section marks what is new-logs-only',/new logs only/i.test(lib.html));
t('library section says history changes ask first',/asks first/i.test(lib.html));
t('library section recommends a backup',/backup/i.test(lib.html));

console.log(fails?'\n'+fails+' FAILED':'\nall passed');process.exit(fails?1:0);
