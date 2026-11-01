/* 寫信桌：撰寫、預覽、透過 GitHub 發佈 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = CE.esc;

  // ---------- 設定 ----------
  function guessRepo() {
    var h = location.hostname, seg = location.pathname.split('/').filter(Boolean)[0];
    if (/\.github\.io$/.test(h)) {
      var owner = h.split('.')[0];
      if (seg && !/\.html$/.test(seg)) return owner + '/' + seg;
      return owner + '/' + h;
    }
    return 'drickchen/iansnewsletter';
  }
  var settings = (function () {
    try { return JSON.parse(localStorage.getItem('ce-settings')) || {}; } catch (e) { return {}; }
  })();
  if (!settings.repo) settings.repo = guessRepo();
  function saveSettings() { localStorage.setItem('ce-settings', JSON.stringify(settings)); }

  var defaults = (function () {
    try { return JSON.parse(localStorage.getItem('ce-defaults')) || {}; } catch (e) { return {}; }
  })();

  var state = {
    slug: localStorage.getItem('ce-last-class') || 'monday',
    files: {},          // slug -> { letters, sha }
    editingId: null,    // 正在編輯的已發佈信件 id
    baseline: '',
    images: {},         // 剛上傳、網站還沒更新的照片：路徑 -> 本機預覽網址
    connected: false
  };
  if (!CE.getClass(state.slug) || state.slug === 'demo') state.slug = 'monday';

  // ---------- GitHub API ----------
  function gh(path, opts) {
    opts = opts || {};
    var headers = { 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (settings.token) headers.Authorization = 'Bearer ' + settings.token;
    if (opts.body) headers['Content-Type'] = 'application/json';
    return fetch('https://api.github.com' + path, {
      method: opts.method || 'GET', headers: headers, body: opts.body, cache: 'no-store'
    }).then(function (res) {
      if (res.ok) return res.status === 204 ? null : res.json();
      return res.json().catch(function () { return {}; }).then(function (j) {
        var err = new Error(j.message || ('HTTP ' + res.status));
        err.status = res.status;
        throw err;
      });
    });
  }
  function toB64(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function fromB64(b64) {
    var bin = atob(String(b64).replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function readFile(path) {
    return gh('/repos/' + settings.repo + '/contents/' + path + '?ref=' + encodeURIComponent(settings.branch))
      .then(function (j) { return { text: fromB64(j.content), sha: j.sha }; })
      .catch(function (e) { if (e.status === 404) return { text: null, sha: null }; throw e; });
  }
  function writeFile(path, b64, sha, message) {
    var payload = { message: message, content: b64, branch: settings.branch };
    if (sha) payload.sha = sha;
    return gh('/repos/' + settings.repo + '/contents/' + path, { method: 'PUT', body: JSON.stringify(payload) });
  }
  function explain(e) {
    if (!e) return '發生了未知的問題。';
    if (e.status === 401) return 'Token 無效或已過期，請到「連線設定」重新貼上。';
    if (e.status === 403) return '這把 Token 沒有寫入權限，請確認 Contents 設為 Read and write。';
    if (e.status === 404) return '找不到網站儲存庫或分支，請確認連線設定。';
    if (e.status === 409) return '網站剛好在更新中，請再按一次發佈。';
    if (e.status === 422) return 'GitHub 拒絕了這次寫入（' + e.message + '）。';
    if (e instanceof TypeError) return '網路連線似乎中斷了，請稍後再試。';
    return e.message || '發生了未知的問題。';
  }

  function connect(silent) {
    if (!settings.token) { setConn(false); return Promise.resolve(false); }
    setConn(null);
    return gh('/repos/' + settings.repo).then(function (r) {
      if (!settings.branch) { settings.branch = r.default_branch; saveSettings(); }
      if (r.permissions && r.permissions.push === false) {
        var err = new Error('no push'); err.status = 403; throw err;
      }
      setConn(true);
      return true;
    }).catch(function (e) {
      setConn(false, explain(e));
      if (!silent) throw e;
      return false;
    });
  }
  function setConn(ok, msg) {
    state.connected = ok === true;
    var el = $('connState');
    el.className = 'conn' + (ok === true ? ' ok' : ok === null ? ' wait' : '');
    el.textContent = ok === true ? '已連線' : ok === null ? '連線中…' : (settings.token ? '連線失敗' : '尚未連線');
    el.title = ok === true ? settings.repo + '（' + settings.branch + '）' : (msg || '');
  }

  // ---------- 班級資料 ----------
  function loadClass(slug, force) {
    if (state.files[slug] && !force) return Promise.resolve(state.files[slug]);
    var p = state.connected
      ? readFile('data/' + slug + '.json').then(function (f) {
          var d = f.text ? JSON.parse(f.text) : { letters: [] };
          return { letters: CE.sortLetters(d.letters), sha: f.sha };
        })
      : fetch('data/' + slug + '.json?t=' + Date.now(), { cache: 'no-store' })
          .then(function (r) { return r.ok ? r.json() : { letters: [] }; })
          .then(function (d) { return { letters: CE.sortLetters(d.letters), sha: null }; })
          .catch(function () { return { letters: [], sha: null }; });
    return p.then(function (f) { state.files[slug] = f; return f; });
  }

  // ---------- 表單 ----------
  var F = {
    month: $('fMonth'), date: $('fDate'), title: $('fTitle'),
    greeting: $('fGreeting'), body: $('fBody'), signature: $('fSignature')
  };
  function today() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function collect() {
    return {
      id: F.month.value,
      month: F.month.value,
      title: F.title.value.trim(),
      greeting: F.greeting.value.trim(),
      body: F.body.value.replace(/\s+$/, ''),
      signature: F.signature.value.trim(),
      date: F.date.value
    };
  }
  function fill(L) {
    F.month.value = L.month || '';
    F.date.value = L.date || '';
    F.title.value = L.title || '';
    F.greeting.value = L.greeting == null ? '' : L.greeting;
    F.body.value = L.body || '';
    F.signature.value = L.signature || '';
    renderPreview();
  }
  // 月底寫、月初才發佈的信，預設算在上個月（每月 10 號以前）
  function defaultMonth() {
    var d = new Date();
    if (d.getDate() <= 10) d.setDate(0);
    return d.getFullYear() + '-' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1);
  }
  function blank() {
    return {
      month: defaultMonth(), date: today(), title: '', body: '',
      greeting: defaults.greeting || CE.SITE.defaultGreeting,
      signature: defaults.signature || CE.SITE.defaultSignature
    };
  }
  function snapshot() { return JSON.stringify(collect()); }
  function isDirty() { return snapshot() !== state.baseline && F.body.value.trim() !== ''; }

  function draftKey() { return 'ce-draft-' + state.slug; }
  function saveDraft() {
    if (!state.ready) return;
    if (snapshot() === state.baseline || (!F.body.value.trim() && !F.title.value.trim())) { localStorage.removeItem(draftKey()); return; }
    localStorage.setItem(draftKey(), JSON.stringify({ letter: collect(), editingId: state.editingId, baseline: state.baseline }));
  }
  function loadDraft() {
    try { return JSON.parse(localStorage.getItem(draftKey())); } catch (e) { return null; }
  }

  function setEditing(id, baselineLetter) {
    state.editingId = id;
    state.baseline = JSON.stringify(baselineLetter ? normalize(baselineLetter) : collect());
    updateEdState();
  }
  function normalize(L) {
    return { id: L.month, month: L.month || '', title: L.title || '', greeting: L.greeting || '', body: (L.body || '').replace(/\s+$/, ''), signature: L.signature || '', date: L.date || '' };
  }
  function updateEdState() {
    var cls = CE.getClass(state.slug);
    var txt = state.editingId
      ? '正在修改已發佈的信・' + cls.name + '・' + CE.monthCN(state.editingId)
      : '新的一封信・' + cls.name;
    $('edState').textContent = txt;
    $('deleteBtn').hidden = !state.editingId;
    $('publishBtn').textContent = state.editingId ? '更新這封信' : '發佈給家長';
    renderList();
  }

  // ---------- 畫面 ----------
  function renderTabs() {
    $('classTabs').innerHTML = CE.CLASSES.map(function (c) {
      return '<button type="button" data-slug="' + c.slug + '" style="--accent:' + c.color + '"' +
        (c.slug === state.slug ? ' aria-current="true"' : '') + '><i>' + c.day + '</i>' + c.name + '</button>';
    }).join('');
  }
  function renderList() {
    var f = state.files[state.slug];
    var cls = CE.getClass(state.slug);
    $('sideTitle').textContent = cls.name + '的信';
    var list = $('letterList');
    if (!f) { list.innerHTML = '<li class="empty">讀取中…</li>'; return; }
    if (!f.letters.length) { list.innerHTML = '<li class="empty">還沒有寄出任何信。</li>'; return; }
    list.innerHTML = f.letters.map(function (L) {
      var cur = L.id === state.editingId;
      return '<li><button type="button" data-id="' + esc(L.id) + '"' + (cur ? ' aria-current="true"' : '') + '>' +
        '<span class="l-month">' + esc(CE.monthCN(L.month)) + '</span>' +
        '<span class="l-title">' + esc(L.title || '（未命名）') + '</span></button></li>';
    }).join('');
  }
  function resolveImage(u) {
    if (state.images[u]) return state.images[u];
    return u;
  }
  var pvTimer = null;
  function renderPreview() {
    clearTimeout(pvTimer);
    pvTimer = setTimeout(function () {
      var pv = $('preview');
      pv.innerHTML = CE.letterHTML(collect(), CE.getClass(state.slug), { resolveImage: resolveImage });
      CE.reveal(pv, { instant: true });
    }, 120);
  }
  function setStatus(html, kind, el) {
    el = el || $('status');
    el.className = 'status' + (kind ? ' ' + kind : '');
    el.innerHTML = html || '';
  }
  function classLink(slug) { return new URL(slug + '/', location.href).href; }

  function switchClass(slug, force) {
    if (slug === state.slug && !force) return;
    saveDraft();
    state.slug = slug;
    localStorage.setItem('ce-last-class', slug);
    document.documentElement.style.setProperty('--accent', CE.getClass(slug).color);
    renderTabs();
    setStatus('');
    var d = loadDraft();
    if (d && d.letter) {
      fill(d.letter);
      state.editingId = d.editingId || null;
      state.baseline = d.baseline || '';
      updateEdState();
      setStatus('已接回上次沒寫完的草稿。', 'soft');
    } else {
      fill(blank());
      setEditing(null);
    }
    renderList();
    loadClass(slug).then(renderList).catch(function (e) {
      $('letterList').innerHTML = '<li class="empty">讀取失敗：' + esc(explain(e)) + '</li>';
    });
  }

  // ---------- 事件 ----------
  $('classTabs').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-slug]');
    if (b) switchClass(b.getAttribute('data-slug'));
  });

  $('letterList').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-id]');
    if (!b) return;
    var id = b.getAttribute('data-id');
    if (id === state.editingId) return;
    if (isDirty() && !confirm('目前寫到一半的內容還沒發佈，確定要換成編輯這封信嗎？')) return;
    var L = state.files[state.slug].letters.filter(function (x) { return x.id === id; })[0];
    if (!L) return;
    fill(L);
    setEditing(L.id, L);
    localStorage.removeItem(draftKey());
    setStatus('');
    if (innerWidth < 1000) $('form').scrollIntoView({ behavior: 'smooth' });
  });

  $('newBtn').addEventListener('click', function () {
    if (isDirty() && !confirm('目前寫到一半的內容還沒發佈，確定要開始寫新的一封嗎？')) return;
    fill(blank());
    setEditing(null);
    localStorage.removeItem(draftKey());
    setStatus('');
    F.title.focus();
  });

  $('copyLink').addEventListener('click', function () {
    var url = classLink(state.slug);
    copyText(url).then(function () {
      setStatus('已複製' + CE.getClass(state.slug).name + '的家長連結：<br><a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(url) + '</a>', 'ok');
    });
  });
  function copyText(t) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t).catch(function () { return fallbackCopy(t); });
    return Promise.resolve(fallbackCopy(t));
  }
  function fallbackCopy(t) {
    var ta = document.createElement('textarea');
    ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  var draftTimer = null;
  $('form').addEventListener('input', function () {
    renderPreview();
    clearTimeout(draftTimer);
    draftTimer = setTimeout(saveDraft, 400);
  });

  // 工具列
  function surround(before, after, placeholder) {
    var ta = F.body, s = ta.selectionStart, e = ta.selectionEnd;
    var sel = ta.value.slice(s, e) || placeholder;
    ta.setRangeText(before + sel + after, s, e, 'end');
    if (!ta.value.slice(s, e).length) {
      ta.selectionStart = s + before.length;
      ta.selectionEnd = s + before.length + sel.length;
    }
    ta.focus();
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function lineStart(prefix, placeholder) {
    var ta = F.body, s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
    var ls = v.lastIndexOf('\n', s - 1) + 1;
    var le = v.indexOf('\n', e); if (le < 0) le = v.length;
    var block = v.slice(ls, le);
    var out = block ? block.split('\n').map(function (l) { return l.trim() ? prefix + l.replace(/^(#{1,6}\s*|[>＞]\s?|[-*•・]\s+)/, '') : l; }).join('\n') : prefix + placeholder;
    ta.setRangeText(out, ls, le, 'select');
    ta.focus();
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function insertBlock(text) {
    var ta = F.body, s = ta.selectionStart, v = ta.value;
    var pre = s > 0 && v[s - 1] !== '\n' ? '\n' : '';
    var post = v[s] && v[s] !== '\n' ? '\n' : '';
    ta.setRangeText(pre + text + post, s, ta.selectionEnd, 'end');
    ta.focus();
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  $('toolbar').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-md]');
    if (!b) return;
    var k = b.getAttribute('data-md');
    if (k === 'bold') surround('**', '**', '重點');
    else if (k === 'h2') lineStart('## ', '小標題');
    else if (k === 'quote') lineStart('> ', '引言');
    else if (k === 'list') lineStart('- ', '項目');
    else if (k === 'hr') insertBlock('---\n');
    else if (k === 'image') {
      if (!state.connected) { setStatus('照片需要先完成「連線設定」才能上傳。', 'err'); openSettings(); return; }
      $('imgInput').click();
    }
  });

  // 照片：縮小後上傳到 images/班級/
  $('imgInput').addEventListener('change', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) return;
    var cls = CE.getClass(state.slug);
    var month = F.month.value || today().slice(0, 7);
    var path = 'images/' + state.slug + '/' + month + '-' + Date.now().toString(36) + '.jpg';
    var caret = F.body.selectionStart;
    setStatus('照片整理中，請稍等…', 'soft');
    downscale(file, 1600, 0.84).then(function (blob) {
      setStatus('照片上傳中…', 'soft');
      return blobToB64(blob).then(function (b64) {
        return writeFile(path, b64, null, '札記照片：' + cls.name + ' ' + month);
      }).then(function () {
        state.images[path] = URL.createObjectURL(blob);
        F.body.selectionStart = F.body.selectionEnd = caret;
        insertBlock('![照片說明](' + path + ')\n');
        setStatus('照片已上傳。可以把「照片說明」改成想寫在照片下方的文字，或直接刪掉不寫。', 'ok');
      });
    }).catch(function (e) { setStatus('照片上傳失敗：' + esc(explain(e)), 'err'); });
  });
  function downscale(file, max, quality) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight, r = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas');
        c.width = Math.round(w * r); c.height = Math.round(h * r);
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error('照片轉檔失敗')); }, 'image/jpeg', quality);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('這個檔案無法讀取，請換一張 JPG 或 PNG 照片')); };
      img.src = url;
    });
  }
  function blobToB64(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result).split(',')[1]); };
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }

  // 在信封裡預覽
  $('previewBtn').addEventListener('click', function () {
    localStorage.setItem('ce-preview', JSON.stringify({ slug: state.slug, letter: collect(), images: state.images }));
    window.open(state.slug + '/?preview', '_blank');
  });

  // 發佈
  $('form').addEventListener('submit', function (e) {
    e.preventDefault();
    publish();
  });
  function validate(L) {
    if (!L.month) return '請選擇這封信的月份。';
    if (!L.title) return '請幫這封信取個標題。';
    if (!L.body.trim()) return '內文還是空的。';
    return '';
  }
  function busy(on) {
    ['publishBtn', 'deleteBtn', 'newBtn'].forEach(function (id) { $(id).disabled = on; });
  }

  function mutate(slug, fn, message) {
    // 讀取最新檔案、修改、寫回；遇到版本衝突會重試一次
    var path = 'data/' + slug + '.json';
    function attempt(n) {
      return readFile(path).then(function (f) {
        var data = f.text ? JSON.parse(f.text) : { class: slug, letters: [] };
        var letters = fn(data.letters || []);
        if (letters === false) return false;
        data.class = slug;
        data.letters = CE.sortLetters(letters);
        data.updated = new Date().toISOString();
        return writeFile(path, toB64(JSON.stringify(data, null, 2) + '\n'), f.sha, message).then(function (r) {
          state.files[slug] = { letters: data.letters, sha: r.content.sha };
          return true;
        });
      }).catch(function (e) {
        if ((e.status === 409 || e.status === 422) && n < 1) return attempt(n + 1);
        throw e;
      });
    }
    return attempt(0);
  }

  function publish() {
    var L = collect();
    var err = validate(L);
    if (err) { setStatus(err, 'err'); return; }
    if (!state.connected) { setStatus('要先完成「連線設定」，信才能寄出。草稿已經存在這台裝置上了。', 'err'); openSettings(); return; }
    var cls = CE.getClass(state.slug), slug = state.slug, editingId = state.editingId;
    var asked = false;
    busy(true);
    setStatus('信件寄送中…', 'soft');
    mutate(slug, function (letters) {
      if (editingId && editingId !== L.id) letters = letters.filter(function (x) { return x.id !== editingId; });
      var clash = letters.some(function (x) { return x.id === L.id; });
      if (clash && editingId !== L.id && !asked) {
        asked = true;
        if (!confirm(cls.name + '已經有一封' + CE.monthCN(L.month) + '的信了，要用這封取代它嗎？')) return false;
      }
      return letters.filter(function (x) { return x.id !== L.id; }).concat([L]);
    }, '札記：' + cls.name + ' ' + L.month + '「' + L.title + '」').then(function (ok) {
      busy(false);
      if (!ok) { setStatus('已取消，信件沒有寄出。', 'soft'); return; }
      defaults.greeting = L.greeting; defaults.signature = L.signature;
      localStorage.setItem('ce-defaults', JSON.stringify(defaults));
      setEditing(L.id, L);
      localStorage.removeItem(draftKey());
      setStatus('寄出了！網站大約一到兩分鐘後會更新。<br>家長連結：<a href="' + esc(classLink(slug)) + '" target="_blank" rel="noopener">' + esc(classLink(slug)) + '</a>' +
        ' <button type="button" class="btn-text" data-copy="' + esc(classLink(slug)) + '">複製</button>', 'ok');
    }).catch(function (e) {
      busy(false);
      setStatus('寄送失敗：' + esc(explain(e)) + '<br>草稿還在，不會不見。', 'err');
    });
  }

  $('status').addEventListener('click', function (e) {
    var b = e.target.closest('[data-copy]');
    if (b) copyText(b.getAttribute('data-copy')).then(function () { b.textContent = '已複製'; });
  });

  $('deleteBtn').addEventListener('click', function () {
    var id = state.editingId;
    if (!id) return;
    var cls = CE.getClass(state.slug), slug = state.slug;
    if (!confirm('確定要刪除' + cls.name + CE.monthCN(id) + '的這封信嗎？家長將看不到它。')) return;
    busy(true);
    setStatus('刪除中…', 'soft');
    mutate(slug, function (letters) {
      return letters.filter(function (x) { return x.id !== id; });
    }, '札記：刪除 ' + cls.name + ' ' + id).then(function () {
      busy(false);
      fill(blank());
      setEditing(null);
      setStatus('已刪除。網站大約一到兩分鐘後會更新。', 'ok');
    }).catch(function (e) {
      busy(false);
      setStatus('刪除失敗：' + esc(explain(e)), 'err');
    });
  });

  // 手機：撰寫／預覽切換
  document.querySelector('.ed-switch').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-view]');
    if (!b) return;
    var v = b.getAttribute('data-view');
    $('panes').setAttribute('data-view', v);
    this.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
    if (v === 'preview') renderPreview();
  });

  // ---------- 連線設定視窗 ----------
  var dlg = $('settingsDlg');
  function openSettings() {
    $('sToken').value = settings.token || '';
    $('sRepo').value = settings.repo || '';
    $('sBranch').value = settings.branch || '';
    $('repoNameHint').textContent = (settings.repo || '').split('/')[1] || 'iansnewsletter';
    setStatus(state.connected ? '目前已連線到 ' + esc(settings.repo) + '（' + esc(settings.branch) + '）。' : '', state.connected ? 'ok' : '', $('sStatus'));
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }
  function closeSettings() { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); }
  $('settingsBtn').addEventListener('click', openSettings);
  $('sCancel').addEventListener('click', closeSettings);
  $('sSave').addEventListener('click', function () {
    var token = $('sToken').value.trim(), repo = $('sRepo').value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$|\/$/g, '');
    if (!token) { setStatus('請貼上 Token。', 'err', $('sStatus')); return; }
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) { setStatus('網站儲存庫的格式應該像「帳號/儲存庫名稱」。', 'err', $('sStatus')); return; }
    settings.token = token; settings.repo = repo; settings.branch = $('sBranch').value.trim();
    saveSettings();
    setStatus('連線中…', 'soft', $('sStatus'));
    connect(false).then(function () {
      saveSettings();
      setStatus('連線成功：' + esc(settings.repo) + '（' + esc(settings.branch) + '）。', 'ok', $('sStatus'));
      state.files = {};
      loadClass(state.slug).then(renderList);
      setTimeout(closeSettings, 900);
    }).catch(function (e) {
      setStatus('連線失敗：' + esc(explain(e)), 'err', $('sStatus'));
    });
  });
  $('sClear').addEventListener('click', function () {
    if (!confirm('要清除這台裝置上儲存的 Token 嗎？清除後需要重新貼上才能發佈。')) return;
    delete settings.token;
    saveSettings();
    $('sToken').value = '';
    setConn(false);
    setStatus('已清除。', 'soft', $('sStatus'));
  });

  window.addEventListener('beforeunload', saveDraft);

  // ---------- 啟動 ----------
  switchClass(state.slug, true);
  state.ready = true;
  connect(true).then(function (ok) {
    if (ok) { state.files = {}; loadClass(state.slug).then(renderList); }
    else if (!settings.token) setStatus('第一次使用嗎？先按右上角的「連線設定」，之後就能直接發佈。沒有連線也可以先寫草稿。', 'soft');
  });
})();
