// ── OVERLAY CONTROLS ──────────────────────────────────────────────────────────

function openOverlay(name) {
  document.getElementById('overlay-' + name).classList.add('active');
  document.body.style.overflow = 'hidden';
  var el = document.getElementById('overlay-' + name);
  el.scrollTop = 0;
}

function closeOverlay(e) {
  if (e) e.stopPropagation();
  document.querySelectorAll('.overlay').forEach(function(o) {
    o.classList.remove('active');
  });
  document.body.style.overflow = '';
}

function switchOverlay(from, to) {
  document.getElementById('overlay-' + from).classList.remove('active');
  var el = document.getElementById('overlay-' + to);
  el.classList.add('active');
  el.scrollTop = 0;
}

// ESC key closes overlay
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeOverlay();
});


// ── WEMBANYAMA / MAXEY SHOT CHART ─────────────────────────────────────────────

var WEMBY_GAMES = [
  { label: 'Nov 10',        file: 'Wemby11_10_25.json'    },
  { label: 'Jan 17',        file: 'Wemby1_17_26.json'     },
  { label: 'Feb 10',        file: 'Wemby2_10_26.json'     },
  { label: 'Mar 5',         file: 'Wemby3_05_26.json'     },
  { label: 'Mar 10',        file: 'Wemby3_10_26.json'     },
  { label: 'Mar 30',        file: 'Wemby3_30_26.json'     },
  { label: 'Apr 1',         file: 'Wemby4_1_26.json'      },
  { label: 'Apr 10',        file: 'Wemby4_10_26.json'     },
  { label: 'Pre All-Star',  file: 'WembyPreAllstar.json',  group: true },
  { label: 'Post All-Star', file: 'WembyPostAllstar.json', group: true },
  { label: 'Full Season',   file: 'WembyFull26.json',      group: true },
];

var MAXEY_GAMES = [
  { label: 'Nov 20',        file: 'Maxey11_20_25.json'    },
  { label: 'Jan 3',         file: 'Maxey1_3_26.json'      },
  { label: 'Jan 12',        file: 'Maxey1_12_26.json'     },
  { label: 'Jan 31',        file: 'Maxey_1_31_26.json'    },
  { label: 'Feb 2',         file: 'Maxey2_2_26.json'      },
  { label: 'Feb 22',        file: 'Maxey2_22_26.json'     },
  { label: 'Pre All-Star',  file: 'Maxey_PreAllstar.json', group: true },
  { label: 'Post All-Star', file: 'Maxey_PostAllstar.json',group: true },
  { label: 'Full Season',   file: 'Maxey_FullSeason.json', group: true },
];

// NBA API coordinate → SVG pixel
// LOC_X: –250..250  →  SVG x: 0..500
// LOC_Y: –52..420   →  SVG y: 0..472
var SX = function(x) { return x + 250; };
var SY = function(y) { return y + 52; };

var wembyCurrentIdx    = 0;
var wembyTimers        = [];
var wembyMade          = 0;
var wembyMiss          = 0;
var wemby3Att          = 0;
var wemby3Made         = 0;
var wembyInited        = false;
var wembyCurrentPlayer = 'wemby';   // 'wemby' | 'maxey'
var wembyViewMode      = 'shots';   // 'shots' | 'zones'
var wembyCurrentZones  = null;
var wembyShots         = [];        // [{dot, shot, baseR, made, is3, zone}]
var wembyFilter        = { result: null, type: null, zone: null };

// ── DATA NORMALISER ────────────────────────────────────────────────────────────
// Wemby files are a flat array; Maxey files are {zone_summaries, raw_shot_logs}
function wembyParseData(data) {
  if (Array.isArray(data)) {
    return { shots: data, zones: wembyComputeZones(data) };
  }
  var shots = data.raw_shot_logs || [];
  var zones = data.zone_summaries || wembyComputeZones(shots);
  return { shots: shots, zones: zones };
}

function wembyComputeZones(shots) {
  var z = {};
  shots.forEach(function(s) {
    var k = s.SHOT_ZONE_BASIC;
    if (!k) return;
    if (!z[k]) z[k] = { made: 0, total: 0 };
    z[k].total++;
    if (s.SHOT_MADE_FLAG === 1) z[k].made++;
  });
  return Object.keys(z).map(function(k) {
    return { SHOT_ZONE_BASIC: k, total_shots: z[k].total, made_shots: z[k].made,
             shooting_percentage: z[k].made / z[k].total * 100 };
  });
}

function wembyBuildSelector() {
  var c = document.getElementById('wemby-games');
  if (!c) return;
  c.innerHTML = '';
  var games = wembyCurrentPlayer === 'maxey' ? MAXEY_GAMES : WEMBY_GAMES;
  games.forEach(function(g, i) {
    var btn = document.createElement('button');
    btn.className = 'wemby-game-btn' + (i === 0 ? ' active' : '') + (g.group ? ' wemby-group-btn' : '');
    btn.textContent = g.label;
    btn.id = 'wgb-' + i;
    btn.onclick = function() { wembyLoadGame(i); };
    c.appendChild(btn);
  });
}

function wembyDrawCourt() {
  var svg = document.getElementById('wemby-court');
  if (!svg) return;
  var ns = 'http://www.w3.org/2000/svg';
  svg.innerHTML = '';
  var S  = '#232318';
  var SW = '1.5';

  function mk(tag, attrs) {
    var e = document.createElementNS(ns, tag);
    Object.keys(attrs).forEach(function(k) { e.setAttribute(k, attrs[k]); });
    svg.appendChild(e);
    return e;
  }

  // Background
  mk('rect', { x:0, y:0, width:500, height:472, fill:'#0c0800' });

  // Paint fill
  mk('rect', { x:SX(-80), y:SY(-52), width:160, height:SY(142.5)-SY(-52), fill:'#111108' });

  // Court boundary
  mk('rect', { x:SX(-250), y:SY(-52), width:500, height:SY(420)-SY(-52), fill:'none', stroke:S, 'stroke-width':SW });

  // Paint outline
  mk('rect', { x:SX(-80), y:SY(-52), width:160, height:SY(142.5)-SY(-52), fill:'none', stroke:S, 'stroke-width':SW });

  // Free throw circle — top arc (above FT line)
  mk('path', { d:'M '+SX(-60)+' '+SY(142.5)+' A 60 60 0 0 1 '+SX(60)+' '+SY(142.5), fill:'none', stroke:S, 'stroke-width':SW });
  // Free throw circle — bottom arc (dashed)
  mk('path', { d:'M '+SX(-60)+' '+SY(142.5)+' A 60 60 0 0 0 '+SX(60)+' '+SY(142.5), fill:'none', stroke:S, 'stroke-width':SW, 'stroke-dasharray':'5,4', opacity:'0.5' });

  // Restricted area arc
  mk('path', { d:'M '+SX(-40)+' '+SY(0)+' A 40 40 0 0 1 '+SX(40)+' '+SY(0), fill:'none', stroke:S, 'stroke-width':SW });

  // Backboard
  mk('line', { x1:SX(-30), y1:SY(-7.5), x2:SX(30), y2:SY(-7.5), stroke:S, 'stroke-width':'2' });

  // Rim
  mk('circle', { cx:SX(0), cy:SY(0), r:'7.5', fill:'none', stroke:S, 'stroke-width':'1.5' });

  // 3PT corner lines
  mk('line', { x1:SX(-220), y1:SY(-52), x2:SX(-220), y2:SY(89.5), stroke:S, 'stroke-width':SW });
  mk('line', { x1:SX( 220), y1:SY(-52), x2:SX( 220), y2:SY(89.5), stroke:S, 'stroke-width':SW });

  // 3PT arc
  mk('path', { d:'M '+SX(-220)+' '+SY(89.5)+' A 237.5 237.5 0 0 1 '+SX(220)+' '+SY(89.5), fill:'none', stroke:S, 'stroke-width':SW });

  // Half-court line + center circle
  mk('line',   { x1:SX(-250), y1:SY(420), x2:SX(250), y2:SY(420), stroke:S, 'stroke-width':SW });
  mk('circle', { cx:SX(0), cy:SY(420), r:'60', fill:'none', stroke:S, 'stroke-width':SW });

  // Zone overlay group (populated by wembyDrawZoneLayer, drawn before dots)
  var zg = document.createElementNS(ns, 'g');
  zg.setAttribute('id', 'wemby-zone-layer');
  zg.style.opacity = '0';
  zg.style.transition = 'opacity .38s ease';
  svg.appendChild(zg);

  // Shots group (populated during animation)
  var g = document.createElementNS(ns, 'g');
  g.setAttribute('id', 'wemby-dots');
  svg.appendChild(g);
}

function wembySetStat(id, val) {
  var e = document.getElementById(id);
  if (e) e.textContent = val;
}

function wembyUpdateStats(total, made, att3, made3) {
  var fgPct = total > 0 ? Math.round(made / total * 100) : 0;
  var tpPct = att3  > 0 ? Math.round(made3 / att3  * 100) : 0;
  var pts   = (made - made3) * 2 + made3 * 3;
  wembySetStat('ws-fga', total);
  wembySetStat('ws-fgm', made);
  wembySetStat('ws-fgp', total > 0 ? fgPct + '%' : '—');
  wembySetStat('ws-3pa', att3);
  wembySetStat('ws-3pm', made3);
  wembySetStat('ws-3pp', att3 > 0 ? tpPct + '%' : '—');
  wembySetStat('ws-pts', total > 0 ? pts : '—');
}

function wembyLoadGame(idx) {
  wembyTimers.forEach(function(t) { clearTimeout(t); });
  wembyTimers = [];
  wembyMade = 0; wembyMiss = 0; wemby3Att = 0; wemby3Made = 0;

  wembyCurrentIdx = idx;
  document.querySelectorAll('.wemby-game-btn').forEach(function(b, i) {
    b.classList.toggle('active', i === idx);
  });

  wembyDrawCourt();
  wembyUpdateStats(0, 0, 0, 0);

  var games = wembyCurrentPlayer === 'maxey' ? MAXEY_GAMES : WEMBY_GAMES;
  var game  = games[idx];
  var ns    = 'http://www.w3.org/2000/svg';
  var team  = wembyCurrentPlayer === 'maxey' ? 'PHI' : 'SAS';

  fetch(game.file)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var parsed = wembyParseData(data);
      var shots  = parsed.shots;
      wembyCurrentZones = parsed.zones;

      // Draw zone layer (hidden until ZONES mode activated)
      wembyDrawZoneLayer(wembyCurrentZones);
      if (wembyViewMode === 'zones') {
        var zl = document.getElementById('wemby-zone-layer');
        if (zl) zl.style.opacity = '1';
        var dg = document.getElementById('wemby-dots');
        if (dg) dg.style.opacity = '0.18';
      }

      // Update caption
      if (shots.length > 0) {
        var s0   = shots[0];
        var opp  = (s0.VTM === team) ? s0.HTM : s0.VTM;
        var home = (s0.VTM === team) ? '@ ' : 'vs ';
        var pName = s0.PLAYER_NAME || (wembyCurrentPlayer === 'maxey' ? 'Tyrese Maxey' : 'Victor Wembanyama');
        var cap  = document.getElementById('wemby-caption');
        if (cap) cap.textContent = 'Fig 01 — ' + pName + ' · ' + game.label + ' · ' + home + opp + ' · ' + shots.length + ' FGA. Toggle SHOTS / ZONES to switch views.';
      }

      var dotsGroup = document.getElementById('wemby-dots');
      var isAgg     = !!game.group;
      var baseMs    = isAgg ? 5 : 20;

      // Reset shot registry and filters for new game load
      wembyShots = [];
      wembyResetFilters();

      // Pre-compute density for all shots at once
      var densities   = wembyComputeDensity(shots);
      var maxDensity  = Math.max.apply(null, densities) || 1;

      // Show filter pills now that shots are loading
      var filtersEl = document.getElementById('wemby-filters');
      if (filtersEl) filtersEl.classList.add('visible');

      shots.forEach(function(shot, i) {
        var t = setTimeout(function() {
          var is3   = shot.SHOT_TYPE === '3PT Field Goal';
          var made  = shot.SHOT_MADE_FLAG === 1;
          var cx    = SX(shot.LOC_X);
          var cy    = SY(shot.LOC_Y);
          var zone  = shot.SHOT_ZONE_BASIC || '';

          // Density-adjusted radius: denser areas → slightly smaller dots (0.75..1.15× base)
          var densNorm = densities[i] / maxDensity;  // 0..1
          var rBase    = is3 ? 5.5 : 4.8;
          var rScale   = 1.15 - densNorm * 0.4;      // 0.75..1.15
          var r        = (rBase * rScale).toFixed(2);

          // Density-adjusted opacity: denser → slightly lower opacity so clusters breathe
          var baseOpacity = made
            ? (0.82 - densNorm * 0.28).toFixed(3)   // 0.54..0.82
            : (0.38 - densNorm * 0.16).toFixed(3);  // 0.22..0.38

          var dot = document.createElementNS(ns, 'circle');
          dot.setAttribute('cx', cx);
          dot.setAttribute('cy', cy);
          dot.setAttribute('r', r);

          if (made) {
            dot.setAttribute('fill', '#F58426');
            dot.setAttribute('fill-opacity', baseOpacity);
            dot.setAttribute('stroke', 'none');
          } else {
            dot.setAttribute('fill', 'none');
            dot.setAttribute('stroke', '#F58426');
            dot.setAttribute('stroke-width', '1.5');
            dot.setAttribute('stroke-opacity', baseOpacity);
          }

          dot.style.transformOrigin = cx + 'px ' + cy + 'px';
          dot.style.transform = 'scale(0)';
          dot.style.transition = 'transform 0.22s cubic-bezier(0.34,1.56,0.64,1)';
          dotsGroup.appendChild(dot);
          requestAnimationFrame(function() {
            requestAnimationFrame(function() { dot.style.transform = 'scale(1)'; });
          });

          // Store in registry for filter/highlight use
          wembyShots.push({ dot: dot, shot: shot, baseR: parseFloat(r), baseOpacity: parseFloat(baseOpacity), made: made, is3: is3, zone: zone });

          // ── Enhanced tooltip ──────────────────────────────────────────────
          dot.addEventListener('mouseenter', function(e) {
            var tt = document.getElementById('wemby-tooltip');
            if (!tt) return;
            var courtRect = document.getElementById('wemby-court').getBoundingClientRect();

            var resultStr  = made ? '● Made' : '○ Missed';
            var typeStr    = is3 ? '3PT Field Goal' : '2PT Field Goal';
            var actionStr  = shot.ACTION_TYPE  || '—';
            var zoneBasic  = shot.SHOT_ZONE_BASIC || '—';
            var zoneArea   = shot.SHOT_ZONE_AREA  || '';
            var zoneRange  = shot.SHOT_ZONE_RANGE || (shot.SHOT_DISTANCE != null ? shot.SHOT_DISTANCE + ' ft' : '');

            tt.innerHTML =
              '<span style="color:' + (made ? '#F58426' : 'rgba(245,132,38,.45)') + '">' + resultStr + '</span>' +
              '&nbsp;·&nbsp;' + typeStr +
              '<br><span style="opacity:.55">' + actionStr + '</span>' +
              '<br>' + zoneBasic +
              (zoneArea  ? '<br><span style="opacity:.45;font-size:.72em">' + zoneArea  + '</span>' : '') +
              (zoneRange ? '<br><span style="opacity:.45;font-size:.72em">' + zoneRange + '</span>' : '');
            tt.style.opacity = '1';
            tt.style.left = (e.clientX - courtRect.left + 14) + 'px';
            tt.style.top  = (e.clientY - courtRect.top  - 10) + 'px';

            // Zone highlight: light up same-zone shots, dim others
            wembyZoneHoverHighlight(zone);
          });

          dot.addEventListener('mousemove', function(e) {
            var tt = document.getElementById('wemby-tooltip');
            if (!tt || tt.style.opacity === '0') return;
            var courtRect = document.getElementById('wemby-court').getBoundingClientRect();
            tt.style.left = (e.clientX - courtRect.left + 14) + 'px';
            tt.style.top  = (e.clientY - courtRect.top  - 10) + 'px';
          });

          dot.addEventListener('mouseleave', function() {
            var tt = document.getElementById('wemby-tooltip');
            if (tt) tt.style.opacity = '0';
            // Restore filter-based visibility
            wembyZoneHoverHighlight(null);
          });

          if (made) wembyMade++; else wembyMiss++;
          if (is3) { wemby3Att++; if (made) wemby3Made++; }
          wembyUpdateStats(wembyMade + wembyMiss, wembyMade, wemby3Att, wemby3Made);

          // After last shot, refresh summary if any filters are active
          if (i === shots.length - 1) {
            wembyUpdateSummary();
          }

        }, i * baseMs + Math.random() * (baseMs * 0.25));
        wembyTimers.push(t);
      });
    })
    .catch(function(err) {
      console.warn('Shot chart: could not load', game.file, err);
      var cap = document.getElementById('wemby-caption');
      if (cap) cap.textContent = 'Fig 01 — Shot data loads when served over HTTP (GitHub Pages). Open locally via Live Server or deploy to view animation.';
    });
}

function wembyReplay() {
  wembyLoadGame(wembyCurrentIdx);
}

// ── ZONE LAYER ─────────────────────────────────────────────────────────────────

// Pre-defined SVG path data for each NBA zone (using SX/SY coordinate space)
// SX(x)=x+250, SY(y)=y+52. Key values:
//   SX(-250)=0, SX(-220)=30, SX(-80)=170, SX(-40)=210, SX(40)=290, SX(80)=330, SX(220)=470, SX(250)=500
//   SY(-52)=0, SY(0)=52, SY(89.5)=141.5, SY(142.5)=194.5

var ZONE_DEFS = {
  'Restricted Area': {
    d: 'M 210 52 A 40 40 0 0 1 290 52 L 290 0 L 210 0 Z',
    fillRule: 'nonzero', lx: 250, ly: 76, fs: 13
  },
  'In The Paint (Non-RA)': {
    // Paint rect minus RA arc (evenodd subtracts the inner path)
    d: 'M 170 0 L 330 0 L 330 194.5 L 170 194.5 Z ' +
       'M 210 52 A 40 40 0 0 1 290 52 L 290 0 L 210 0 Z',
    fillRule: 'evenodd', lx: 250, ly: 152, fs: 12
  },
  'Mid-Range': {
    // Full inside-3PT region minus paint (evenodd subtracts)
    d: 'M 30 0 L 30 141.5 A 237.5 237.5 0 0 1 470 141.5 L 470 0 Z ' +
       'M 170 0 L 330 0 L 330 194.5 L 170 194.5 Z',
    fillRule: 'evenodd', lx: 250, ly: 240, fs: 12
  },
  'Left Corner 3': {
    d: 'M 0 0 L 30 0 L 30 141.5 L 0 141.5 Z',
    fillRule: 'nonzero', lx: 15, ly: 68, fs: 9
  },
  'Right Corner 3': {
    d: 'M 470 0 L 500 0 L 500 141.5 L 470 141.5 Z',
    fillRule: 'nonzero', lx: 485, ly: 68, fs: 9
  },
  'Above the Break 3': {
    // Full half-court minus inside-3PT (evenodd)
    d: 'M 0 0 L 500 0 L 500 472 L 0 472 Z ' +
       'M 30 0 L 30 141.5 A 237.5 237.5 0 0 1 470 141.5 L 470 0 Z',
    fillRule: 'evenodd', lx: 250, ly: 360, fs: 13
  }
};

// Drawing order: largest → smallest so small zones render on top
var ZONE_DRAW_ORDER = [
  'Above the Break 3', 'Mid-Range', 'Left Corner 3', 'Right Corner 3',
  'In The Paint (Non-RA)', 'Restricted Area'
];

function wembyZoneColor(pct) {
  if (pct >= 60) return { fill: 'rgba(245,132,38,0.36)', stroke: 'rgba(245,132,38,0.6)',  text: '#F58426' };
  if (pct >= 48) return { fill: 'rgba(245,190,80,0.28)', stroke: 'rgba(245,190,80,0.5)',  text: '#F5C060' };
  if (pct >= 36) return { fill: 'rgba(150,150,120,0.2)', stroke: 'rgba(150,150,120,0.38)',text: 'rgba(255,255,255,0.48)' };
  if (pct >= 24) return { fill: 'rgba(60,120,220,0.24)', stroke: 'rgba(60,120,220,0.44)', text: '#88AADD' };
  return           { fill: 'rgba(30,70,200,0.30)',  stroke: 'rgba(30,70,200,0.5)',   text: '#7799CC' };
}

function wembyDrawZoneLayer(zones) {
  var svg = document.getElementById('wemby-court');
  if (!svg) return;
  var zg = document.getElementById('wemby-zone-layer');
  if (!zg) return;
  zg.innerHTML = ''; // clear previous
  if (!zones || !zones.length) return;

  var ns = 'http://www.w3.org/2000/svg';

  // Build lookup by zone name
  var zoneMap = {};
  zones.forEach(function(z) { zoneMap[z.SHOT_ZONE_BASIC] = z; });

  ZONE_DRAW_ORDER.forEach(function(zoneName) {
    var def = ZONE_DEFS[zoneName];
    var zd  = zoneMap[zoneName];
    if (!def || !zd) return;

    var pct    = zd.shooting_percentage;
    var colors = wembyZoneColor(pct);

    // Zone fill shape
    var path = document.createElementNS(ns, 'path');
    path.setAttribute('d', def.d);
    path.setAttribute('fill', colors.fill);
    path.setAttribute('fill-rule', def.fillRule);
    path.setAttribute('stroke', colors.stroke);
    path.setAttribute('stroke-width', '1');
    zg.appendChild(path);

    // FG% label
    var t1 = document.createElementNS(ns, 'text');
    t1.setAttribute('x', def.lx); t1.setAttribute('y', def.ly);
    t1.setAttribute('text-anchor', 'middle');
    t1.setAttribute('font-family', 'Oswald, sans-serif');
    t1.setAttribute('font-weight', '700');
    t1.setAttribute('font-size', def.fs);
    t1.setAttribute('fill', colors.text);
    t1.textContent = Math.round(pct) + '%';
    zg.appendChild(t1);

    // Made/attempted count (skip for corner 3 — too narrow)
    if (zoneName !== 'Left Corner 3' && zoneName !== 'Right Corner 3') {
      var t2 = document.createElementNS(ns, 'text');
      t2.setAttribute('x', def.lx); t2.setAttribute('y', def.ly + 13);
      t2.setAttribute('text-anchor', 'middle');
      t2.setAttribute('font-family', 'Roboto Mono, monospace');
      t2.setAttribute('font-size', '8');
      t2.setAttribute('fill', 'rgba(255,255,255,0.35)');
      t2.textContent = zd.made_shots + '/' + zd.total_shots;
      zg.appendChild(t2);
    }
  });
}

function wembySetView(mode) {
  wembyViewMode = mode;
  document.querySelectorAll('.wemby-view-btn').forEach(function(b) { b.classList.remove('active'); });
  var btn = document.getElementById('wvb-' + mode);
  if (btn) btn.classList.add('active');

  var zl = document.getElementById('wemby-zone-layer');
  var dg = document.getElementById('wemby-dots');
  var sl = document.getElementById('wemby-shots-legend');
  var zl2 = document.getElementById('wemby-zones-legend');

  if (mode === 'zones') {
    if (zl) zl.style.opacity = '1';
    if (dg) { dg.style.opacity = '0.18'; dg.style.transition = 'opacity .35s'; }
    if (sl)  sl.style.display = 'none';
    if (zl2) zl2.style.display = 'flex';
  } else {
    if (zl) zl.style.opacity = '0';
    if (dg) { dg.style.opacity = '1'; dg.style.transition = 'opacity .35s'; }
    if (sl)  sl.style.display = 'flex';
    if (zl2) zl2.style.display = 'none';
  }
}

// ── SHOT CHART — FILTER / DENSITY / HIGHLIGHTING ──────────────────────────

function wembyMatchesFilter(entry) {
  var f = wembyFilter;
  if (f.result) {
    if (f.result === 'made'   && !entry.made)  return false;
    if (f.result === 'missed' &&  entry.made)  return false;
  }
  if (f.type) {
    if (f.type === '3pt' && !entry.is3) return false;
    if (f.type === '2pt' &&  entry.is3) return false;
  }
  if (f.zone) {
    var z = entry.zone || '';
    if (f.zone === 'corner3') {
      if (z !== 'Left Corner 3' && z !== 'Right Corner 3') return false;
    } else {
      if (z !== f.zone) return false;
    }
  }
  return true;
}

function wembyApplyFilters() {
  var anyActive = wembyFilter.result || wembyFilter.type || wembyFilter.zone;
  wembyShots.forEach(function(entry) {
    var show = !anyActive || wembyMatchesFilter(entry);
    entry.dot.style.opacity    = show ? String(entry.baseOpacity) : '0.06';
    entry.dot.style.transition = 'opacity .25s ease, r .2s ease';
  });
  wembyUpdateSummary();
}

function wembyUpdateSummary() {
  var zoneLbl  = document.getElementById('ws-zone-lbl');
  var statLbl  = document.getElementById('ws-stats');
  var f = wembyFilter;

  var subset = wembyShots.filter(function(e) { return wembyMatchesFilter(e); });
  var total  = subset.length;
  var made   = subset.filter(function(e) { return e.made; }).length;

  if (!total) {
    if (zoneLbl) zoneLbl.textContent = '';
    if (statLbl) statLbl.textContent = '';
    return;
  }

  var pct = Math.round(made / total * 100);

  var label = '';
  if (f.zone) {
    label = f.zone === 'corner3' ? 'Corner 3' : f.zone;
  } else if (f.type) {
    label = f.type === '3pt' ? '3-Pointers' : '2-Pointers';
  } else if (f.result) {
    label = f.result === 'made' ? 'Made Shots' : 'Missed Shots';
  } else {
    label = 'All Shots';
  }

  if (zoneLbl) zoneLbl.textContent = label;
  if (statLbl) statLbl.textContent = pct + '% FG  ·  ' + made + '/' + total;
}

function wembyToggleFilter(category, value, btn) {
  // Toggle same pill off; activate new one in category
  if (wembyFilter[category] === value) {
    wembyFilter[category] = null;
    btn.classList.remove('active');
  } else {
    // Deactivate any sibling pill in same category
    document.querySelectorAll('.wf-pill[data-filter="' + category + '"]').forEach(function(b) {
      b.classList.remove('active');
    });
    wembyFilter[category] = value;
    btn.classList.add('active');
  }
  wembyApplyFilters();
}

function wembyResetFilters() {
  wembyFilter = { result: null, type: null, zone: null };
  document.querySelectorAll('.wf-pill').forEach(function(b) { b.classList.remove('active'); });
  var zoneLbl = document.getElementById('ws-zone-lbl');
  var statLbl = document.getElementById('ws-stats');
  if (zoneLbl) zoneLbl.textContent = '';
  if (statLbl) statLbl.textContent = '';
}

function wembyComputeDensity(shots) {
  // Returns array of density counts (how many other shots within 30-unit NBA radius)
  var R2 = 30 * 30;
  return shots.map(function(s) {
    var cx = SX(s.LOC_X), cy = SY(s.LOC_Y);
    var count = 0;
    shots.forEach(function(o) {
      var dx = SX(o.LOC_X) - cx, dy = SY(o.LOC_Y) - cy;
      if (dx * dx + dy * dy <= R2) count++;
    });
    return count;
  });
}

function wembyZoneHoverHighlight(hoverZone) {
  wembyShots.forEach(function(entry) {
    if (!hoverZone) {
      // Restore filtered state
      var anyActive = wembyFilter.result || wembyFilter.type || wembyFilter.zone;
      var show = !anyActive || wembyMatchesFilter(entry);
      entry.dot.style.opacity = show ? String(entry.baseOpacity) : '0.06';
      entry.dot.style.transition = 'opacity .2s ease';
    } else {
      var sameZone = (entry.zone === hoverZone) ||
                     (hoverZone === '_corner3_' && (entry.zone === 'Left Corner 3' || entry.zone === 'Right Corner 3'));
      if (sameZone) {
        entry.dot.style.opacity    = '1';
        entry.dot.style.transition = 'opacity .15s ease';
      } else {
        entry.dot.style.opacity    = '0.11';
        entry.dot.style.transition = 'opacity .15s ease';
      }
    }
  });
}

function wembySwitchPlayer(player) {
  if (wembyCurrentPlayer === player) return;
  wembyCurrentPlayer = player;

  document.querySelectorAll('.wemby-pswitch-btn').forEach(function(b) { b.classList.remove('active'); });
  var psBtn = document.getElementById('wps-' + player);
  if (psBtn) psBtn.classList.add('active');

  var pNameEl = document.getElementById('wemby-player-name');
  var pSeasonEl = document.getElementById('wemby-player-season');
  if (pNameEl)   pNameEl.textContent   = player === 'maxey' ? 'Tyrese Maxey' : 'Victor Wembanyama';
  if (pSeasonEl) pSeasonEl.textContent = player === 'maxey' ? '2025–26 · Philadelphia 76ers' : '2025–26 · San Antonio Spurs';

  wembyResetFilters();
  wembyBuildSelector();
  wembyLoadGame(0);
}

// Initialize selector + blank court on page load
wembyBuildSelector();
wembyDrawCourt();

// ── CAREER COMPARISON TOOL ─────────────────────────────────────────────────

var ccInited = false;

var CC = {
  players:    [],
  canvas:     null,
  ctx:        null,
  activeIdx:  null,
  hoveredIdx: null,
  mode:       'normal',
  rafHandle:  null,
  dots:       [],
  minScore:   0,
  maxScore:   500,
  pad:        72,
  axisY:      120,
};

function ccScoreToX(score) {
  var w = CC.canvas ? CC.canvas.width : 800;
  return CC.pad + (score - CC.minScore) / (CC.maxScore - CC.minScore) * (w - CC.pad * 2);
}

function ccGetNeighbors(idx, count) {
  var base = CC.players[idx].career_score;
  var out  = [];
  CC.players.forEach(function(p, i) {
    if (i !== idx) out.push({ idx: i, diff: p.career_score - base, absDiff: Math.abs(p.career_score - base) });
  });
  out.sort(function(a, b) { return a.absDiff - b.absDiff; });
  return out.slice(0, count);
}

function ccSetNormal() {
  CC.players.forEach(function(p, i) {
    var tx = ccScoreToX(p.career_score);
    CC.dots[i].targetX            = tx;
    CC.dots[i].targetR            = 5;
    CC.dots[i].targetOpacity      = 1;
    CC.dots[i].targetLabelOpacity = 0;
    if (CC.mode === 'normal') { CC.dots[i].x = tx; }
  });
}

function ccSetFocus(idx) {
  var activeScore = CC.players[idx].career_score;
  var activeX     = ccScoreToX(activeScore);
  var neighbors   = ccGetNeighbors(idx, 3);
  var neighborMap = {};
  neighbors.forEach(function(n) { neighborMap[n.idx] = n; });
  var maxDiff    = neighbors.length > 0 ? neighbors[neighbors.length - 1].absDiff : 1;
  var maxOffset  = Math.min((CC.canvas.width - CC.pad * 2) * 0.22, 160);

  CC.players.forEach(function(p, i) {
    if (i === idx) {
      CC.dots[i].targetX            = activeX;
      CC.dots[i].targetR            = 13;
      CC.dots[i].targetOpacity      = 1;
      CC.dots[i].targetLabelOpacity = 1;
    } else if (neighborMap[i]) {
      var n = neighborMap[i];
      CC.dots[i].targetX            = activeX + (n.diff / maxDiff) * maxOffset;
      CC.dots[i].targetR            = 7;
      CC.dots[i].targetOpacity      = 0.72;
      CC.dots[i].targetLabelOpacity = 1;
    } else {
      CC.dots[i].targetX            = ccScoreToX(p.career_score);
      CC.dots[i].targetR            = 4;
      CC.dots[i].targetOpacity      = 0.11;
      CC.dots[i].targetLabelOpacity = 0;
    }
  });
}

function ccRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
  ctx.arcTo(x+w,y,x+w,y+r,r); ctx.lineTo(x+w,y+h-r);
  ctx.arcTo(x+w,y+h,x+w-r,y+h,r); ctx.lineTo(x+r,y+h);
  ctx.arcTo(x,y+h,x,y+h-r,r); ctx.lineTo(x,y+r);
  ctx.arcTo(x,y,x+r,y,r); ctx.closePath();
}

function ccDraw() {
  var canvas = CC.canvas;
  var ctx    = CC.ctx;
  if (!ctx || !canvas.width) return;
  var W = canvas.width, H = canvas.height, AY = CC.axisY;

  ctx.clearRect(0, 0, W, H);

  // Axis line
  ctx.strokeStyle = '#2a2a1a'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(CC.pad, AY); ctx.lineTo(W - CC.pad, AY); ctx.stroke();

  // Tick marks every 100 pts
  var tick = Math.ceil(CC.minScore / 100) * 100;
  while (tick <= CC.maxScore) {
    var tx = ccScoreToX(tick);
    ctx.strokeStyle = '#1e1e14'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(tx, AY - 4); ctx.lineTo(tx, AY + 4); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.font = '9px "Roboto Mono",monospace'; ctx.textAlign = 'center';
    ctx.fillText(tick, tx, AY + 16);
    tick += 100;
  }
  ctx.fillStyle = 'rgba(255,255,255,0.13)'; ctx.font = '9px "Roboto Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText('CAREER SCORE', W / 2, H - 6);

  var activeIdx   = CC.activeIdx;
  var neighbors   = activeIdx !== null ? ccGetNeighbors(activeIdx, 3) : [];
  var neighborMap = {};
  neighbors.forEach(function(n) { neighborMap[n.idx] = n; });

  // Pass 1 — dim background dots
  CC.dots.forEach(function(d, i) {
    if (i === activeIdx || neighborMap[i] !== undefined) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, d.opacity);
    ctx.beginPath(); ctx.arc(d.x, AY, Math.max(0.5, d.r), 0, Math.PI * 2);
    ctx.fillStyle = (i === CC.hoveredIdx) ? 'rgba(245,132,38,0.75)' : 'rgba(245,132,38,0.38)';
    ctx.fill(); ctx.restore();

    // Hover tooltip (normal mode only)
    if (i === CC.hoveredIdx && CC.mode === 'normal') {
      var p = CC.players[i];
      var ttW = 134, ttH = 38;
      var ttX = Math.max(4, Math.min(d.x - ttW/2, W - ttW - 4));
      var ttY = AY - Math.max(d.r, 6) - ttH - 8;
      ctx.save();
      ctx.fillStyle = '#1a1a0a'; ctx.strokeStyle = '#2e2e18'; ctx.lineWidth = 1;
      ccRoundRect(ctx, ttX, ttY, ttW, ttH, 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '700 12px Oswald,sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(p.name, ttX + ttW/2, ttY + 14);
      ctx.fillStyle = '#F58426'; ctx.font = '9px "Roboto Mono",monospace';
      ctx.fillText(p.career_score.toFixed(1), ttX + ttW/2, ttY + 29);
      ctx.restore();
    }
  });

  // Pass 2 — neighbors
  neighbors.forEach(function(n) {
    var i = n.idx, d = CC.dots[i];
    ctx.save(); ctx.globalAlpha = Math.max(0, d.opacity);
    ctx.beginPath(); ctx.arc(d.x, AY, Math.max(0.5, d.r), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(245,132,38,0.55)'; ctx.fill();
    if (d.labelOpacity > 0.05) {
      ctx.globalAlpha = Math.max(0, d.labelOpacity * d.opacity);
      ctx.fillStyle = 'rgba(255,255,255,0.72)'; ctx.font = '10px "Roboto Mono",monospace'; ctx.textAlign = 'center';
      ctx.fillText(CC.players[i].name, d.x, AY - d.r - 6);
      ctx.fillStyle = 'rgba(245,132,38,0.8)'; ctx.font = '9px "Roboto Mono",monospace';
      var sign = n.diff >= 0 ? '+' : '';
      ctx.fillText(sign + n.diff.toFixed(1), d.x, AY + d.r + 16);
    }
    ctx.restore();
  });

  // Pass 3 — selected dot (on top, glowing)
  if (activeIdx !== null) {
    var d = CC.dots[activeIdx], p = CC.players[activeIdx];
    ctx.save();
    ctx.shadowBlur = 20; ctx.shadowColor = '#F58426';
    ctx.beginPath(); ctx.arc(d.x, AY, Math.max(1, d.r), 0, Math.PI * 2);
    ctx.fillStyle = '#F58426'; ctx.fill(); ctx.restore();
    if (d.labelOpacity > 0.05) {
      ctx.save(); ctx.globalAlpha = Math.max(0, d.labelOpacity);
      ctx.fillStyle = '#fff'; ctx.font = '700 14px Oswald,sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(p.name, d.x, AY - d.r - 8);
      ctx.fillStyle = '#F58426'; ctx.font = '10px "Roboto Mono",monospace';
      ctx.fillText(p.career_score.toFixed(1), d.x, AY - d.r - 21);
      ctx.restore();
    }
  }
}

function ccLoop() {
  CC.rafHandle = requestAnimationFrame(ccLoop);
  var sp = 0.09;
  CC.dots.forEach(function(d) {
    d.x            += (d.targetX            - d.x)            * sp;
    d.r            += (d.targetR            - d.r)            * sp;
    d.opacity      += (d.targetOpacity      - d.opacity)      * sp;
    d.labelOpacity += (d.targetLabelOpacity - d.labelOpacity) * sp;
  });
  ccDraw();
}

function ccHitTest(mx, my) {
  var hits = [];
  CC.dots.forEach(function(d, i) {
    if (d.opacity < 0.08) return;
    var dx = mx - d.x, dy = my - CC.axisY;
    var dist = Math.sqrt(dx*dx + dy*dy);
    if (dist <= Math.max(d.r + 5, 11)) hits.push({ idx: i, dist: dist });
  });
  hits.sort(function(a, b) { return a.dist - b.dist; });
  return hits.length > 0 ? hits[0].idx : null;
}

function ccHandleMove(e) {
  if (!CC.canvas) return;
  var rect = CC.canvas.getBoundingClientRect();
  var sc   = CC.canvas.width / rect.width;
  CC.hoveredIdx = ccHitTest((e.clientX - rect.left) * sc, (e.clientY - rect.top) * sc);
  CC.canvas.style.cursor = CC.hoveredIdx !== null ? 'pointer' : 'default';
}

function ccHandleClick(e) {
  if (!CC.canvas) return;
  var rect = CC.canvas.getBoundingClientRect();
  var sc   = CC.canvas.width / rect.width;
  var hit  = ccHitTest((e.clientX - rect.left) * sc, (e.clientY - rect.top) * sc);
  if (hit !== null) {
    if (CC.activeIdx === hit) { ccReset(); return; }
    ccFocus(hit);
  } else if (CC.mode === 'focused') {
    ccReset();
  }
}

function ccFocus(idx) {
  CC.activeIdx = idx;
  CC.mode      = 'focused';
  ccSetFocus(idx);
  ccUpdateInfo(idx);
  var infoEl = document.getElementById('cc-info');
  if (infoEl) infoEl.classList.add('cc-info-visible');
  var rb = document.getElementById('cc-reset');
  if (rb) rb.classList.add('cc-reset-visible');
}

function ccReset() {
  CC.activeIdx = null; CC.hoveredIdx = null; CC.mode = 'normal';
  ccSetNormal();
  var infoEl = document.getElementById('cc-info');
  if (infoEl) infoEl.classList.remove('cc-info-visible');
  var rb = document.getElementById('cc-reset');
  if (rb) rb.classList.remove('cc-reset-visible');
}

function ccFormatAwards(a) {
  var parts = [];
  if (a['MVP']             > 0) parts.push(a['MVP']             + '× MVP');
  if (a['Finals MVP']      > 0) parts.push(a['Finals MVP']      + '× Finals MVP');
  if (a['Champ']           > 0) parts.push(a['Champ']           + '× Champ');
  if (a['DPOY']            > 0) parts.push(a['DPOY']            + '× DPOY');
  if (a['All-Star']        > 0) parts.push(a['All-Star']        + '× All-Star');
  if (a['All-Defensive']   > 0) parts.push(a['All-Defensive']   + '× All-Def');
  if (a['All-NBA 1st Team']> 0) parts.push(a['All-NBA 1st Team']+ '× All-NBA 1st');
  if (a['ROY']             > 0) parts.push(a['ROY']             + '× ROY');
  return parts.slice(0, 5);
}

function ccUpdateInfo(idx) {
  var infoEl = document.getElementById('cc-info');
  if (!infoEl) return;
  var p         = CC.players[idx];
  var neighbors = ccGetNeighbors(idx, 3);
  var s         = p.per_game_stats;
  var awardsHtml = ccFormatAwards(p.awards_summary).map(function(a) {
    return '<span class="cc-award">' + a + '</span>';
  }).join('');
  var neighborsHtml = neighbors.map(function(n) {
    var np = CC.players[n.idx], sign = n.diff >= 0 ? '+' : '';
    return '<div class="cc-neighbor" onclick="ccFocus(' + n.idx + ')">' +
      '<span class="cc-neighbor-name">' + np.name + '</span>' +
      '<span class="cc-neighbor-diff">' + sign + n.diff.toFixed(1) + '</span>' +
    '</div>';
  }).join('');
  infoEl.innerHTML =
    '<div class="cc-info-inner">' +
      '<div class="cc-info-left">' +
        '<div class="cc-info-name">' + p.name + '</div>' +
        '<div class="cc-info-score"><span class="cc-score-num">' + p.career_score.toFixed(1) + '</span><span class="cc-score-lbl">Career Score</span></div>' +
        '<div class="cc-info-gp">' + p['games played'] + ' GP &nbsp;·&nbsp; ' + p.classification + '</div>' +
        '<div class="cc-awards">' + awardsHtml + '</div>' +
        '<div class="cc-stats-row">' +
          '<div class="cc-stat-item"><div class="cc-stat-val">' + s.PTS.toFixed(1) + '</div><div class="cc-stat-lbl">PPG</div></div>' +
          '<div class="cc-stat-item"><div class="cc-stat-val">' + s.REB.toFixed(1) + '</div><div class="cc-stat-lbl">RPG</div></div>' +
          '<div class="cc-stat-item"><div class="cc-stat-val">' + s.AST.toFixed(1) + '</div><div class="cc-stat-lbl">APG</div></div>' +
          '<div class="cc-stat-item"><div class="cc-stat-val">' + s.BLK.toFixed(1) + '</div><div class="cc-stat-lbl">BPG</div></div>' +
        '</div>' +
      '</div>' +
      '<div class="cc-info-right">' +
        '<div class="cc-neighbors-title">Closest by career score</div>' +
        '<div class="cc-neighbors">' + neighborsHtml + '</div>' +
      '</div>' +
    '</div>';
}

function ccInit() {
  fetch('player_profiles.json')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      CC.players  = data.sort(function(a, b) { return a.career_score - b.career_score; });
      CC.minScore = Math.floor(CC.players[0].career_score / 50) * 50;
      CC.maxScore = Math.ceil(CC.players[CC.players.length - 1].career_score / 50) * 50;

      // Size canvas to stage
      var stage = document.getElementById('cc-stage');
      if (stage) { CC.canvas.width = stage.offsetWidth; CC.canvas.height = 170; }

      // Init dot state — start opaque at 0 so they fade in
      CC.dots = CC.players.map(function(p) {
        var tx = ccScoreToX(p.career_score);
        return { x: tx, targetX: tx, r: 5, targetR: 5, opacity: 0, targetOpacity: 1, labelOpacity: 0, targetLabelOpacity: 0 };
      });

      // Responsive resize
      window.addEventListener('resize', function() {
        var stage = document.getElementById('cc-stage');
        if (!stage || !CC.canvas) return;
        CC.canvas.width = stage.offsetWidth;
        if (CC.activeIdx !== null) ccSetFocus(CC.activeIdx); else ccSetNormal();
      });

      CC.canvas.addEventListener('mousemove',  ccHandleMove);
      CC.canvas.addEventListener('click',      ccHandleClick);
      CC.canvas.addEventListener('mouseleave', function() { CC.hoveredIdx = null; });

      var rb = document.getElementById('cc-reset');
      if (rb) rb.onclick = ccReset;

      ccLoop();
    })
    .catch(function(err) { console.warn('Career comparison: cannot load player_profiles.json', err); });
}

// ── LAP DELTA ANALYZER (F1) ──────────────────────────────────────────────────

var ldInited = false;

var LD = {
  canvas: null, ctx: null,
  laps: [], maxDelta: 1,
  revealCount: 0, timers: [],
  hoveredBar: null,
};

function ldGenerateLaps() {
  var out = [];
  for (var i = 1; i <= 78; i++) {
    var d;
    // Pit laps produce big swings — the pitting driver loses 25s+ on that lap
    if (i === 24) { d = -3.1; }                    // VER pits — his lap time huge, LEC faster
    else if (i === 28) { d = 2.9; }                // LEC pits
    else if (i === 47) { d = -2.4; }               // VER 2nd stop
    else if (i === 52) { d = 2.6; }                // LEC 2nd stop
    else if (i === 22 || i === 23) { d = i === 22 ? -0.55 : 0.38; }  // VSC
    else if (i <= 8)  { d = Math.sin(i * 0.55) * 0.12 - 0.06; }     // LEC managing gap
    else if (i <= 21) { d = Math.sin(i * 0.42) * 0.11 - 0.03; }     // balanced
    else if (i >= 25 && i <= 27) { d = 0.32 + Math.sin(i * 1.1) * 0.06; } // VER on fresh softs
    else if (i >= 29 && i <= 46) { d = 0.07 + Math.sin(i * 0.66) * 0.07; }// VER edging
    else if (i >= 48 && i <= 51) { d = 0.22 + Math.sin(i * 0.9) * 0.05; } // VER clear
    else if (i >= 53 && i <= 78) { d = 0.04 + Math.sin(i * 0.53) * 0.06; }// settle
    else { d = Math.sin(i * 0.37) * 0.09; }

    // Sectors: split delta across S1/S2/S3 with slight variance via sin
    var s1 = d * 0.30 + Math.sin(i * 1.27) * 0.013;
    var s2 = d * 0.43 + Math.sin(i * 1.81) * 0.011;
    var s3 = d - s1 - s2;

    var tyre = i <= 24 ? 'S' : (i <= 47 ? 'M' : 'H');
    out.push({
      lap: i,
      delta: Math.round(d * 1000) / 1000,
      s1: Math.round(s1 * 1000) / 1000,
      s2: Math.round(s2 * 1000) / 1000,
      s3: Math.round(s3 * 1000) / 1000,
      tyre: tyre
    });
  }
  return out;
}

function ldDraw() {
  var canvas = LD.canvas, ctx = LD.ctx;
  if (!ctx || !canvas.width) return;

  var W = canvas.width, H = canvas.height;
  var PL = 50, PR = 16, PT = 18, PB = 34;
  var chartW = W - PL - PR;
  var zeroY  = PT + (H - PT - PB) / 2;
  var maxBarH = (H - PT - PB) / 2 - 5;
  var barW   = chartW / LD.laps.length;

  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = '#080808';
  ctx.fillRect(0, 0, W, H);

  // Driver side labels
  ctx.font = '700 9px Oswald,sans-serif'; ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(245,132,38,.55)'; ctx.fillText('VER', PL - 7, zeroY - 6);
  ctx.fillStyle = 'rgba(220,0,0,.55)';    ctx.fillText('LEC', PL - 7, zeroY + 17);

  // Zero line
  ctx.strokeStyle = '#1e1e14'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PL, zeroY); ctx.lineTo(W - PR, zeroY); ctx.stroke();

  // Bars
  for (var i = 0; i < Math.min(LD.revealCount, LD.laps.length); i++) {
    var lap  = LD.laps[i];
    var x    = PL + i * barW;
    var bh   = Math.min(Math.abs(lap.delta) / LD.maxDelta * maxBarH, maxBarH);
    var isA  = lap.delta >= 0;  // VER faster
    var isPit = Math.abs(lap.delta) > 2;
    var isHov = i === LD.hoveredBar;

    // Tyre rail at bottom
    var tyreCol = lap.tyre === 'S' ? 'rgba(255,68,68,0.45)' : lap.tyre === 'M' ? 'rgba(255,238,68,0.45)' : 'rgba(220,220,220,0.35)';
    ctx.fillStyle = tyreCol;
    ctx.fillRect(x + 0.5, H - PB + 5, barW - 1, 3);

    // Bar color
    if (isA) {
      ctx.fillStyle = isHov ? 'rgba(245,132,38,0.92)' : isPit ? 'rgba(245,132,38,0.2)' : 'rgba(245,132,38,0.65)';
      ctx.fillRect(x + 0.5, zeroY - bh, barW - 1, bh);
    } else {
      ctx.fillStyle = isHov ? 'rgba(220,0,0,0.92)' : isPit ? 'rgba(220,0,0,0.2)' : 'rgba(220,0,0,0.65)';
      ctx.fillRect(x + 0.5, zeroY, barW - 1, bh);
    }

    // Hover outline
    if (isHov) {
      ctx.strokeStyle = isA ? '#F58426' : '#DC0000';
      ctx.lineWidth = 1;
      if (isA) ctx.strokeRect(x + 0.5, zeroY - bh, barW - 1, bh);
      else     ctx.strokeRect(x + 0.5, zeroY, barW - 1, bh);
    }

    // Lap number ticks every 10
    if (lap.lap % 10 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.font = '8px "Roboto Mono",monospace'; ctx.textAlign = 'center';
      ctx.fillText(lap.lap, x + barW / 2, H - PB + 16);
    }
  }

  // "LAP" axis label
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.font = '8px "Roboto Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText('LAP', W / 2, H - 4);
}

function ldAnimate() {
  LD.timers.forEach(function(t) { clearTimeout(t); });
  LD.timers = [];
  LD.revealCount = 0;
  for (var i = 0; i <= LD.laps.length; i++) {
    (function(n) {
      var t = setTimeout(function() { LD.revealCount = n; ldDraw(); }, n * 16);
      LD.timers.push(t);
    })(i);
  }
}

function ldReplay() { ldAnimate(); }

function ldUpdateHoverPanel(lap) {
  var panel = document.getElementById('ld-hover-panel');
  if (!panel) return;
  if (!lap) { panel.style.opacity = '0.3'; document.getElementById('ld-hp-lap').textContent = 'Hover a bar'; document.getElementById('ld-hp-delta').textContent = '—'; document.getElementById('ld-hp-s1').textContent = 'S1 —'; document.getElementById('ld-hp-s2').textContent = 'S2 —'; document.getElementById('ld-hp-s3').textContent = 'S3 —'; document.getElementById('ld-hp-tyre').textContent = '—'; return; }
  panel.style.opacity = '1';
  document.getElementById('ld-hp-lap').textContent = 'Lap ' + lap.lap;
  var sign = lap.delta >= 0 ? 'VER +' : 'LEC +';
  var dEl = document.getElementById('ld-hp-delta');
  dEl.textContent = sign + Math.abs(lap.delta).toFixed(3) + 's';
  dEl.style.color = lap.delta >= 0 ? '#F58426' : '#DC0000';
  document.getElementById('ld-hp-s1').textContent = 'S1 ' + (lap.s1 >= 0 ? '+' : '') + lap.s1.toFixed(3) + 's';
  document.getElementById('ld-hp-s2').textContent = 'S2 ' + (lap.s2 >= 0 ? '+' : '') + lap.s2.toFixed(3) + 's';
  document.getElementById('ld-hp-s3').textContent = 'S3 ' + (lap.s3 >= 0 ? '+' : '') + lap.s3.toFixed(3) + 's';
  var tyreNames = { S: '● Soft', M: '● Medium', H: '● Hard' };
  var tyreColors = { S: '#FF4444', M: '#FFEE44', H: '#DDDDDD' };
  var tyreEl = document.getElementById('ld-hp-tyre');
  tyreEl.textContent = tyreNames[lap.tyre] || lap.tyre;
  tyreEl.style.color = tyreColors[lap.tyre] || '#888';
}

function ldInit() {
  LD.canvas = document.getElementById('ld-canvas');
  if (!LD.canvas) return;
  LD.ctx    = LD.canvas.getContext('2d');
  LD.laps   = ldGenerateLaps();
  LD.maxDelta = Math.max.apply(null, LD.laps.map(function(l) { return Math.abs(l.delta); }));

  var stage = document.getElementById('ld-stage');
  if (stage) { LD.canvas.width = stage.offsetWidth; LD.canvas.height = 190; }

  LD.canvas.addEventListener('mousemove', function(e) {
    var rect = LD.canvas.getBoundingClientRect();
    var sc   = LD.canvas.width / rect.width;
    var mx   = (e.clientX - rect.left) * sc;
    var PL = 50, barW = (LD.canvas.width - PL - 16) / LD.laps.length;
    var idx  = Math.floor((mx - PL) / barW);
    if (idx >= 0 && idx < LD.laps.length && idx < LD.revealCount) {
      LD.hoveredBar = idx;
      LD.canvas.style.cursor = 'crosshair';
      ldUpdateHoverPanel(LD.laps[idx]);
    } else {
      LD.hoveredBar = null;
      LD.canvas.style.cursor = 'default';
      ldUpdateHoverPanel(null);
    }
    ldDraw();
  });

  LD.canvas.addEventListener('mouseleave', function() {
    LD.hoveredBar = null;
    ldUpdateHoverPanel(null);
    ldDraw();
  });

  window.addEventListener('resize', function() {
    var stage = document.getElementById('ld-stage');
    if (!stage || !LD.canvas) return;
    LD.canvas.width = stage.offsetWidth;
    ldDraw();
  });

  setTimeout(ldAnimate, 350);
}


// ── SHOT TRAJECTORY VIEWER (CV) ───────────────────────────────────────────────

var trInited = false;

var TR = {
  canvas: null, ctx: null,
  t: 0, raf: null, phase: 'idle',
  points: [],
  // Shot parameters (Wemby step-back 3PT)
  releaseAngle: 51,  // degrees
  peakFt: 14.2,
  distFt: 27,
  releaseFt: 7.2,
  basketFt: 10,
  // Derived canvas coords
  P0: null, P2: null, ctrl: null,
  FLOOR: 0, FT: 0,
};

function trBuildArc() {
  if (!TR.canvas) return;
  var W = TR.canvas.width, H = TR.canvas.height;
  TR.FLOOR = H - 40;
  TR.FT    = (W - 130) / TR.distFt;

  TR.P0   = { x: 65, y: TR.FLOOR - TR.releaseFt * TR.FT };
  TR.P2   = { x: W - 65, y: TR.FLOOR - TR.basketFt * TR.FT };

  // Control point via vertex form: ensure peak at midX at peakFt height
  var midX  = (TR.P0.x + TR.P2.x) / 2;
  var peakY = TR.FLOOR - TR.peakFt * TR.FT;
  TR.ctrl   = {
    x: 2 * midX  - 0.5 * TR.P0.x - 0.5 * TR.P2.x,
    y: 2 * peakY - 0.5 * TR.P0.y - 0.5 * TR.P2.y
  };

  // Pre-compute 120 arc points
  TR.points = [];
  for (var i = 0; i <= 120; i++) {
    var t = i / 120;
    var mt = 1 - t;
    TR.points.push({
      x: mt*mt*TR.P0.x + 2*mt*t*TR.ctrl.x + t*t*TR.P2.x,
      y: mt*mt*TR.P0.y + 2*mt*t*TR.ctrl.y + t*t*TR.P2.y,
      t: t
    });
  }
}

function trDraw() {
  var canvas = TR.canvas, ctx = TR.ctx;
  if (!ctx || !canvas.width || !TR.points.length) return;

  var W = canvas.width, H = canvas.height;
  var FLOOR = TR.FLOOR, FT = TR.FT;
  var progress = TR.t;
  var curIdx   = Math.min(Math.floor(progress * 120), 120);

  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = '#040C14';
  ctx.fillRect(0, 0, W, H);

  // Height grid lines (5 / 10 / 15 ft)
  [5, 10, 15].forEach(function(h) {
    var gy = FLOOR - h * FT;
    if (gy < 0) return;
    ctx.strokeStyle = 'rgba(0,200,255,0.05)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    ctx.fillStyle = 'rgba(0,200,255,0.18)';
    ctx.font = '8px "Roboto Mono",monospace'; ctx.textAlign = 'left';
    ctx.fillText(h + 'ft', 4, gy - 3);
  });

  // Floor
  ctx.strokeStyle = '#0d2030'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, FLOOR + 1); ctx.lineTo(W, FLOOR + 1); ctx.stroke();

  // Ghost arc (full path dim)
  ctx.strokeStyle = 'rgba(0,200,255,0.07)'; ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  ctx.moveTo(TR.P0.x, TR.P0.y);
  TR.points.forEach(function(p) { ctx.lineTo(p.x, p.y); });
  ctx.stroke();
  ctx.setLineDash([]);

  // Arc drawn so far
  if (curIdx > 1) {
    ctx.strokeStyle = 'rgba(0,200,255,0.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(TR.P0.x, TR.P0.y);
    for (var i = 1; i <= curIdx; i++) ctx.lineTo(TR.points[i].x, TR.points[i].y);
    ctx.stroke();

    // Trail dots
    for (var i = Math.max(0, curIdx - 18); i < curIdx; i++) {
      var pt = TR.points[i];
      var a  = (i - (curIdx - 18)) / 18 * 0.3;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 2, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(0,200,255,' + a + ')'; ctx.fill();
    }
  }

  // Release angle indicator (fade out after first 20%)
  if (progress < 0.28) {
    var fadeA = Math.max(0, 1 - progress / 0.22);
    var aRad  = TR.releaseAngle * Math.PI / 180;
    var alen  = 50;
    ctx.save();
    ctx.globalAlpha = fadeA * 0.7;
    ctx.strokeStyle = '#00C8FF'; ctx.lineWidth = 1; ctx.setLineDash([3,3]);
    ctx.beginPath();
    ctx.moveTo(TR.P0.x, TR.P0.y);
    ctx.lineTo(TR.P0.x + alen * Math.cos(aRad), TR.P0.y - alen * Math.sin(aRad));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '9px "Roboto Mono",monospace'; ctx.textAlign = 'left';
    ctx.fillStyle = '#00C8FF';
    ctx.fillText(TR.releaseAngle + '°', TR.P0.x + 8, TR.P0.y - 28);
    ctx.restore();
  }

  // Peak annotation (visible around apex)
  if (progress > 0.32 && progress < 0.78) {
    var pk   = TR.points[60];
    var fade = Math.min((progress - 0.32) / 0.12, 1) * Math.min((0.78 - progress) / 0.1, 1);
    ctx.save(); ctx.globalAlpha = fade;
    ctx.strokeStyle = 'rgba(0,200,255,0.35)'; ctx.lineWidth = 1; ctx.setLineDash([2,3]);
    ctx.beginPath(); ctx.moveTo(pk.x, pk.y); ctx.lineTo(pk.x, FLOOR); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(0,200,255,0.85)'; ctx.font = '9px "Roboto Mono",monospace'; ctx.textAlign = 'center';
    ctx.fillText(TR.peakFt + ' ft', pk.x, pk.y - 9);
    ctx.restore();
  }

  // Release marker
  ctx.beginPath(); ctx.arc(TR.P0.x, TR.P0.y, 3.5, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(0,200,255,0.4)'; ctx.fill();

  // Basket (hoop + backboard)
  ctx.strokeStyle = curIdx >= 118 ? '#00C8FF' : 'rgba(0,200,255,0.45)';
  ctx.lineWidth = curIdx >= 118 ? 2.5 : 1.5;
  ctx.beginPath();
  ctx.moveTo(TR.P2.x - 9, TR.P2.y);
  ctx.lineTo(TR.P2.x + 9, TR.P2.y);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,200,255,0.3)'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(TR.P2.x + 13, TR.P2.y - 18);
  ctx.lineTo(TR.P2.x + 13, TR.P2.y + 4);
  ctx.stroke();

  // Ball
  if (curIdx <= 120 && TR.points[curIdx]) {
    var bp = TR.points[curIdx];
    ctx.save();
    ctx.shadowBlur  = curIdx >= 118 ? 30 : 16;
    ctx.shadowColor = '#00C8FF';
    ctx.beginPath(); ctx.arc(bp.x, bp.y, 7, 0, Math.PI*2);
    ctx.fillStyle = '#00C8FF'; ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.arc(bp.x, bp.y, 3.5, 0, Math.PI*2);
    ctx.fillStyle = '#001820'; ctx.fill();
  }

  // Distance label
  ctx.strokeStyle = 'rgba(0,200,255,0.12)'; ctx.lineWidth = 1; ctx.setLineDash([2,3]);
  ctx.beginPath(); ctx.moveTo(TR.P0.x, FLOOR + 8); ctx.lineTo(TR.P2.x, FLOOR + 8); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(0,200,255,0.3)'; ctx.font = '8px "Roboto Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText(TR.distFt + ' ft', (TR.P0.x + TR.P2.x) / 2, FLOOR + 20);

  // Update stat panel
  document.getElementById('tr-frame').textContent = curIdx;
  var phases = ['trp-release','trp-apex','trp-entry'];
  phases.forEach(function(p) { var el = document.getElementById(p); if (el) el.classList.remove('active'); });
  var phaseId = progress < 0.18 ? 'trp-release' : progress < 0.62 ? 'trp-apex' : 'trp-entry';
  var activeEl = document.getElementById(phaseId);
  if (activeEl) activeEl.classList.add('active');
}

function trAnimLoop() {
  if (TR.phase !== 'playing') return;
  TR.t += 0.0065;
  if (TR.t >= 1) { TR.t = 1; TR.phase = 'done'; trDraw(); return; }
  trDraw();
  TR.raf = requestAnimationFrame(trAnimLoop);
}

function trReplay() {
  if (TR.raf) cancelAnimationFrame(TR.raf);
  TR.t = 0; TR.phase = 'playing';
  trAnimLoop();
}

function trInit() {
  TR.canvas = document.getElementById('tr-canvas');
  if (!TR.canvas) return;
  TR.ctx = TR.canvas.getContext('2d');
  var wrap = document.querySelector('.tr-canvas-wrap');
  if (wrap) { TR.canvas.width = wrap.offsetWidth; TR.canvas.height = 265; }
  trBuildArc();
  window.addEventListener('resize', function() {
    var wrap = document.querySelector('.tr-canvas-wrap');
    if (!wrap || !TR.canvas) return;
    TR.canvas.width = wrap.offsetWidth;
    trBuildArc(); trDraw();
  });
  trDraw();
  setTimeout(trReplay, 500);
}


// ── SINGLE OVERLAY HOOK (shot chart + career comparison) ────────────────────

// Auto-load first game when NBA overlay opens for the first time
var _origOpenOverlay = openOverlay;
openOverlay = function(name) {
  _origOpenOverlay(name);

  if (name === 'nba') {
    if (!wembyInited) {
      wembyInited = true;
      setTimeout(function() { wembyLoadGame(0); }, 450);
    }
    if (!ccInited) {
      ccInited = true;
      setTimeout(function() {
        CC.canvas = document.getElementById('cc-canvas');
        if (CC.canvas) { CC.ctx = CC.canvas.getContext('2d'); ccInit(); }
      }, 600);
    }
  }

  if (name === 'f1') {
    if (!ldInited) {
      ldInited = true;
      setTimeout(function() { ldInit(); }, 400);
    }
  }

  if (name === 'cv') {
    if (!trInited) {
      trInited = true;
      setTimeout(function() { trInit(); }, 400);
    }
  }
};
