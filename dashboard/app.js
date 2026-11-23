/* TOKEN RADAR v7 — reads ../data.js, no framework, no network, one state object. */
(function(){
  'use strict';
  var R = window.RADAR;
  var root = document.getElementById('board');
  if (!R) { root.textContent = 'No snapshot data found. Run main.ts first.'; return; }
  root.setAttribute('aria-busy','false');

  var money = function(n){
    n = Number(n)||0;
    if (Math.abs(n)>=1e12) return '$'+(n/1e12).toFixed(2)+'T';
    if (Math.abs(n)>=1e9) return '$'+(n/1e9).toFixed(2)+'B';
    if (Math.abs(n)>=1e6) return '$'+(n/1e6).toFixed(1)+'M';
    if (Math.abs(n)>=1e3) return '$'+Math.round(n/1e3)+'k';
    return '$'+Math.round(n);
  };
  var esc = function(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  var pct = function(n){ return n==null?'n/a':(n>0?'+':'')+Number(n).toFixed(1)+'%'; };
  var age = function(n){ return n==null?'unknown':(n>=365?(n/365).toFixed(1)+'y':n+'d'); };
  var num = function(n){ return Number(n).toLocaleString('en-US'); };

  var state = {view:'board',slug:null,sort:'implied_value_usd',dir:-1,status:'ALL',category:'ALL',chain:'ALL',min:0,q:'',preset:false};
  var categories = [], chains = [];
  R.rows.forEach(function(r){ if(r.category && categories.indexOf(r.category)<0) categories.push(r.category); r.chains.forEach(function(c){ if(chains.indexOf(c)<0) chains.push(c); }); });
  categories.sort(); chains.sort();

  function applyHash(){
    var h = location.hash || '';
    if (h.indexOf('#/detail/')===0) { state.view='detail'; state.slug=decodeURIComponent(h.slice(9)); }
    else if (h==='#/filtered') {
      state.view='board'; state.slug=null; state.preset=true;
      state.status='UPCOMING'; state.category='Risk Curators'; state.chain='ALL'; state.min=0; state.q='';
    } else { state.view='board'; state.slug=null; state.preset=false; }
  }

  function matches(r){
    if (state.status!=='ALL' && r.status!==state.status) return false;
    if (state.category!=='ALL' && r.category!==state.category) return false;
    if (state.chain!=='ALL' && r.chains.indexOf(state.chain)<0) return false;
    if (state.min>0 && r.implied_value_usd<state.min) return false;
    if (state.q) {
      var q=state.q.toLowerCase();
      if ((r.name+' '+r.slug+' '+(r.category||'')+' '+r.chains.join(' ')).toLowerCase().indexOf(q)<0) return false;
    }
    return true;
  }
  function sorted(){
    var k=state.sort, dir=state.dir;
    return R.rows.filter(matches).sort(function(a,b){
      var x=a[k], y=b[k], c;
      if (k==='name'||k==='status') c=String(x).localeCompare(String(y));
      else c=(Number(x)||0)-(Number(y)||0);
      if (c===0) return a.rank-b.rank;
      return c*dir;
    });
  }
  function bySlug(s){ for(var i=0;i<R.rows.length;i++) if(R.rows[i].slug===s) return R.rows[i]; return null; }

  function kpis(){
    var k=R.kpi;
    var items=[
      ['teal',k.upcoming,'UPCOMING','no token recorded'],
      ['gold',k.trading,'TRADING','capped comparables'],
      ['',k.watchlist_hit+'/'+k.watchlist,'WATCHLIST','full coverage'],
      ['',money(k.tvl),'TVL SCANNED',num(k.protocols)+' protocols'],
      ['purple',Number(k.base).toFixed(4)+'x','BASE MULTIPLE','from '+k.base_from+' trading rows']
    ];
    return '<section class="kpis">'+items.map(function(it){
      return '<div class="kpi '+it[0]+'"><div class="label">'+it[2]+'</div><div class="value">'+esc(it[1])+'</div><div class="sub">'+it[3]+'</div></div>';
    }).join('')+'</section>';
  }
  function formula(){
    var m=R.model;
    return '<section class="formula"><div><h2>Value model · derived from the snapshot</h2>'+
      '<div class="code">'+esc(R.formula)+'</div>'+
      '<div class="notes"><span>g7 = '+esc(String(m.growth_floor))+'%..+'+esc(String(m.growth_cap))+'% clamp · age = as_of − listed_at · '+m.fallback_age+'d fallback from '+m.age_from+' dated rows</span>'+
      '<span>Trading rows are shown at mcap / 10,000, capped at '+money(m.cap)+'; they never compete with the hunt.</span></div></div>'+
      '<div><h2>Assumptions, in plain words</h2><ul class="assume">'+R.assumptions.map(function(a){return '<li>'+esc(a)+'</li>';}).join('')+'</ul></div></section>';
  }
  function mast(){
    return '<header class="mast"><div class="brand"><div class="mark">◈</div><div><h1>TOKEN RADAR</h1><p>Pre-token protocol intelligence · v7 · '+esc(R.model_version)+'</p></div></div>'+
      '<div class="mastRight"><span class="pill">SNAPSHOT <b>'+esc(R.as_of)+'</b></span>'+
      '<span class="pill">ROWS <b>'+num(R.kpi.rows)+'</b></span>'+
      '<span class="pill gold">WATCHLIST <b>'+R.kpi.watchlist_hit+'/'+R.kpi.watchlist+'</b></span></div></header>';
  }

  function rail(){
    var opts=function(list,sel,all){ return '<option value="ALL"'+ (sel==='ALL'?' selected':'') +'>'+all+'</option>'+list.map(function(v){return '<option value="'+esc(v)+'"'+(sel===v?' selected':'')+'>'+esc(v)+'</option>';}).join(''); };
    return '<aside class="rail"><h2>Filters</h2><p class="hint">Every control changes the same ranked board.</p>'+
      '<label class="field"><span>Search</span><input id="q" type="search" placeholder="name, chain, category" value="'+esc(state.q)+'"></label>'+
      '<label class="field"><span>Status</span><select id="status">'+opts(['UPCOMING','TRADING'],state.status,'All statuses')+'</select></label>'+
      '<label class="field"><span>Category</span><select id="category">'+opts(categories,state.category,'All categories')+'</select></label>'+
      '<label class="field"><span>Chain</span><select id="chain">'+opts(chains,state.chain,'All chains')+'</select></label>'+
      '<label class="field"><span>Implied value ≥</span><select id="min">'+[[0,'Any'],[1e6,'$1M'],[1e7,'$10M'],[1e8,'$100M']].map(function(p){return '<option value="'+p[0]+'"'+(state.min===p[0]?' selected':'')+'>'+p[1]+'</option>';}).join('')+'</select></label>'+
      '<button class="btn" data-action="reset">Reset filters</button>'+
      '<div class="railFoot">Click any header to <b>sort</b>. Click a row for its <b>detail view</b> and six-step plan.<br><br>Always-on: '+R.kpi.upcoming+' ranked pre-token rows, '+R.kpi.trading+' capped market comparables.</div></aside>';
  }

  var heads=[['rank','#'],['name','Protocol'],['status','Status'],['tvl_usd','TVL'],['change_7d','7d'],['age_days','Tokenless'],['implied_value_usd','Implied'],['chips','Why'],['plan','Plan']];
  function thead(){
    return '<thead><tr>'+heads.map(function(h){
      var key=h[0], active=state.sort===key;
      var cls=(key==='tvl_usd'||key==='change_7d'||key==='age_days'||key==='implied_value_usd')?' num':'';
      return '<th class="'+cls+'" data-sort="'+key+'">'+h[1]+(active?(state.dir<0?' ▼':' ▲'):'')+'</th>';
    }).join('')+'</tr></thead>';
  }
  function tbody(rows){
    if(rows.length===0) return '<tbody><tr><td colspan="9">No rows match these filters.</td></tr></tbody>';
    return '<tbody>'+rows.map(function(r){
      var cls=r.status==='TRADING'?' trading':'';
      var g=r.change_7d;
      var gcls=g==null?'flat':(g>0?'pos':(g<0?'neg':'flat'));
      var chips=r.chips.map(function(c,i){ return '<span class="chip'+(i===0&&r.watchlist?' gold':(i===1&&/GROWTH/.test(c)?' hot':''))+'">'+esc(c)+'</span>'; }).join('');
      return '<tr class="'+cls+'" data-row="'+esc(r.slug)+'">'+
        '<td class="rank">'+r.rank+'</td>'+
        '<td><div class="pname">'+esc(r.name)+'</div><div class="pcat">'+esc(r.category||'uncategorised')+' · '+esc(r.chains.slice(0,2).join(', ')||'chain n/a')+'</div></td>'+
        '<td><span class="status '+(r.status==='UPCOMING'?'up':'tr')+'">'+r.status+'</span></td>'+
        '<td class="num">'+money(r.tvl_usd)+'</td>'+
        '<td class="num growth '+gcls+'">'+pct(g)+'</td>'+
        '<td class="num">'+age(r.age_days)+'</td>'+
        '<td class="num value">'+money(r.implied_value_usd)+'</td>'+
        '<td><div class="chips">'+chips+'</div></td>'+
        '<td class="planlink">PLAN →</td></tr>';
    }).join('')+'</tbody>';
  }
  function board(){
    var rows=sorted();
    var note=state.preset?'<div class="noteStrip">Filtered view · <b>&nbsp;UPCOMING + Risk Curators</b>&nbsp; · change any control in the rail to explore the full board.</div>':'';
    return '<div class="layout">'+rail()+'<section class="panel"><div class="panelhead"><div class="title">The ranked hunt — '+esc(state.status==='ALL'?'all statuses':state.status)+'</div>'+
      '<div class="count" id="count">'+rows.length+' of '+R.kpi.rows+' rows · sorted by '+esc(state.sort)+'</div></div>'+note+
      '<div class="tableWrap" id="tableWrap">'+thead()+tbody(rows)+'</div>'+
      '<div class="panelfoot"><span>Ranked by implied value. TRADING rows are capped comparables, not candidates.</span><span>'+esc(R.as_of)+' snapshot · '+esc(R.model_version)+'</span></div></section></div>';
  }

  function detail(r){
    if(!r) return '<p>Unknown protocol.</p>';
    var m=R.model;
    var bars=[
      ['TVL × base',(r.tvl_usd*m.base_multiple),r.implied_value_usd,Number(m.base_multiple).toFixed(4)+'×'],
      ['Growth',r.growth_multiplier,1.8,r.growth_multiplier.toFixed(2)+'×'],
      ['Maturity',r.maturity_multiplier,1.25,r.maturity_multiplier.toFixed(2)+'×']
    ];
    var barHtml=bars.map(function(b){
      var w=Math.max(1,Math.min(10,Math.round(b[1]/b[2]*10)));
      return '<div class="bar"><span>'+b[0]+'</span><span class="track"><span class="fill w'+w+'"></span></span><b>'+b[3]+'</b></div>';
    }).join('');
    var why=r.status==='UPCOMING'
      ? 'This row earns its rank from <b>'+money(r.tvl_usd)+'</b> of TVL, <b>'+pct(r.change_7d)+'</b> seven-day growth and <b>'+age(r.age_days)+'</b> with no token recorded. The same three inputs score all '+R.kpi.upcoming+' upcoming rows.'
      : 'This token already trades. Its <b>'+money(r.mcap_usd)+'</b> market cap is divided by 10,000 and capped at '+money(m.cap)+' purely as a market reference; it is excluded from the upcoming ranking.';
    return '<button class="back" data-view="board">← Back to ranked board</button><div class="dgrid">'+
      '<section class="panel hero"><div class="eyebrow">RANK '+r.rank+' · '+r.status+(r.watchlist?' · WATCHLIST':'')+'</div>'+
      '<h2>'+esc(r.name)+'</h2><div class="sub">'+esc(r.category||'uncategorised')+' · '+esc(r.chains.join(', ')||'chain n/a')+' · '+esc(r.slug)+'</div>'+
      '<div class="big">'+(r.status==='UPCOMING'?money(r.implied_value_usd):money(r.mcap_usd))+'<small>'+(r.status==='UPCOMING'?'implied value · model estimate':'market cap · observed')+'</small></div>'+
      '<div class="mgrid"><div class="metric"><span>TVL</span><b>'+money(r.tvl_usd)+'</b></div><div class="metric"><span>7d change</span><b class="growth '+(r.change_7d>0?'pos':'neg')+'">'+pct(r.change_7d)+'</b></div>'+
      '<div class="metric"><span>Tokenless age</span><b>'+age(r.age_days)+'</b></div><div class="metric"><span>Watchlist</span><b>'+(r.watchlist?'YES':'no')+'</b></div></div>'+
      '<div class="break"><h3>Why this number</h3>'+barHtml+'<p class="why">'+why+'</p></div></section>'+
      '<section class="panel plan"><div class="planTop"><h2>Six-step farm plan</h2><span class="budget">'+esc(r.farm_total)+'</span></div>'+
      '<div class="sub" style="color:var(--muted);font-size:11px;margin-bottom:8px">Horizon: '+esc(r.farm_horizon)+' · sized from this protocol\'s own TVL and chain.</div>'+
      '<table><thead><tr><th></th><th>Action</th><th>Cost</th><th>Time</th></tr></thead><tbody>'+
      r.farm_steps.map(function(s,i){
        var mm=s.match(/^(.*?) Cost: (.*?)\. Time: (.*?)\.$/);
        var text=mm?mm[1]:s, cost=mm?mm[2]:'', time=mm?mm[3]:'';
        return '<tr><td class="stepno">0'+(i+1)+'</td><td>'+esc(text)+'</td><td>'+esc(cost)+'</td><td>'+esc(time)+'</td></tr>';
      }).join('')+'</tbody></table>'+
      '<p class="disclaim">No token is promised by a snapshot, a score or this plan. Keep funds in a dedicated wallet, verify every link on the protocol\'s own site, and never pay anyone to claim.</p></section></div>';
  }

  function render(){
    root.innerHTML = mast()+kpis()+formula()+(state.view==='detail'?detail(bySlug(state.slug)):board());
  }

  root.addEventListener('click',function(e){
    var t=e.target;
    var th=t.closest('[data-sort]');
    if(th){ var k=th.getAttribute('data-sort'); if(state.sort===k) state.dir=-state.dir; else {state.sort=k;state.dir=(k==='name'||k==='status')?1:-1;} render(); return; }
    var btn=t.closest('[data-view]');
    if(btn){ location.hash='#/board'; return; }
    var act=t.closest('[data-action]');
    if(act){ state.status='ALL';state.category='ALL';state.chain='ALL';state.min=0;state.q='';state.preset=false;location.hash='#/board';render();return; }
    var row=t.closest('[data-row]');
    if(row){ location.hash='#/detail/'+encodeURIComponent(row.getAttribute('data-row')); }
  });
  root.addEventListener('change',function(e){
    var id=e.target.id;
    if(id==='q') return;
    if(id==='status'||id==='category'||id==='chain') state[id]=e.target.value;
    if(id==='min') state.min=Number(e.target.value);
    state.preset=false;
    var rows=sorted();
    var c=document.getElementById('count'); if(c) c.textContent=rows.length+' of '+R.kpi.rows+' rows · sorted by '+state.sort;
    var w=document.getElementById('tableWrap'); if(w) w.innerHTML=thead()+tbody(rows);
  });
  root.addEventListener('input',function(e){
    if(e.target.id!=='q') return;
    state.q=e.target.value; state.preset=false;
    var rows=sorted();
    var c=document.getElementById('count'); if(c) c.textContent=rows.length+' of '+R.kpi.rows+' rows · sorted by '+state.sort;
    var w=document.getElementById('tableWrap'); if(w) w.innerHTML=thead()+tbody(rows);
  });
  window.addEventListener('hashchange',function(){ applyHash(); render(); });
  applyHash(); render();
})();
