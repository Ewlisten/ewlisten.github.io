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
  // Zones view removed — always show shots
  wembyViewMode = 'shots';
  var zl = document.getElementById('wemby-zone-layer');
  var dg = document.getElementById('wemby-dots');
  if (zl) zl.style.opacity = '0';
  if (dg) { dg.style.opacity = '1'; dg.style.transition = 'opacity .35s'; }
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

// ── MULTI-DRIVER TELEMETRY (LEC / STR / PIA — Canada / Jeddah / Miami) ────────

var mltInited = false;

var MLT = {
  canvas:  null,
  ctx:     null,
  race:    'canada',
  channel: 'speed',
  mode:    'speed',
  drivers: { LEC: true, STR: true, PIA: true },
  data:    { LEC: [], STR: [], PIA: [] },
  colors:  { LEC: '#DC0000', STR: '#00A550', PIA: '#FF8000' },
  maxTime: 0,
  scrubT:  null,
  hoverT:  null,
  PAD:     { L: 48, R: 16, T: 18, B: 36 },
};

var MLT_CHANNEL_RANGE = {
  speed:    { min: 0, max: 350, unit: 'km/h', label: 'SPEED' },
  throttle: { min: 0, max: 100, unit: '%',    label: 'THROTTLE' },
  brake:    { min: 0, max: 1,   unit: '',     label: 'BRAKE ON' },
};

function mltInterp(data, t) {
  if (!data || !data.length) return null;
  if (t <= data[0].time) return data[0];
  if (t >= data[data.length-1].time) return data[data.length-1];
  var lo = 0, hi = data.length - 1;
  while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (data[mid].time <= t) lo = mid; else hi = mid; }
  var p0 = data[lo], p1 = data[hi], frac = (t - p0.time) / (p1.time - p0.time);
  return { time: t, speed: p0.speed + (p1.speed - p0.speed) * frac, throttle: p0.throttle + (p1.throttle - p0.throttle) * frac, brake: p0.brake + (p1.brake - p0.brake) * frac };
}

function mltToX(t) {
  var W = MLT.canvas.width, PAD = MLT.PAD;
  return PAD.L + (t / MLT.maxTime) * (W - PAD.L - PAD.R);
}

function mltToY(val) {
  var H = MLT.canvas.height, PAD = MLT.PAD;
  var rng = MLT_CHANNEL_RANGE[MLT.channel];
  return PAD.T + (1 - (val - rng.min) / (rng.max - rng.min)) * (H - PAD.T - PAD.B);
}

function mltDraw() {
  var canvas = MLT.canvas, ctx = MLT.ctx;
  if (!ctx || !canvas.width || !MLT.maxTime) return;
  var W = canvas.width, H = canvas.height, PAD = MLT.PAD;
  var rng = MLT_CHANNEL_RANGE[MLT.channel];
  var DRVS = ['LEC', 'STR', 'PIA'];

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#060608'; ctx.fillRect(0, 0, W, H);

  for (var g = 0; g <= 5; g++) {
    var gv = g * rng.max / 5, gy = mltToY(gv);
    ctx.strokeStyle = g === 0 ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.025)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD.L, gy); ctx.lineTo(W - PAD.R, gy); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.font = '8px "Roboto Mono",monospace'; ctx.textAlign = 'right';
    var gl = MLT.channel === 'brake' ? (gv > 0.5 ? 'ON' : (gv < 0.1 ? 'OFF' : '')) : Math.round(gv) + (rng.unit ? ' ' + rng.unit : '');
    ctx.fillText(gl, PAD.L - 4, gy + 3);
  }
  var tick = 10;
  while (tick < MLT.maxTime) {
    var tx = mltToX(tick);
    ctx.strokeStyle = 'rgba(255,255,255,.04)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(tx, PAD.T); ctx.lineTo(tx, H - PAD.B); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.font = '8px "Roboto Mono",monospace'; ctx.textAlign = 'center';
    ctx.fillText(tick + 's', tx, H - PAD.B + 13); tick += 10;
  }
  ctx.save(); ctx.translate(10, H / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.font = '8px "Roboto Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText(rng.label, 0, 0); ctx.restore();

  if (MLT.mode === 'delta') {
    var steps = 200, dt = MLT.maxTime / steps;
    DRVS.forEach(function(drv) {
      if (!MLT.drivers[drv] || !MLT.data[drv].length) return;
      var aCol = { LEC:'rgba(220,0,0,0.15)', STR:'rgba(0,165,80,0.15)', PIA:'rgba(255,128,0,0.15)' };
      var topPts = [], botPts = [];
      for (var s = 0; s <= steps; s++) {
        var t2 = s * dt, myPt = mltInterp(MLT.data[drv], t2);
        if (!myPt) continue;
        var myV = myPt[MLT.channel], bestV = myV;
        DRVS.forEach(function(d2) { if (!MLT.drivers[d2] || !MLT.data[d2].length) return; var p2 = mltInterp(MLT.data[d2], t2); if (p2) bestV = Math.max(bestV, p2[MLT.channel]); });
        topPts.push({ x: mltToX(t2), y: mltToY(myV) }); botPts.push({ x: mltToX(t2), y: mltToY(bestV) });
      }
      if (!topPts.length) return;
      ctx.beginPath(); ctx.moveTo(topPts[0].x, topPts[0].y);
      topPts.forEach(function(p) { ctx.lineTo(p.x, p.y); });
      for (var i = botPts.length - 1; i >= 0; i--) ctx.lineTo(botPts[i].x, botPts[i].y);
      ctx.closePath(); ctx.fillStyle = aCol[drv] || 'rgba(255,255,255,.08)'; ctx.fill();
    });
  }

  DRVS.forEach(function(drv) {
    if (!MLT.drivers[drv] || !MLT.data[drv].length) return;
    ctx.beginPath(); var first = true;
    MLT.data[drv].forEach(function(pt) { var x = mltToX(pt.time), y = mltToY(pt[MLT.channel]); if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y); });
    ctx.strokeStyle = MLT.colors[drv]; ctx.lineWidth = MLT.mode === 'delta' ? 1.8 : 1.4; ctx.globalAlpha = 0.85; ctx.stroke(); ctx.globalAlpha = 1;
  });

  var activeT = MLT.hoverT !== null ? MLT.hoverT : MLT.scrubT;
  if (activeT !== null && MLT.maxTime > 0) {
    var lx = mltToX(activeT);
    ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 1; ctx.setLineDash([3,3]);
    ctx.beginPath(); ctx.moveTo(lx, PAD.T); ctx.lineTo(lx, H - PAD.B); ctx.stroke(); ctx.setLineDash([]);
    DRVS.forEach(function(drv) {
      if (!MLT.drivers[drv] || !MLT.data[drv].length) return;
      var pt = mltInterp(MLT.data[drv], activeT); if (!pt) return;
      var cy = mltToY(pt[MLT.channel]);
      ctx.beginPath(); ctx.arc(lx, cy, 4, 0, Math.PI*2); ctx.fillStyle = '#060608'; ctx.fill();
      ctx.strokeStyle = MLT.colors[drv]; ctx.lineWidth = 2; ctx.stroke();
    });
  }

  var lx2 = W - PAD.R - 4, liA = 0;
  DRVS.forEach(function(drv) {
    if (!MLT.drivers[drv]) return;
    var ly = PAD.T + 10 + liA * 18;
    ctx.beginPath(); ctx.moveTo(lx2 - 20, ly); ctx.lineTo(lx2 - 6, ly);
    ctx.strokeStyle = MLT.colors[drv]; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = MLT.colors[drv]; ctx.font = '700 9px Oswald,sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(drv, lx2 - 25, ly + 3.5); liA++;
  });
}

function mltUpdateStatRow(t) {
  var timeEl = document.getElementById('mlt-s-time'); if (timeEl) timeEl.textContent = t.toFixed(2) + 's';
  var DRVS = ['LEC', 'STR', 'PIA'], rng = MLT_CHANNEL_RANGE[MLT.channel];
  var best = -Infinity, leadDrv = null;
  DRVS.forEach(function(drv) {
    var el = document.getElementById('mlt-s-' + drv);
    if (!MLT.data[drv].length) { if (el) el.textContent = '—'; return; }
    var pt = mltInterp(MLT.data[drv], t); if (!pt) { if (el) el.textContent = '—'; return; }
    var v = pt[MLT.channel];
    var txt = MLT.channel === 'brake' ? (v > 0.5 ? 'ON' : 'OFF') : Math.round(v) + (rng.unit || '');
    if (el) el.textContent = MLT.drivers[drv] ? txt : '—';
    if (MLT.drivers[drv] && v > best) { best = v; leadDrv = drv; }
  });
  var leadEl = document.getElementById('mlt-s-lead');
  if (leadEl) { leadEl.textContent = leadDrv || '—'; leadEl.style.color = leadDrv ? MLT.colors[leadDrv] : 'rgba(255,255,255,.7)'; }
}

function mltLoadRace(race) {
  MLT.race = race; MLT.data = { LEC: [], STR: [], PIA: [] }; MLT.maxTime = 0;
  var drivers = ['LEC', 'STR', 'PIA'], loaded = 0;
  drivers.forEach(function(drv) {
    fetch('telemetry_' + drv + '_' + race + '.json')
      .then(function(r) { return r.json(); })
      .then(function(d) {
        MLT.data[drv] = d;
        if (d.length) { var last = d[d.length-1].time; if (last > MLT.maxTime) MLT.maxTime = last; }
        loaded++; if (loaded === drivers.length) { var sc = document.getElementById('mlt-scrubber'); if (sc) sc.max = Math.round(MLT.maxTime * 10); mltDraw(); }
      }).catch(function() { loaded++; });
  });
}

function mltSelectRace(race, btn) {
  document.querySelectorAll('.mlt-race-btn').forEach(function(b) { b.classList.remove('active'); }); btn.classList.add('active');
  MLT.scrubT = null; var sc = document.getElementById('mlt-scrubber'); if (sc) sc.value = 0;
  mltLoadRace(race);
  var cap = document.getElementById('mlt-caption'), rl = { canada:'Canada 2025', jeddah:'Jeddah 2025', miami:'Miami 2025' };
  if (cap) cap.textContent = 'Fig 03 — Multi-driver telemetry \xb7 ' + (rl[race]||race) + ' \xb7 ' + MLT_CHANNEL_RANGE[MLT.channel].label + ' channel. Hover to scrub. Δ DELTA mode shows gain/loss regions.';
}

function mltToggleDriver(drv, btn) { MLT.drivers[drv] = !MLT.drivers[drv]; btn.classList.toggle('active', MLT.drivers[drv]); mltDraw(); }

function mltSelectChannel(ch, btn) {
  MLT.channel = ch;
  document.querySelectorAll('.mlt-ch-btn').forEach(function(b) { b.classList.remove('active'); }); btn.classList.add('active'); mltDraw();
}

function mltToggleMode() {
  MLT.mode = MLT.mode === 'speed' ? 'delta' : 'speed';
  var mb = document.getElementById('mlt-mode-btn'); if (mb) mb.textContent = MLT.mode === 'delta' ? '— SPEED' : 'Δ DELTA'; mltDraw();
}

function mltScrub(val) {
  if (!MLT.maxTime) return;
  var sc = document.getElementById('mlt-scrubber'), maxVal = sc ? parseInt(sc.max) : 1000;
  MLT.scrubT = (val / maxVal) * MLT.maxTime; mltUpdateStatRow(MLT.scrubT); mltDraw();
}

function mltInit() {
  MLT.canvas = document.getElementById('mlt-canvas');
  if (!MLT.canvas) return;
  MLT.ctx = MLT.canvas.getContext('2d');
  var stage = document.getElementById('mlt-stage');
  if (stage) { MLT.canvas.width = stage.offsetWidth; MLT.canvas.height = 220; }

  MLT.canvas.addEventListener('mousemove', function(e) {
    var rect = MLT.canvas.getBoundingClientRect(), scaleX = MLT.canvas.width / rect.width;
    var mx = (e.clientX - rect.left) * scaleX, PAD = MLT.PAD;
    var t = ((mx - PAD.L) / (MLT.canvas.width - PAD.L - PAD.R)) * MLT.maxTime;
    t = Math.max(0, Math.min(MLT.maxTime, t)); MLT.hoverT = t;
    var stageEl = document.getElementById('mlt-stage'), tt = document.getElementById('mlt-tooltip');
    if (tt && stageEl) {
      var DRVS = ['LEC','STR','PIA'], rng = MLT_CHANNEL_RANGE[MLT.channel];
      var lines = DRVS.filter(function(d) { return MLT.drivers[d] && MLT.data[d].length; }).map(function(d) {
        var pt = mltInterp(MLT.data[d], t), v = pt ? pt[MLT.channel] : null;
        var txt = v == null ? '—' : MLT.channel === 'brake' ? (v > 0.5 ? 'ON' : 'OFF') : Math.round(v) + rng.unit;
        return '<span style="color:' + MLT.colors[d] + '">' + d + '</span> ' + txt;
      });
      tt.innerHTML = t.toFixed(2) + 's<br>' + lines.join('<br>');
      var sr = stageEl.getBoundingClientRect();
      tt.style.left = (e.clientX - sr.left + 14) + 'px'; tt.style.top = (e.clientY - sr.top - 12) + 'px'; tt.style.opacity = '1';
    }
    mltUpdateStatRow(t); mltDraw();
  });

  MLT.canvas.addEventListener('mouseleave', function() {
    MLT.hoverT = null; var tt = document.getElementById('mlt-tooltip'); if (tt) tt.style.opacity = '0'; mltDraw();
  });

  window.addEventListener('resize', function() {
    var stageEl = document.getElementById('mlt-stage'); if (!stageEl || !MLT.canvas) return;
    MLT.canvas.width = stageEl.offsetWidth; mltDraw();
  });

  mltLoadRace('canada');
}



// ── SHOT TRAJECTORY VIEWER (CV) ───────────────────────────────────────────────

var trInited = false;

// Shot profile data sourced from analyzed JSON files
// Wemby_StpBK_analyzed.json: fps 59.08, shot frame 423, ball_pos [1508,547], rim_bbox [1396,276,1469,364]
// TyMax_3_analyzed.json: fps 31.04, shot frame 209, ball_pos [758,298], rim_bbox [710,123,772,219]
var TR_PROFILES = {
  wemby: {
    label:        'Wembanyama',
    shotType:     '3PT Step-Back',
    releaseAngle: 51,
    peakFt:       14.2,
    distFt:       27,
    releaseFt:    7.2,
    basketFt:     10,
    fps:          59.08,
    frame:        423,
    result:       'MADE',
    // rim center derived from rim_bbox [1396,276,1469,364]: cx=1432, cy=320
    // ball_pos at shot: [1508, 547]
  },
  maxey: {
    label:        'Maxey',
    shotType:     '2PT Pull-Up',
    releaseAngle: 47,
    peakFt:       12.8,
    distFt:       18,
    releaseFt:    6.9,
    basketFt:     10,
    fps:          31.04,
    frame:        209,
    result:       'MADE',
    // rim_bbox [710,123,772,219]: cx=741, cy=171
    // ball_pos at shot: [758, 298]
  },
};

var TR = {
  canvas: null, ctx: null,
  t: 0, raf: null, phase: 'idle',
  points: [],
  player: 'wemby',
  // Active shot parameters (filled from TR_PROFILES on load)
  releaseAngle: 51,
  peakFt: 14.2,
  distFt: 27,
  releaseFt: 7.2,
  basketFt: 10,
  P0: null, P2: null, ctrl: null,
  FLOOR: 0, FT: 0,
};

function trBuildArc() {
  if (!TR.canvas) return;
  var W = TR.canvas.width, H = TR.canvas.height;
  TR.FLOOR = H - 40;

  // Cap FT so the arc peak never exceeds the top padding (26px from top)
  var ftByWidth  = (W - 130) / TR.distFt;
  var ftByHeight = (TR.FLOOR - 26) / TR.peakFt;   // peak must fit in available height
  TR.FT = Math.min(ftByWidth, ftByHeight);

  // Horizontally centre the arc when FT is height-constrained
  var arcWidthPx = TR.distFt * TR.FT;
  var padX       = Math.max(48, (W - arcWidthPx) / 2);

  TR.P0   = { x: padX,            y: TR.FLOOR - TR.releaseFt * TR.FT };
  TR.P2   = { x: padX + arcWidthPx, y: TR.FLOOR - TR.basketFt * TR.FT };

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

function trLoadProfile(player) {
  var prof = TR_PROFILES[player];
  if (!prof) return;
  TR.player       = player;
  TR.releaseAngle = prof.releaseAngle;
  TR.peakFt       = prof.peakFt;
  TR.distFt       = prof.distFt;
  TR.releaseFt    = prof.releaseFt;
  TR.basketFt     = prof.basketFt;

  var angleEl = document.getElementById('tr-angle');
  var peakEl  = document.getElementById('tr-peak');
  var distEl  = document.getElementById('tr-dist');
  var frameEl = document.getElementById('tr-frame');
  if (angleEl) angleEl.textContent = prof.releaseAngle + '\xb0';
  if (peakEl)  peakEl.textContent  = prof.peakFt;
  if (distEl)  distEl.textContent  = prof.distFt;
  if (frameEl) frameEl.textContent = prof.frame;

  var cap = document.getElementById('tr-caption');
  if (cap) cap.textContent = 'Fig 02 — ' + prof.label + ' ' + prof.shotType +
    ' trajectory model. Extracted via OpenCV pipeline at ' + prof.fps.toFixed(1) + ' fps. ' +
    prof.distFt + ' ft \xb7 ' + prof.releaseAngle + '\xb0 release \xb7 ' + prof.peakFt + ' ft apex \xb7 ' + prof.result + '.';
}

function trSwitchPlayer(player, btn) {
  document.querySelectorAll('.wemby-pswitch-btn[id^="trps-"]').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  trLoadProfile(player);
  if (TR.raf) cancelAnimationFrame(TR.raf);
  TR.t = 0; TR.phase = 'idle';
  trBuildArc();
  trDraw();
  setTimeout(trReplay, 150);
}

function trInit() {
  TR.canvas = document.getElementById('tr-canvas');
  if (!TR.canvas) return;
  TR.ctx = TR.canvas.getContext('2d');
  var wrap = document.querySelector('.tr-canvas-wrap');
  if (wrap) { TR.canvas.width = wrap.offsetWidth; TR.canvas.height = 310; }
  trLoadProfile('wemby');
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


// ── F1 MULTI-DRIVER TELEMETRY VIEWER ──────────────────────────────────────────

var tlmInited = false;

// ── TEAMMATE FASTEST LAP COMPARISON: ANT vs RUS ──────────────────────────────
var TLM = {
  canvas:  null,
  ctx:     null,
  channel: 'speed',
  data:    { ANT: [], RUS: [] },
  colors:  { ANT: '#00D2BE', RUS: '#C6C6C6' },
  maxTime: 0,
  scrubT:  null,
  hoverT:  null,
  PAD:     { L: 52, R: 16, T: 20, B: 36 },
};

var TLM_CHANNEL_RANGE = {
  speed:    { min: 0, max: 350, unit: 'km/h', label: 'SPEED' },
  throttle: { min: 0, max: 100, unit: '%',    label: 'THROTTLE' },
  brake:    { min: 0, max: 1,   unit: '',     label: 'BRAKE ON' },
};

function tlmInterp(data, t) {
  if (!data || !data.length) return null;
  if (t <= data[0].time) return data[0];
  if (t >= data[data.length-1].time) return data[data.length-1];
  var lo = 0, hi = data.length - 1;
  while (hi - lo > 1) {
    var mid = (lo + hi) >> 1;
    if (data[mid].time <= t) lo = mid; else hi = mid;
  }
  var p0 = data[lo], p1 = data[hi];
  var frac = (t - p0.time) / (p1.time - p0.time);
  return {
    time:     t,
    speed:    p0.speed    + (p1.speed    - p0.speed)    * frac,
    throttle: p0.throttle + (p1.throttle - p0.throttle) * frac,
    brake:    p0.brake    + (p1.brake    - p0.brake)    * frac,
  };
}

function tlmToX(t) {
  var W = TLM.canvas.width, PAD = TLM.PAD;
  return PAD.L + (t / TLM.maxTime) * (W - PAD.L - PAD.R);
}

function tlmToY(val) {
  var H = TLM.canvas.height, PAD = TLM.PAD;
  var rng = TLM_CHANNEL_RANGE[TLM.channel];
  var norm = (val - rng.min) / (rng.max - rng.min);
  return PAD.T + (1 - norm) * (H - PAD.T - PAD.B);
}

function tlmDraw() {
  var canvas = TLM.canvas, ctx = TLM.ctx;
  if (!ctx || !canvas.width || !TLM.maxTime) return;

  var W = canvas.width, H = canvas.height;
  var PAD = TLM.PAD;
  var rng = TLM_CHANNEL_RANGE[TLM.channel];
  var DRVS = ['ANT', 'RUS'];
  var hasData = TLM.data.ANT.length && TLM.data.RUS.length;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#060608';
  ctx.fillRect(0, 0, W, H);

  // Horizontal grid lines + Y-axis labels
  for (var g = 0; g <= 5; g++) {
    var gv = g * rng.max / 5;
    var gy = tlmToY(gv);
    ctx.strokeStyle = g === 0 ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.025)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD.L, gy); ctx.lineTo(W - PAD.R, gy); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.2)';
    ctx.font = '8px "Roboto Mono",monospace'; ctx.textAlign = 'right';
    var glabel = TLM.channel === 'brake'
      ? (gv > 0.5 ? 'ON' : (gv < 0.1 ? 'OFF' : ''))
      : Math.round(gv) + (rng.unit ? ' ' + rng.unit : '');
    ctx.fillText(glabel, PAD.L - 4, gy + 3);
  }

  // Time ticks every 10s
  var tick = 10;
  while (tick < TLM.maxTime) {
    var tx = tlmToX(tick);
    ctx.strokeStyle = 'rgba(255,255,255,.04)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(tx, PAD.T); ctx.lineTo(tx, H - PAD.B); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.font = '8px "Roboto Mono",monospace'; ctx.textAlign = 'center';
    ctx.fillText(tick + 's', tx, H - PAD.B + 13);
    tick += 10;
  }

  // Rotated Y-axis channel label
  ctx.save();
  ctx.translate(10, H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.font = '8px "Roboto Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText(rng.label, 0, 0);
  ctx.restore();

  // ── Delta fill: green where ANT is higher, red where RUS is higher ──
  if (hasData) {
    var STEPS = 400;
    var dt    = TLM.maxTime / STEPS;

    // Pre-sample both drivers
    var pts = [];
    for (var s = 0; s <= STEPS; s++) {
      var t2  = s * dt;
      var pA  = tlmInterp(TLM.data.ANT, t2);
      var pR  = tlmInterp(TLM.data.RUS, t2);
      if (pA && pR) pts.push({ t: t2, antV: pA[TLM.channel], rusV: pR[TLM.channel] });
    }

    // Draw segment-by-segment colored fill
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i], p1 = pts[i + 1];
      var x0 = tlmToX(p0.t), x1 = tlmToX(p1.t);
      var ayA0 = tlmToY(p0.antV), ayA1 = tlmToY(p1.antV);
      var ayR0 = tlmToY(p0.rusV), ayR1 = tlmToY(p1.rusV);

      // Determine crossing point within segment
      var dA0 = p0.antV - p0.rusV, dA1 = p1.antV - p1.rusV;
      var crossFrac = (dA0 !== dA1) ? dA0 / (dA0 - dA1) : -1;

      var segments = [];
      if (crossFrac > 0 && crossFrac < 1) {
        var xc   = x0 + crossFrac * (x1 - x0);
        var ycA  = ayA0 + crossFrac * (ayA1 - ayA0);
        var ycR  = ayR0 + crossFrac * (ayR1 - ayR0);
        segments.push({ x0:x0, yA0:ayA0, yR0:ayR0, x1:xc, yA1:ycA, yR1:ycR, ant: p0.antV >= p0.rusV });
        segments.push({ x0:xc, yA0:ycA,  yR0:ycR,  x1:x1, yA1:ayA1, yR1:ayR1, ant: p1.antV >= p1.rusV });
      } else {
        segments.push({ x0:x0, yA0:ayA0, yR0:ayR0, x1:x1, yA1:ayA1, yR1:ayR1, ant: p0.antV >= p0.rusV });
      }

      segments.forEach(function(seg) {
        ctx.beginPath();
        ctx.moveTo(seg.x0, seg.yA0);
        ctx.lineTo(seg.x1, seg.yA1);
        ctx.lineTo(seg.x1, seg.yR1);
        ctx.lineTo(seg.x0, seg.yR0);
        ctx.closePath();
        ctx.fillStyle = seg.ant ? 'rgba(0,210,130,0.18)' : 'rgba(210,50,50,0.18)';
        ctx.fill();
      });
    }
  }

  // Driver lines
  DRVS.forEach(function(drv) {
    if (!TLM.data[drv].length) return;
    var data = TLM.data[drv];
    ctx.beginPath();
    var first = true;
    data.forEach(function(pt) {
      var x = tlmToX(pt.time), y = tlmToY(pt[TLM.channel]);
      if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = TLM.colors[drv];
    ctx.lineWidth = 1.8;
    ctx.globalAlpha = 0.9;
    ctx.stroke();
    ctx.globalAlpha = 1;
  });

  // Scrub/hover crosshair + intersection dots
  var activeT = TLM.hoverT !== null ? TLM.hoverT : TLM.scrubT;
  if (activeT !== null && TLM.maxTime > 0) {
    var lx = tlmToX(activeT);
    ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(lx, PAD.T); ctx.lineTo(lx, H - PAD.B); ctx.stroke();
    ctx.setLineDash([]);
    DRVS.forEach(function(drv) {
      if (!TLM.data[drv].length) return;
      var pt = tlmInterp(TLM.data[drv], activeT);
      if (!pt) return;
      var cy = tlmToY(pt[TLM.channel]);
      ctx.beginPath(); ctx.arc(lx, cy, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#060608'; ctx.fill();
      ctx.strokeStyle = TLM.colors[drv]; ctx.lineWidth = 2; ctx.stroke();
    });
  }

  // Legend (top-right)
  var lx2 = W - PAD.R - 4;
  DRVS.forEach(function(drv, i) {
    var ly = PAD.T + 12 + i * 18;
    ctx.beginPath(); ctx.moveTo(lx2 - 22, ly); ctx.lineTo(lx2 - 6, ly);
    ctx.strokeStyle = TLM.colors[drv]; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = TLM.colors[drv]; ctx.font = '700 9px Oswald,sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(drv, lx2 - 27, ly + 3.5);
  });
}

function tlmFmtVal(v, channel) {
  var rng = TLM_CHANNEL_RANGE[channel];
  if (channel === 'brake') return v > 0.5 ? 'ON' : 'OFF';
  return Math.round(v) + (rng.unit || '');
}

function tlmUpdateStatRow(t) {
  var timeEl = document.getElementById('tlm-s-time');
  if (timeEl) timeEl.textContent = t.toFixed(2) + 's';

  var pA = TLM.data.ANT.length ? tlmInterp(TLM.data.ANT, t) : null;
  var pR = TLM.data.RUS.length ? tlmInterp(TLM.data.RUS, t) : null;

  var antEl = document.getElementById('tlm-s-ANT');
  var rusEl = document.getElementById('tlm-s-RUS');
  var dltEl = document.getElementById('tlm-s-delta');

  if (antEl) antEl.textContent = pA ? tlmFmtVal(pA[TLM.channel], TLM.channel) : '—';
  if (rusEl) rusEl.textContent = pR ? tlmFmtVal(pR[TLM.channel], TLM.channel) : '—';

  if (dltEl && pA && pR && TLM.channel !== 'brake') {
    var delta = pA[TLM.channel] - pR[TLM.channel];
    var sign  = delta >= 0 ? '+' : '';
    dltEl.textContent = sign + Math.round(delta) + (TLM_CHANNEL_RANGE[TLM.channel].unit || '');
    dltEl.style.color = delta > 0 ? '#00D284' : (delta < 0 ? '#E04040' : 'rgba(255,255,255,.7)');
  } else if (dltEl) {
    dltEl.textContent = '—';
    dltEl.style.color = 'rgba(255,255,255,.7)';
  }
}

function tlmLoad() {
  TLM.data    = { ANT: [], RUS: [] };
  TLM.maxTime = 0;
  var loaded  = 0;
  var drivers = ['ANT', 'RUS'];
  drivers.forEach(function(drv) {
    fetch('telemetry_' + drv + '_miami26.json')
      .then(function(r) { return r.json(); })
      .then(function(d) {
        TLM.data[drv] = d;
        if (d.length) {
          var last = d[d.length - 1].time;
          if (last > TLM.maxTime) TLM.maxTime = last;
        }
        loaded++;
        if (loaded === drivers.length) {
          var scrub = document.getElementById('tlm-scrubber');
          if (scrub) scrub.max = Math.round(TLM.maxTime * 10);
          tlmDraw();
        }
      })
      .catch(function() { loaded++; if (loaded === drivers.length) tlmDraw(); });
  });
}

function tlmSelectChannel(ch, btn) {
  TLM.channel = ch;
  document.querySelectorAll('.tlm-ch-btn').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  var cap = document.getElementById('tlm-caption');
  if (cap) cap.textContent = 'Fig 02 — Teammate fastest lap comparison \xb7 Miami 2026 \xb7 ' + TLM_CHANNEL_RANGE[ch].label + ' channel. Green = ANT faster \xb7 Red = RUS faster. Hover or scrub to explore.';
  tlmDraw();
}

function tlmScrub(val) {
  if (!TLM.maxTime) return;
  var scrub  = document.getElementById('tlm-scrubber');
  var maxVal = scrub ? parseInt(scrub.max) : 1000;
  TLM.scrubT = (val / maxVal) * TLM.maxTime;
  tlmUpdateStatRow(TLM.scrubT);
  tlmDraw();
}

function tlmInit() {
  TLM.canvas = document.getElementById('tlm-canvas');
  if (!TLM.canvas) return;
  TLM.ctx = TLM.canvas.getContext('2d');
  var stage = document.getElementById('tlm-stage');
  if (stage) { TLM.canvas.width = stage.offsetWidth; TLM.canvas.height = 240; }

  TLM.canvas.addEventListener('mousemove', function(e) {
    var rect   = TLM.canvas.getBoundingClientRect();
    var scaleX = TLM.canvas.width / rect.width;
    var mx     = (e.clientX - rect.left) * scaleX;
    var PAD    = TLM.PAD;
    var t      = ((mx - PAD.L) / (TLM.canvas.width - PAD.L - PAD.R)) * TLM.maxTime;
    t = Math.max(0, Math.min(TLM.maxTime, t));
    TLM.hoverT = t;

    var stageEl = document.getElementById('tlm-stage');
    var tt      = document.getElementById('tlm-tooltip');
    if (tt && stageEl && TLM.maxTime > 0) {
      var pA  = TLM.data.ANT.length ? tlmInterp(TLM.data.ANT, t) : null;
      var pR  = TLM.data.RUS.length ? tlmInterp(TLM.data.RUS, t) : null;
      var rng = TLM_CHANNEL_RANGE[TLM.channel];
      var antTxt = pA ? tlmFmtVal(pA[TLM.channel], TLM.channel) : '—';
      var rusTxt = pR ? tlmFmtVal(pR[TLM.channel], TLM.channel) : '—';
      var deltaLine = '';
      if (pA && pR && TLM.channel !== 'brake') {
        var dv    = pA[TLM.channel] - pR[TLM.channel];
        var dSign = dv >= 0 ? '+' : '';
        var dCol  = dv > 0 ? '#00D284' : (dv < 0 ? '#E04040' : '#aaa');
        deltaLine = '<br><span style="color:' + dCol + '">Δ ' + dSign + Math.round(dv) + (rng.unit||'') + '</span>';
      }
      tt.innerHTML  = t.toFixed(2) + 's'
        + '<br><span style="color:' + TLM.colors.ANT + '">ANT</span> ' + antTxt
        + '<br><span style="color:' + TLM.colors.RUS + '">RUS</span> ' + rusTxt
        + deltaLine;
      var sr = stageEl.getBoundingClientRect();
      tt.style.left    = (e.clientX - sr.left + 14) + 'px';
      tt.style.top     = (e.clientY - sr.top  - 12) + 'px';
      tt.style.opacity = '1';
    }
    tlmUpdateStatRow(t);
    tlmDraw();
  });

  TLM.canvas.addEventListener('mouseleave', function() {
    TLM.hoverT = null;
    var tt = document.getElementById('tlm-tooltip');
    if (tt) tt.style.opacity = '0';
    tlmDraw();
  });

  window.addEventListener('resize', function() {
    var stageEl = document.getElementById('tlm-stage');
    if (!stageEl || !TLM.canvas) return;
    TLM.canvas.width = stageEl.offsetWidth;
    tlmDraw();
  });

  tlmLoad();
}


// ── MLB BATTED BALL ANALYTICS ─────────────────────────────────────────────────

var mlbInited = false;

var MLB_PLAYERS = {
  harper: { label:'Bryce Harper',  abbr:'HARPER', file:'harper_batted_balls.json',  color:'#E81828' },
  cruz:   { label:'Oneil Cruz',    abbr:'CRUZ',   file:'OCruz_batted_balls.json',   color:'#FDB827' },
  wood:   { label:'James Wood',    abbr:'WOOD',   file:'JWood_batted_balls.json',   color:'#AB0003' },
  walker: { label:'Jordan Walker', abbr:'WALKER', file:'walker_batted_balls.json',  color:'#C41E3A' },
  marsh:  { label:'Brandon Marsh', abbr:'MARSH',  file:'marsh_batted_balls.json',   color:'#E81828' },
  kwan:   { label:'Steven Kwan',   abbr:'KWAN',   file:'kwan_batted_balls.json',    color:'#E31937' },
};

var MLB_BB_LABELS = { ground_ball:'GB', line_drive:'LD', fly_ball:'FB', popup:'PU' };

var MLB = {
  scatter: null, sCtx: null,
  vector:  null, vCtx: null,
  player:  'harper',
  data:    [], filtered: [],
  selectedIdx: null, hoverIdx: null,
  activePitch: null, activeBB: null,
  allPitch: [], allBB: [],
  PAD: { L:52, R:18, T:22, B:46 },
  X_MIN:55, X_MAX:105, Y_MIN:30, Y_MAX:122,
};

// ── coordinate helpers ──

function mlbSX(v) {
  var c = MLB.scatter, P = MLB.PAD;
  return P.L + (v - MLB.X_MIN) / (MLB.X_MAX - MLB.X_MIN) * (c.width - P.L - P.R);
}
function mlbSY(v) {
  var c = MLB.scatter, P = MLB.PAD;
  return c.height - P.B - (v - MLB.Y_MIN) / (MLB.Y_MAX - MLB.Y_MIN) * (c.height - P.T - P.B);
}

// ── filter & draw ──

function mlbApplyFilter() {
  MLB.filtered = MLB.data.filter(function(row) {
    var ok1 = !MLB.activePitch || MLB.activePitch[row.pitch_type];
    var ok2 = !MLB.activeBB    || MLB.activeBB[row.bb_type];
    return ok1 && ok2;
  });
  MLB.selectedIdx = null;
  MLB.hoverIdx    = null;
  mlbUpdateStatRow(null);
  mlbDrawScatter();
  mlbDrawVector(null, null);
}

function mlbDrawScatter() {
  var canvas = MLB.scatter, ctx = MLB.sCtx;
  if (!ctx || !canvas || !canvas.width) return;
  var W = canvas.width, H = canvas.height, P = MLB.PAD;
  var chartW = W - P.L - P.R, chartH = H - P.T - P.B;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#050A12'; ctx.fillRect(0, 0, W, H);

  // Hard contact zone tint (EV ≥ 95)
  var hardY = mlbSY(95);
  ctx.fillStyle = 'rgba(196,30,58,.04)';
  ctx.fillRect(P.L, P.T, chartW, hardY - P.T);

  // Grid – X (pitch speed)
  [60, 70, 80, 90, 100].forEach(function(v) {
    var x = mlbSX(v);
    ctx.strokeStyle = '#090F1C'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, P.T); ctx.lineTo(x, H - P.B); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    ctx.font = '8px "Roboto Mono",monospace'; ctx.textAlign = 'center';
    ctx.fillText(v, x, H - P.B + 14);
  });
  // Grid – Y (exit velo)
  [50, 75, 100].forEach(function(v) {
    var y = mlbSY(v);
    ctx.strokeStyle = '#090F1C'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(P.L, y); ctx.lineTo(W - P.R, y); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    ctx.font = '8px "Roboto Mono",monospace'; ctx.textAlign = 'right';
    ctx.fillText(v, P.L - 5, y + 3);
  });

  // Hard-contact label
  ctx.fillStyle = 'rgba(196,30,58,.22)';
  ctx.font = '7px "Roboto Mono",monospace'; ctx.textAlign = 'right';
  ctx.fillText('HARD CONTACT  95+ mph', W - P.R - 3, hardY - 4);

  // Axis labels
  ctx.fillStyle = 'rgba(255,255,255,.16)';
  ctx.font = '7px "Roboto Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText('PITCH SPEED (mph)', W / 2, H - 6);
  ctx.save(); ctx.translate(11, H / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillText('EXIT VELOCITY (mph)', 0, 0); ctx.restore();

  var playerColor = MLB_PLAYERS[MLB.player].color;

  // Regular points (batch draw for performance)
  ctx.fillStyle = 'rgba(12,35,64,.82)';
  MLB.filtered.forEach(function(row, i) {
    if (i === MLB.selectedIdx) return;
    ctx.beginPath();
    ctx.arc(mlbSX(row.release_speed), mlbSY(row.launch_speed), i === MLB.hoverIdx ? 5.5 : 4.5, 0, Math.PI * 2);
    if (i === MLB.hoverIdx) {
      ctx.fillStyle = 'rgba(12,35,64,.95)'; ctx.fill();
      ctx.strokeStyle = 'rgba(196,30,58,.55)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = 'rgba(12,35,64,.82)';
    } else {
      ctx.fill();
    }
  });

  // Selected point
  if (MLB.selectedIdx !== null) {
    var r = MLB.filtered[MLB.selectedIdx];
    if (r) {
      var sx = mlbSX(r.release_speed), sy = mlbSY(r.launch_speed);
      // Glow ring
      ctx.beginPath(); ctx.arc(sx, sy, 10, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(196,30,58,.13)'; ctx.fill();
      // Dot
      ctx.beginPath(); ctx.arc(sx, sy, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = playerColor; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }
}

function mlbDrawVector(angle, speed) {
  var canvas = MLB.vector, ctx = MLB.vCtx;
  if (!ctx || !canvas || !canvas.width) return;
  var W = canvas.width, H = canvas.height;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#050A12'; ctx.fillRect(0, 0, W, H);

  // Origin: left-ish, 68% down
  var ox = W * 0.15, oy = H * 0.68;
  var maxLen = Math.min(W * 0.76, H * 0.72);

  // Zone wedge fills (canvas: y increases downward, so negate angles)
  var zones = [
    { from:0,  to:10, color:'rgba(255,200,50,.07)',  lA:5  },
    { from:10, to:25, color:'rgba(50,200,100,.07)',  lA:17 },
    { from:25, to:50, color:'rgba(50,150,255,.07)',  lA:37 },
    { from:50, to:85, color:'rgba(200,100,255,.05)', lA:63 },
  ];
  zones.forEach(function(z) {
    var a1 = -(z.from * Math.PI / 180);
    var a2 = -(z.to   * Math.PI / 180);
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.arc(ox, oy, maxLen, a1, a2, true);
    ctx.closePath();
    ctx.fillStyle = z.color; ctx.fill();
    // Zone label
    var mid = ((z.from + z.to) / 2) * Math.PI / 180;
    var lx = ox + Math.cos(mid) * maxLen * 0.76;
    var ly = oy - Math.sin(mid) * maxLen * 0.76;
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    ctx.font = '7px "Roboto Mono",monospace'; ctx.textAlign = 'center';
    var zLabels = ['GB','LD','FB','PU'];
    ctx.fillText(zLabels[zones.indexOf(z)], lx, ly);
  });

  // Boundary dashes at 10°, 25°, 50°
  [10, 25, 50].forEach(function(a) {
    var aR = a * Math.PI / 180;
    ctx.strokeStyle = 'rgba(255,255,255,.09)'; ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + Math.cos(aR) * maxLen, oy - Math.sin(aR) * maxLen);
    ctx.stroke(); ctx.setLineDash([]);
    // Angle tick label
    var lx = ox + Math.cos(aR) * (maxLen + 13);
    var ly = oy - Math.sin(aR) * (maxLen + 13);
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    ctx.font = '7px "Roboto Mono",monospace'; ctx.textAlign = 'center';
    ctx.fillText(a + '\xb0', lx, ly);
  });

  // Ground line
  ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 1.5; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(ox - W * 0.07, oy); ctx.lineTo(W * 0.97, oy); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.18)';
  ctx.font = '7px "Roboto Mono",monospace'; ctx.textAlign = 'left';
  ctx.fillText('0\xb0', W * 0.96, oy - 4);

  // Origin dot
  ctx.beginPath(); ctx.arc(ox, oy, 3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fill();

  if (angle === null || speed === null) {
    ctx.fillStyle = 'rgba(255,255,255,.09)';
    ctx.font = '9px "Roboto Mono",monospace'; ctx.textAlign = 'center';
    ctx.fillText('click a point', W * 0.56, oy - maxLen * 0.28);
    return;
  }

  // Vector arrow
  var aRad = angle * Math.PI / 180;
  var vecLen = Math.max(0.15, speed / 115) * maxLen;
  var ex = ox + Math.cos(aRad) * vecLen;
  var ey = oy - Math.sin(aRad) * vecLen;

  var col = MLB_PLAYERS[MLB.player].color;

  ctx.shadowColor = col; ctx.shadowBlur = 10;
  ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke();
  ctx.shadowBlur = 0;

  // Arrowhead
  var lineAngle = Math.atan2(ey - oy, ex - ox);
  var hLen = 11, hSpread = Math.PI / 6;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - hLen * Math.cos(lineAngle - hSpread), ey - hLen * Math.sin(lineAngle - hSpread));
  ctx.lineTo(ex - hLen * Math.cos(lineAngle + hSpread), ey - hLen * Math.sin(lineAngle + hSpread));
  ctx.closePath(); ctx.fill();

  // Info labels (top-right corner of canvas)
  var zLabel = angle < 0   ? 'BELOW GROUND' :
               angle < 10  ? 'GROUND BALL' :
               angle < 25  ? 'LINE DRIVE' :
               angle < 50  ? 'FLY BALL' : 'POPUP';
  ctx.fillStyle = col;
  ctx.font = '700 15px "Oswald",sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(angle.toFixed(1) + '\xb0', W * 0.56, H * 0.16);
  ctx.fillStyle = 'rgba(255,255,255,.38)';
  ctx.font = '8px "Roboto Mono",monospace';
  ctx.fillText(speed.toFixed(1) + ' mph EV', W * 0.56, H * 0.16 + 17);
  ctx.fillStyle = 'rgba(255,255,255,.18)';
  ctx.font = '7px "Roboto Mono",monospace';
  ctx.fillText(zLabel, W * 0.56, H * 0.16 + 30);
}

function mlbUpdateStatRow(row) {
  var els = {
    ev: document.getElementById('mlb-s-ev'),
    la: document.getElementById('mlb-s-la'),
    pt: document.getElementById('mlb-s-pt'),
    ps: document.getElementById('mlb-s-ps'),
    bb: document.getElementById('mlb-s-bb'),
  };
  if (!row) {
    Object.keys(els).forEach(function(k) { if (els[k]) { els[k].textContent = '—'; els[k].classList.remove('ev-hard'); }});
    return;
  }
  if (els.ev) {
    els.ev.textContent = row.launch_speed.toFixed(1) + ' mph';
    els.ev.classList.toggle('ev-hard', row.launch_speed >= 95);
  }
  if (els.la) els.la.textContent = row.launch_angle.toFixed(1) + '\xb0';
  if (els.pt) els.pt.textContent = row.pitch_type || '—';
  if (els.ps) els.ps.textContent = row.release_speed.toFixed(1) + ' mph';
  if (els.bb) els.bb.textContent = MLB_BB_LABELS[row.bb_type] || row.bb_type || '—';
}

function mlbBuildFilters() {
  var pc = document.getElementById('mlb-pitch-filters');
  var bc = document.getElementById('mlb-bb-filters');
  if (!pc || !bc) return;
  pc.innerHTML = ''; bc.innerHTML = '';

  // init active sets as plain objects for IE compat
  MLB.activePitch = {};
  MLB.activeBB    = {};

  MLB.allPitch.forEach(function(pt) {
    MLB.activePitch[pt] = true;
    var btn = document.createElement('button');
    btn.className = 'mlb-pill active';
    btn.textContent = pt;
    btn.onclick = (function(p, b) { return function() { mlbTogglePitch(p, b); }; })(pt, btn);
    pc.appendChild(btn);
  });

  MLB.allBB.forEach(function(bb) {
    MLB.activeBB[bb] = true;
    var btn = document.createElement('button');
    btn.className = 'mlb-pill active';
    btn.textContent = MLB_BB_LABELS[bb] || bb;
    btn.onclick = (function(b, el) { return function() { mlbToggleBB(b, el); }; })(bb, btn);
    bc.appendChild(btn);
  });
}

function mlbTogglePitch(type, btn) {
  var active = MLB.activePitch;
  if (active[type]) {
    var count = Object.keys(active).filter(function(k) { return active[k]; }).length;
    if (count <= 1) return; // keep at least one
    active[type] = false; btn.classList.remove('active');
  } else {
    active[type] = true; btn.classList.add('active');
  }
  MLB.selectedIdx = null; mlbApplyFilter();
}

function mlbToggleBB(type, btn) {
  var active = MLB.activeBB;
  if (active[type]) {
    var count = Object.keys(active).filter(function(k) { return active[k]; }).length;
    if (count <= 1) return;
    active[type] = false; btn.classList.remove('active');
  } else {
    active[type] = true; btn.classList.add('active');
  }
  MLB.selectedIdx = null; mlbApplyFilter();
}

function mlbSelectPlayer(key, btn) {
  if (!MLB_PLAYERS[key]) return;
  MLB.player = key;
  document.querySelectorAll('.mlb-player-btn').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  mlbLoad(key);
}

function mlbLoad(key) {
  var cfg = MLB_PLAYERS[key]; if (!cfg) return;
  MLB.data = []; MLB.filtered = [];
  MLB.selectedIdx = null; MLB.hoverIdx = null;
  MLB.activePitch = null; MLB.activeBB = null;

  var pc = document.getElementById('mlb-pitch-filters');
  var bc = document.getElementById('mlb-bb-filters');
  if (pc) pc.innerHTML = '<span style="font-family:\'Roboto Mono\',monospace;font-size:.48rem;color:rgba(255,255,255,.18);">loading…</span>';
  if (bc) bc.innerHTML = '';
  mlbDrawScatter(); mlbDrawVector(null, null);

  function processMLBData(raw) {
    MLB.data = (Array.isArray(raw) ? raw : []).map(function(row) {
      return {
        pitch_type:    String(row.pitch_type   || '??'),
        release_speed: +(row.release_speed || 0),
        launch_speed:  +(row.launch_speed  || 0),
        launch_angle:  +(row.launch_angle  || 0),
        bb_type:       String(row.bb_type   || '??'),
      };
    }).filter(function(row) {
      return row.launch_speed > 0;
    });
    var pitchSet = {}, bbSet = {};
    MLB.data.forEach(function(row) { pitchSet[row.pitch_type] = true; bbSet[row.bb_type] = true; });
    MLB.allPitch = Object.keys(pitchSet).sort();
    MLB.allBB    = Object.keys(bbSet).sort();
    mlbBuildFilters();
    mlbApplyFilter();
  }

  // Use inline data bundle first (avoids fetch/CORS issues on file:// or local servers)
  var inline = window.MLB_INLINE_DATA && window.MLB_INLINE_DATA[key];
  if (inline) { processMLBData(inline); return; }

  fetch(cfg.file)
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(processMLBData)
    .catch(function(err) {
      console.warn('MLB load error:', err);
      if (pc) pc.innerHTML = '<span style="font-family:\'Roboto Mono\',monospace;font-size:.48rem;color:rgba(255,80,80,.5);">data file not found</span>';
    });
}

function mlbInit() {
  MLB.scatter = document.getElementById('mlb-scatter-canvas');
  MLB.vector  = document.getElementById('mlb-vector-canvas');
  if (!MLB.scatter || !MLB.vector) return;
  MLB.sCtx = MLB.scatter.getContext('2d');
  MLB.vCtx  = MLB.vector.getContext('2d');

  var scStage  = document.getElementById('mlb-scatter-stage');
  var vecStage = document.getElementById('mlb-vector-stage');
  if (scStage)  { MLB.scatter.width = scStage.offsetWidth;  MLB.scatter.height = 320; }
  if (vecStage) { MLB.vector.width  = vecStage.offsetWidth; MLB.vector.height  = 320; }

  // Hover on scatter
  MLB.scatter.addEventListener('mousemove', function(e) {
    var rect = MLB.scatter.getBoundingClientRect();
    var sc   = MLB.scatter.width / rect.width;
    var mx   = (e.clientX - rect.left) * sc;
    var my   = (e.clientY - rect.top)  * sc;
    var best = -1, bestD = 13 * sc;

    MLB.filtered.forEach(function(row, i) {
      var dx = mx - mlbSX(row.release_speed);
      var dy = my - mlbSY(row.launch_speed);
      var d  = Math.sqrt(dx*dx + dy*dy);
      if (d < bestD) { bestD = d; best = i; }
    });

    var changed = MLB.hoverIdx !== (best >= 0 ? best : null);
    MLB.hoverIdx = best >= 0 ? best : null;
    MLB.scatter.style.cursor = best >= 0 ? 'pointer' : 'crosshair';

    var tt = document.getElementById('mlb-tooltip');
    if (tt) {
      if (best >= 0) {
        var row = MLB.filtered[best];
        tt.innerHTML =
          '<span style="color:rgba(255,255,255,.4);letter-spacing:.1em;">' + row.pitch_type + '</span><br>' +
          'Pitch <b>' + row.release_speed.toFixed(1) + '</b> mph<br>' +
          'Exit  <b>' + row.launch_speed.toFixed(1) + '</b> mph<br>' +
          'Angle <b>' + row.launch_angle.toFixed(1) + '</b>\xb0<br>' +
          '<span style="color:rgba(255,255,255,.3);">' + (MLB_BB_LABELS[row.bb_type] || row.bb_type) + '</span>';
        var sr = document.getElementById('mlb-scatter-stage').getBoundingClientRect();
        tt.style.left = (e.clientX - sr.left + 14) + 'px';
        tt.style.top  = (e.clientY - sr.top  - 12) + 'px';
        tt.style.opacity = '1';
      } else { tt.style.opacity = '0'; }
    }
    if (changed) mlbDrawScatter();
  });

  MLB.scatter.addEventListener('mouseleave', function() {
    MLB.hoverIdx = null;
    var tt = document.getElementById('mlb-tooltip');
    if (tt) tt.style.opacity = '0';
    mlbDrawScatter();
  });

  // Click to select
  MLB.scatter.addEventListener('click', function(e) {
    var rect = MLB.scatter.getBoundingClientRect();
    var sc   = MLB.scatter.width / rect.width;
    var mx   = (e.clientX - rect.left) * sc;
    var my   = (e.clientY - rect.top)  * sc;
    var best = -1, bestD = 15 * sc;

    MLB.filtered.forEach(function(row, i) {
      var dx = mx - mlbSX(row.release_speed);
      var dy = my - mlbSY(row.launch_speed);
      var d  = Math.sqrt(dx*dx + dy*dy);
      if (d < bestD) { bestD = d; best = i; }
    });

    if (best >= 0) {
      MLB.selectedIdx = best;
      var row = MLB.filtered[best];
      mlbUpdateStatRow(row);
      mlbDrawVector(row.launch_angle, row.launch_speed);
      mlbDrawScatter();
    }
  });

  // Resize
  window.addEventListener('resize', function() {
    var ss = document.getElementById('mlb-scatter-stage');
    var vs = document.getElementById('mlb-vector-stage');
    if (ss && MLB.scatter) { MLB.scatter.width = ss.offsetWidth; mlbDrawScatter(); }
    if (vs && MLB.vector) {
      MLB.vector.width = vs.offsetWidth;
      if (MLB.selectedIdx !== null && MLB.filtered[MLB.selectedIdx]) {
        var r = MLB.filtered[MLB.selectedIdx];
        mlbDrawVector(r.launch_angle, r.launch_speed);
      } else { mlbDrawVector(null, null); }
    }
  });

  mlbLoad(MLB.player);
}


// ── OVERLAY HOOK ─────────────────────────────────────────────────────────────────────────

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
    if (!mltInited) {
      mltInited = true;
      setTimeout(function() { mltInit(); }, 400);
    }
    if (!tlmInited) {
      tlmInited = true;
      setTimeout(function() { tlmInit(); }, 550);
    }
  }

  if (name === 'cv') {
    if (!trInited) {
      trInited = true;
      setTimeout(function() { trInit(); }, 400);
    }
  }

  if (name === 'mlb') {
    if (!mlbInited) {
      mlbInited = true;
      setTimeout(function() { mlbInit(); }, 400);
    }
  }
};

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeOverlay();
});
