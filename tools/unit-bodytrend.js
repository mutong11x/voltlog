const {APP,grab}=require('./lib/harness');

let DB;
const SRC=[
  [/const TREND_GROUPS=[^\n]*/,'TREND_GROUPS'],
  [/const TREND_METRICS=\[[\s\S]*?\n\];/,'TREND_METRICS'],
  [/const scanHas=[^\n]*/,'scanHas'],
  [/const trendAvail=[^\n]*/,'trendAvail'],
  [/const trendGroupsFor=[^\n]*/,'trendGroupsFor'],
  [/const trendFilter=[^\n]*/,'trendFilter'],
  [/const PAIR_KEYS=[^\n]*/,'PAIR_KEYS'],
].map(([r,n])=>grab(r,n).replace(/^const /,'var '));
eval(SRC.join(';\n'));

let fails=0;
const t=(n,c,x='')=>{console.log((c?'  ok  ':'FAIL  ')+n+(c?'':'   '+x));if(!c)fails++;};
const K=m=>m.map(x=>x.k);

/* ---- the metric list survived regrouping ------------------------------ */
t('all 17 metrics still present',TREND_METRICS.length===17,TREND_METRICS.length);
t('no duplicate keys',new Set(K(TREND_METRICS)).size===17,JSON.stringify(K(TREND_METRICS)));
t('every metric has a group',TREND_METRICS.every(m=>TREND_GROUPS.includes(m.g)),
  JSON.stringify(TREND_METRICS.filter(m=>!TREND_GROUPS.includes(m.g)).map(m=>m.k)));
t('every metric still has fields',TREND_METRICS.every(m=>m.fields&&m.fields.length>0));
t('every metric still has a label',TREND_METRICS.every(m=>!!m.label));
const count=g=>TREND_METRICS.filter(m=>m.g===g).length;
t('groups split 6 / 5 / 6',[count('Composition'),count('Segmental'),count('Health')].join()==='6,5,6',
  [count('Composition'),count('Segmental'),count('Health')].join());
t('groups are contiguous in the array',
  TREND_GROUPS.map(g=>K(TREND_METRICS.filter(m=>m.g===g))).flat().join()===K(TREND_METRICS).join());
t('Weight is first, so the drawTrendChart fallback is sane',TREND_METRICS[0].k==='weight');
t('the default metric exists and is in Composition',
  TREND_METRICS.find(m=>m.k==='weight').g==='Composition');
t('PAIR_KEYS all still resolve after the reorder',
  PAIR_KEYS.every(k=>TREND_METRICS.some(m=>m.k===k)),JSON.stringify(PAIR_KEYS));
t('PAIR_KEYS are all Segmental',PAIR_KEYS.every(k=>TREND_METRICS.find(m=>m.k===k).g==='Segmental'));

/* ---- scanHas: what counts as data ------------------------------------- */
const W=TREND_METRICS.find(m=>m.k==='weight');
const ARM=TREND_METRICS.find(m=>m.k==='armlean');       // larm_l + rarm_l
t('a value counts',scanHas(W,[{weight:80}])===true);
t('null does not',scanHas(W,[{weight:null}])===false);
t('undefined does not',scanHas(W,[{weight:undefined}])===false);
t('a missing key does not',scanHas(W,[{}])===false);
t('ZERO counts as a real measurement',scanHas(W,[{weight:0}])===true);
t('no scans at all is false',scanHas(W,[])===false);
t('any scan having it is enough',scanHas(W,[{weight:null},{weight:80}])===true);
t('any FIELD of a multi-field metric is enough',scanHas(ARM,[{larm_l:3.2,rarm_l:null}])===true);
t('a multi-field metric with neither field is false',scanHas(ARM,[{larm_l:null,rarm_l:null}])===false);

/* ---- availability + grouping ------------------------------------------ */
DB={scans:[{weight:80,smm:35,larm_l:3.2,rarm_l:3.3,bmr:1700}]};
let avail=trendAvail();
t('only measured metrics are available',K(avail).sort().join()==='armlean,bmr,smm,weight',
  JSON.stringify(K(avail)));
t('unmeasured metrics are dropped',!K(avail).includes('whr')&&!K(avail).includes('bwi'),
  JSON.stringify(K(avail)));
t('groups present follow availability',trendGroupsFor(avail).join()==='Composition,Segmental,Health',
  trendGroupsFor(avail).join());

// nothing segmental measured -> that tab disappears
DB={scans:[{weight:80,smm:35}]};
avail=trendAvail();
t('a group with nothing available gets no tab',trendGroupsFor(avail).join()==='Composition',
  trendGroupsFor(avail).join());
t('group order follows TREND_GROUPS, not the data',
  trendGroupsFor(trendAvail()).every((g,i,a)=>i===0||TREND_GROUPS.indexOf(a[i-1])<TREND_GROUPS.indexOf(g)));

// a scan with no trend fields at all
DB={scans:[{date:'2026-08-01',cal:2000}]};
t('a scan with none of these fields yields nothing',trendAvail().length===0);
t('and therefore no groups',trendGroupsFor(trendAvail()).length===0);

/* ---- trendFilter ------------------------------------------------------- */
DB={scans:[{weight:80,smm:35,larm_l:3.2,bmr:1700,whr:0.85}]};
avail=trendAvail();
t('filter narrows to one group',trendFilter(avail,'Segmental').every(m=>m.g==='Segmental'));
t('filter keeps array order',K(trendFilter(avail,'Composition')).join()==='weight,smm',
  JSON.stringify(K(trendFilter(avail,'Composition'))));
t('filter does not mutate',(trendFilter(avail,'Health'),avail.length===5),avail.length);
t('every available group yields at least one metric',
  trendGroupsFor(avail).every(g=>trendFilter(avail,g).length>0));
t('an unavailable group filters to empty',trendFilter(avail,'Nonsense').length===0);

console.log(fails?'\n'+fails+' FAILED':'\nall passed');process.exit(fails?1:0);
