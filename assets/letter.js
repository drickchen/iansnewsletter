/* 班級頁：信封、拆信動畫、閱讀與往期札記 */
(function () {
  'use strict';
  var body = document.body;
  var slug = body.getAttribute('data-class');
  var root = body.getAttribute('data-root') || './';
  var cls = CE.getClass(slug);
  if (!cls) return;

  document.documentElement.style.setProperty('--accent', cls.color);

  var params = new URLSearchParams(location.search);
  var mode = params.has('preview') ? 'preview' : (params.has('demo') || slug === 'demo' ? 'demo' : 'live');
  var reduced = CE.reducedMotion;
  var esc = CE.esc;

  var app = document.getElementById('app');
  app.innerHTML =
    '<header class="masthead">' +
      '<a class="brand" href="' + root + '">陳恩英文的<b>教室札記</b></a>' +
      '<span class="masthead-right">' +
        '<button type="button" class="sound-toggle" id="soundBtn" aria-pressed="true" aria-label="開信音效：開" title="開信音效">' +
          '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/>' +
            '<path class="wave" d="M15.5 9a4 4 0 0 1 0 6"/><path class="wave" d="M18 6.5a7.5 7.5 0 0 1 0 11"/>' +
            '<path class="mute" d="M16 9.5l5 5M21 9.5l-5 5"/>' +
          '</svg></button>' +
        '<span class="masthead-class"><i></i>' + esc(cls.name) + '</span>' +
      '</span>' +
    '</header>' +
    (mode !== 'live' ? '<div class="mode-ribbon">' +
      (mode === 'preview' ? '預覽模式：這封信還沒發佈，家長看不到' : '示範信：用來感受版面與拆信動畫') +
      '</div>' : '') +
    '<main>' +
      '<section class="stage" id="stage">' +
        '<p class="stage-kicker"><span class="en">Monthly Letter</span><span class="cn" id="stageMonth"></span></p>' +
        '<div class="envelope" id="envelope" role="button" tabindex="0" aria-label="拆開這封信">' +
          '<div class="env-back"></div>' +
          '<div class="env-letter"><span class="env-letter-brand">教室札記</span><span class="env-letter-title" id="envTitle"></span><i class="env-lines"></i></div>' +
          '<div class="env-pocket"><i class="l"></i><i class="r"></i><i class="b"></i></div>' +
          '<div class="env-flapshadow"></div>' +
          '<div class="env-flap"><i class="front"></i><i class="back"></i></div>' +
          '<div class="env-seal"><span>恩</span></div>' +
          '<div class="env-postmark" aria-hidden="true"><b id="pmMonth"></b><span id="pmYear"></span><small>陳恩英文</small></div>' +
        '</div>' +
        '<p class="stage-to">致　' + esc(cls.name) + '的家長們</p>' +
        '<button class="stage-open" id="openBtn" type="button">輕觸信封，拆開這個月的信</button>' +
      '</section>' +
      '<section class="reading" id="reading" hidden>' +
        '<article class="paper" id="paper"></article>' +
        '<nav class="archive" id="archive" aria-label="往期札記"></nav>' +
      '</section>' +
    '</main>' +
    '<footer class="site-foot"><span>陳恩英文</span><i></i><span>討論式小班英文</span></footer>';

  var stage = document.getElementById('stage');
  var envelope = document.getElementById('envelope');
  var openBtn = document.getElementById('openBtn');
  var reading = document.getElementById('reading');
  var paper = document.getElementById('paper');
  var archive = document.getElementById('archive');

  var letters = [];
  var images = {};
  var current = null;
  var opened = false;
  var timers = [];

  // 開信音效：輕觸信封時播放，可在右上角關閉（記在這台裝置上）
  var soundBtn = document.getElementById('soundBtn');
  var soundOn = localStorage.getItem('ce-sound') !== 'off';
  var sfx = null;
  function getSfx() {
    if (!sfx && window.Audio) {
      sfx = new Audio(root + 'assets/open-letter.mp3');
      sfx.preload = 'auto';
      sfx.volume = 0.75;
    }
    return sfx;
  }
  function renderSound() {
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    soundBtn.setAttribute('aria-label', '開信音效：' + (soundOn ? '開' : '關'));
    soundBtn.classList.toggle('is-off', !soundOn);
  }
  function playSfx() {
    if (!soundOn) return;
    var a = getSfx();
    if (!a) return;
    try {
      a.currentTime = 0;
      var p = a.play();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }
  soundBtn.addEventListener('click', function () {
    soundOn = !soundOn;
    localStorage.setItem('ce-sound', soundOn ? 'on' : 'off');
    renderSound();
    if (!soundOn && sfx) sfx.pause();
  });
  renderSound();
  if (soundOn) getSfx();

  function resolveImage(u) {
    if (images[u]) return images[u];
    if (/^(https?:|blob:|\/)/i.test(u)) return u;
    return root + u.replace(/^\.\//, '');
  }

  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  function prepare(L) {
    clearTimers();
    current = L;
    opened = false;
    stage.classList.add('no-anim');
    stage.classList.remove('is-opening', 'is-leaving', 'is-empty');
    void stage.offsetWidth;
    stage.classList.remove('no-anim');
    stage.hidden = false;
    reading.hidden = true;
    reading.classList.remove('is-shown');

    var month = L.month || '';
    document.getElementById('stageMonth').textContent = month ? CE.monthCN(month) + '號' : '';
    document.getElementById('envTitle').textContent = L.title || '';
    document.getElementById('pmMonth').textContent = CE.monthOnlyCN(month);
    document.getElementById('pmYear').textContent = month.split('-')[0] || '';
    openBtn.disabled = false;
    openBtn.textContent = '輕觸信封，拆開這個月的信';
    envelope.setAttribute('aria-label', '拆開「' + (L.title || '') + '」這封信');
    envelope.tabIndex = 0;
  }

  function showEmpty(msg) {
    stage.classList.add('is-empty');
    document.getElementById('stageMonth').textContent = '';
    document.getElementById('pmMonth').textContent = '';
    document.getElementById('pmYear').textContent = '';
    openBtn.textContent = msg;
    openBtn.disabled = true;
    envelope.removeAttribute('role');
    envelope.tabIndex = -1;
  }

  function open() {
    if (opened || !current) return;
    opened = true;
    playSfx();
    if (reduced) { showReading(); return; }
    stage.classList.add('is-opening');
    timers.push(setTimeout(function () { stage.classList.add('is-leaving'); }, 2250));
    timers.push(setTimeout(showReading, 2950));
  }

  function showReading() {
    stage.hidden = true;
    reading.hidden = false;
    paper.innerHTML = CE.letterHTML(current, cls, { resolveImage: resolveImage });
    renderArchive();
    window.scrollTo(0, 0);
    document.title = (current.title ? current.title + '｜' : '') + cls.name + '｜' + CE.SITE.name;
    void reading.offsetWidth;
    reading.classList.add('is-shown');
    setTimeout(function () { CE.reveal(paper); CE.reveal(archive); }, reduced ? 0 : 250);
  }

  function renderArchive() {
    if (letters.length < 2) { archive.innerHTML = ''; return; }
    archive.innerHTML =
      '<h2 class="archive-title reveal"><span>往期札記</span></h2>' +
      '<ol class="archive-list">' + letters.map(function (L, i) {
        var isCur = L === current;
        return '<li class="reveal"><button type="button" data-i="' + i + '"' + (isCur ? ' aria-current="true"' : '') + '>' +
          '<span class="a-month">' + esc(CE.monthCN(L.month)) + '</span>' +
          '<span class="a-title">' + esc(L.title || '') + '</span>' +
          (isCur ? '<span class="a-here">正在閱讀</span>' : '') +
          '</button></li>';
      }).join('') + '</ol>';
  }

  archive.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-i]');
    if (!b) return;
    var L = letters[+b.getAttribute('data-i')];
    if (!L || L === current) return;
    if (history.replaceState) history.replaceState(null, '', location.pathname + location.search + '#' + encodeURIComponent(L.id || L.month));
    prepare(L);
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  });

  envelope.addEventListener('click', open);
  envelope.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
  });
  openBtn.addEventListener('click', open);

  function pick() {
    var h = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (h) for (var i = 0; i < letters.length; i++) if (letters[i].id === h || letters[i].month === h) return letters[i];
    return letters[0];
  }

  function start() {
    letters = CE.sortLetters(letters);
    if (!letters.length) { showEmpty('這個月的信還在路上，月底見'); return; }
    prepare(pick());
  }

  if (mode === 'preview') {
    var p = null;
    try { p = JSON.parse(localStorage.getItem('ce-preview') || 'null'); } catch (e) { p = null; }
    if (p && p.letter) { letters = [p.letter]; images = p.images || {}; }
    start();
  } else {
    var file = mode === 'demo' ? 'demo' : slug;
    fetch(root + 'data/' + file + '.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) { letters = (d && d.letters) || []; start(); })
      .catch(function () { showEmpty('信件暫時取不到，請稍後再試一次'); });
  }
})();
