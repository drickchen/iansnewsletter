/* 陳恩英文的教室札記：共用設定與排版工具 */
(function (global) {
  'use strict';

  // 六個班級。要改班名、顏色，改這裡就好。
  var CLASSES = [
    { slug: 'monday',    name: '週一班', day: '一', en: 'Monday',    color: '#ad5536' },
    { slug: 'tuesday',   name: '週二班', day: '二', en: 'Tuesday',   color: '#c0773a' },
    { slug: 'wednesday', name: '週三班', day: '三', en: 'Wednesday', color: '#778248' },
    { slug: 'thursday',  name: '週四班', day: '四', en: 'Thursday',  color: '#ad5a63' },
    { slug: 'friday',    name: '週五班', day: '五', en: 'Friday',    color: '#b3872c' },
    { slug: 'saturday',  name: '週六班', day: '六', en: 'Saturday',  color: '#81523d' }
  ];
  var DEMO = { slug: 'demo', name: '示範班', day: '範', en: 'Sample', color: '#ad5536' };

  var SITE = {
    name: '陳恩英文的教室札記',
    studio: '陳恩英文',
    tagline: '每個月底，寫給家長的一封信',
    defaultGreeting: '親愛的家長們，您好：',
    defaultSignature: '陳恩老師'
  };

  function getClass(slug) {
    for (var i = 0; i < CLASSES.length; i++) if (CLASSES[i].slug === slug) return CLASSES[i];
    return slug === 'demo' ? DEMO : null;
  }

  var CN_DIGIT = '〇一二三四五六七八九';
  function cnYear(y) {
    return String(y).split('').map(function (d) { return CN_DIGIT[+d] || d; }).join('');
  }
  function cnNum(n) {
    n = parseInt(n, 10);
    if (isNaN(n)) return '';
    if (n === 10) return '十';
    if (n < 10) return CN_DIGIT[n];
    if (n < 20) return '十' + CN_DIGIT[n - 10];
    var t = Math.floor(n / 10), o = n % 10;
    return CN_DIGIT[t] + '十' + (o ? CN_DIGIT[o] : '');
  }
  function monthCN(ym) {
    var p = String(ym || '').split('-');
    if (!p[0] || !p[1]) return '';
    return cnYear(p[0]) + '年' + cnNum(p[1]) + '月';
  }
  function monthOnlyCN(ym) {
    var p = String(ym || '').split('-');
    return p[1] ? cnNum(p[1]) + '月' : '';
  }
  function dateDot(d) { return String(d || '').replace(/-/g, '.'); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function safeURL(u) {
    u = String(u || '').trim();
    if (/^(javascript|vbscript|data):/i.test(u.replace(/[\s\u0000-\u001f]/g, ''))) return '';
    return u;
  }

  // 行內格式：**粗體**、*斜體*、[文字](網址)
  function inline(raw) {
    var s = esc(raw);
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, t, u) {
      var url = safeURL(u);
      return url ? '<a href="' + url + '" target="_blank" rel="noopener">' + t + '</a>' : t;
    });
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
    return s;
  }

  /*
   * 把老師寫的文字轉成信件段落。
   * 每一行就是一個段落（中文書寫習慣），另外支援：
   *   ## 小標題   > 引言   - 條列   1. 編號   ---（分隔）   ![說明](照片路徑)
   */
  function renderBody(text, opts) {
    opts = opts || {};
    var resolve = opts.resolveImage || function (u) { return u; };
    var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    var out = [], list = null, quote = null, m;

    function flush() {
      if (list) {
        out.push('<' + list.tag + ' class="reveal">' + list.items.map(function (i) {
          return '<li>' + inline(i) + '</li>';
        }).join('') + '</' + list.tag + '>');
        list = null;
      }
      if (quote) {
        out.push('<blockquote class="reveal">' + quote.map(function (q) {
          return '<p>' + inline(q) + '</p>';
        }).join('') + '</blockquote>');
        quote = null;
      }
    }

    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (!t) { flush(); continue; }

      if (/^(-{3,}|\*{3,}|＊{3,}|～{3,}|~{3,})$/.test(t)) { flush(); out.push('<hr class="reveal">'); continue; }

      if ((m = t.match(/^#{1,6}\s*(.+)$/))) { flush(); out.push('<h2 class="reveal">' + inline(m[1]) + '</h2>'); continue; }

      if ((m = t.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/))) {
        flush();
        var src = safeURL(resolve(m[2]));
        var cap = m[1] && m[1] !== '照片說明' ? m[1] : '';
        if (src) {
          out.push('<figure class="reveal"><img src="' + esc(src) + '" alt="' + esc(cap) + '" loading="lazy">' +
            (cap ? '<figcaption>' + esc(cap) + '</figcaption>' : '') + '</figure>');
        }
        continue;
      }

      if ((m = t.match(/^[>＞]\s?(.*)$/))) {
        if (list) flush();
        (quote = quote || []).push(m[1]);
        continue;
      }

      if ((m = t.match(/^[-*•・]\s+(.+)$/))) {
        if (quote || (list && list.tag !== 'ul')) flush();
        list = list || { tag: 'ul', items: [] };
        list.items.push(m[1]);
        continue;
      }

      if ((m = t.match(/^\d{1,2}(?:[.．]\s+|、)(.+)$/))) {
        if (quote || (list && list.tag !== 'ol')) flush();
        list = list || { tag: 'ol', items: [] };
        list.items.push(m[1]);
        continue;
      }

      flush();
      out.push('<p class="reveal">' + inline(t) + '</p>');
    }
    flush();
    return out.join('\n');
  }

  var SPRIG = '<svg viewBox="0 0 160 24" width="160" height="24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round">' +
    '<path d="M10 12 H62"/><path d="M98 12 H150"/>' +
    '<path d="M80 3 C74.5 8 74.5 16 80 21 C85.5 16 85.5 8 80 3Z"/>' +
    '<path d="M80 6 V18" opacity=".6"/>' +
    '<path d="M70 12 C66 8 62 8 60 9 C63 13 66 14 70 12Z" />' +
    '<path d="M90 12 C94 8 98 8 100 9 C97 13 94 14 90 12Z" />' +
    '</svg>';

  function letterHTML(L, cls, opts) {
    L = L || {};
    return '' +
      '<header class="paper-head">' +
        '<p class="paper-brand reveal">' + esc(SITE.name) + '</p>' +
        '<p class="paper-meta reveal"><span>' + esc(monthCN(L.month)) + '</span><i class="dot"></i><span>' + esc(cls.name) + '</span></p>' +
        '<h1 class="paper-title reveal">' + esc(L.title || '（未命名的信）') + '</h1>' +
        '<div class="paper-ornament reveal" aria-hidden="true">' + SPRIG + '</div>' +
      '</header>' +
      (L.greeting ? '<p class="paper-greeting reveal">' + esc(L.greeting) + '</p>' : '') +
      '<div class="paper-body">' + renderBody(L.body, opts) + '</div>' +
      '<footer class="paper-sign reveal">' +
        '<p class="sign-name">' + esc(L.signature || SITE.defaultSignature) + '</p>' +
        (L.date ? '<p class="sign-date">' + esc(dateDot(L.date)) + '</p>' : '') +
      '</footer>';
  }

  var reducedMotion = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 文字漸入：進入畫面的段落依序浮現
  function reveal(container, opts) {
    opts = opts || {};
    var stagger = opts.stagger || 120;
    var els = Array.prototype.slice.call(container.querySelectorAll('.reveal'));
    if (reducedMotion || opts.instant || !('IntersectionObserver' in global)) {
      els.forEach(function (e) { e.style.transitionDelay = '0ms'; e.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      var vis = entries.filter(function (e) { return e.isIntersecting; })
        .sort(function (a, b) { return a.boundingClientRect.top - b.boundingClientRect.top; });
      vis.forEach(function (e, i) {
        e.target.style.transitionDelay = Math.min(i * stagger, 1400) + 'ms';
        e.target.classList.add('in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.08 });
    els.forEach(function (e) { io.observe(e); });
  }

  function sortLetters(letters) {
    return (letters || []).slice().sort(function (a, b) {
      return String(b.month || '').localeCompare(String(a.month || '')) ||
        String(b.date || '').localeCompare(String(a.date || ''));
    });
  }

  global.CE = {
    CLASSES: CLASSES, SITE: SITE, getClass: getClass,
    monthCN: monthCN, monthOnlyCN: monthOnlyCN, cnNum: cnNum, dateDot: dateDot,
    esc: esc, renderBody: renderBody, letterHTML: letterHTML,
    reveal: reveal, reducedMotion: reducedMotion, sortLetters: sortLetters, SPRIG: SPRIG
  };
})(window);
