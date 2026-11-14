// Буквоград — кроссворд из букв. Без зависимостей; Яндекс Игры SDK подключается, если доступен.
(() => {
  const $ = id => document.getElementById(id);
  const L = window.LEVELS;
  const HINT_COST = 30, START_COINS = 60, AD_REWARD = 30, INTER_EVERY = 3;
  let ysdk = null, player = null, vk = null;  // площадка: Яндекс Игры (ysdk) или ВКонтакте (vk = vkBridge)
  const ADS = () => !!(ysdk || vk);
  let S = load() || { lvl: 0, coins: START_COINS, found: [], bonus: [], hints: [], shuffled: null };

  // ---------- сохранение ----------
  function load() { try { return JSON.parse(localStorage.getItem('bukvograd')); } catch (e) { return null; } }
  function save() {
    try { localStorage.setItem('bukvograd', JSON.stringify(S)); } catch (e) {}
    if (player) player.setData({ s: S }).catch(() => {});
    if (vk) vk.send('VKWebAppStorageSet', { key: 's', value: JSON.stringify(S) }).catch(() => {});
  }

  // ---------- звук (WebAudio, без файлов) ----------
  let ac = null, muted = false;
  function beep(f, d = .08, type = 'sine', v = .08) {
    if (muted) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.value = f; g.gain.value = v;
      g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + d);
      o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + d);
    } catch (e) {}
  }
  const chord = () => [523, 659, 784].forEach((f, i) => setTimeout(() => beep(f, .15, 'triangle'), i * 70));

  // ---------- уровень ----------
  let lv, cells, letters, sel = [], dragging = false;
  function cur() { return L[Math.min(S.lvl, L.length - 1)]; }

  function startLevel() {
    lv = cur();
    if (!S.shuffled || S.shuffled.length !== lv.letters.length) S.shuffled = lv.letters.split('');
    letters = S.shuffled;
    $('lvl').textContent = 'Уровень ' + (S.lvl + 1);
    buildGrid(); buildWheel(); updCoins(); layout();
  }

  function buildGrid() {
    const g = $('gridIn'); g.innerHTML = ''; cells = {};
    lv.words.forEach(([w, r, c, d], wi) => {
      for (let i = 0; i < w.length; i++) {
        const rr = d === 'v' ? r + i : r, cc = d === 'h' ? c + i : c, k = rr + ',' + cc;
        if (!cells[k]) { const e = document.createElement('div'); e.className = 'c'; g.appendChild(e); cells[k] = { e, ch: w[i], r: rr, c: cc, words: [] }; }
        cells[k].words.push(wi);
      }
    });
    lv.words.forEach(([w], wi) => { if (S.found.includes(w)) reveal(wi, false); });
    S.hints.forEach(k => cells[k] && openCell(cells[k], 'h'));
  }
  function openCell(cl, cls = 'f') { cl.e.textContent = cl.ch; cl.e.classList.add(cls === 'h' && cl.e.classList.contains('f') ? 'f' : cls); }
  function reveal(wi, anim = true) {
    const [w, r, c, d] = lv.words[wi];
    for (let i = 0; i < w.length; i++) {
      const cl = cells[(d === 'v' ? r + i : r) + ',' + (d === 'h' ? c + i : c)];
      cl.e.classList.remove('h'); openCell(cl);
      if (anim) setTimeout(() => { cl.e.classList.add('pop'); setTimeout(() => cl.e.classList.remove('pop'), 200); }, i * 60);
    }
  }

  // ---------- колесо букв ----------
  let wheelR = 120, tile = 56, centers = [];
  function buildWheel() {
    const box = $('wheelBox');
    box.querySelectorAll('.l,.btn').forEach(e => e.remove());
    letters.forEach((ch, i) => { const e = document.createElement('div'); e.className = 'l'; e.textContent = ch; e.dataset.i = i; box.appendChild(e); });
    addBtn('🔀', '', 'shuffle', shuffle);
    addBtn('💡', HINT_COST, 'hint', hint);
    addBtn('⭐', '', 'bonusBtn', showBonus);
    addBtn('🎬', '+' + AD_REWARD, 'adBtn', rewardAd);
  }
  function addBtn(icon, sub, id, fn) {
    const b = document.createElement('button'); b.className = 'btn'; b.id = id;
    b.innerHTML = icon + (sub !== '' ? '<small>' + sub + '</small>' : '');
    b.addEventListener('pointerdown', e => e.stopPropagation());
    b.onclick = fn; $('wheelBox').appendChild(b);
  }

  function layout() {
    const W = innerWidth, H = innerHeight;
    // колесо
    const size = Math.min(W - 40, H * .36, 330);
    wheelR = size / 2; tile = Math.max(40, Math.min(64, size / (letters.length > 6 ? 4.2 : 3.6)));
    const box = $('wheelBox'); box.style.width = box.style.height = size + 'px';
    $('lines').setAttribute('viewBox', `0 0 ${size} ${size}`);
    centers = [];
    box.querySelectorAll('.l').forEach((e, i) => {
      const a = -Math.PI / 2 + i * 2 * Math.PI / letters.length, rr = wheelR - tile / 2 - 8;
      const x = wheelR + rr * Math.cos(a), y = wheelR + rr * Math.sin(a);
      centers[i] = [x, y];
      Object.assign(e.style, { width: tile + 'px', height: tile + 'px', left: x - tile / 2 + 'px', top: y - tile / 2 + 'px', fontSize: tile * .55 + 'px' });
    });
    const bp = { shuffle: [-30, size - 40], hint: [size - 22, size - 40], bonusBtn: [-30, -6], adBtn: [size - 22, -6] };
    for (const id in bp) { const b = $(id); if (b) { b.style.left = bp[id][0] + 'px'; b.style.top = bp[id][1] + 'px'; } }
    $('adBtn').style.display = ADS() ? 'flex' : 'none';
    // сетка
    const avH = $('grid').clientHeight - 8, avW = Math.min(W, 560) - 16;
    const cs = Math.floor(Math.min(avW / lv.cols, avH / lv.rows, 52)), gap = Math.max(2, cs * .08);
    const gi = $('gridIn'); gi.style.width = lv.cols * cs + 'px'; gi.style.height = lv.rows * cs + 'px';
    for (const k in cells) {
      const cl = cells[k];
      Object.assign(cl.e.style, { left: cl.c * cs + 'px', top: cl.r * cs + 'px', width: cs - gap + 'px', height: cs - gap + 'px', fontSize: cs * .6 + 'px' });
    }
  }

  // ---------- ввод (мышь/палец) ----------
  function hit(ev) {
    const r = $('wheelBox').getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    for (let i = 0; i < centers.length; i++) { const [cx, cy] = centers[i]; if ((x - cx) ** 2 + (y - cy) ** 2 < (tile * .55) ** 2) return i; }
    return -1;
  }
  function drawSel(px, py) {
    const pts = sel.map(i => centers[i]); if (px != null) pts.push([px, py]);
    $('lines').innerHTML = pts.length > 1 ? `<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="#ffb703" stroke-width="${tile * .18}" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>` : '';
    document.querySelectorAll('.l').forEach(e => e.classList.toggle('s', sel.includes(+e.dataset.i)));
    const w = sel.map(i => letters[i]).join('');
    $('word').className = ''; $('word').innerHTML = w ? `<span>${w}</span>` : '';
  }
  $('wheelBox').addEventListener('pointerdown', e => { const i = hit(e); if (i < 0) return; dragging = true; sel = [i]; beep(440 + i * 40); drawSel(); });
  addEventListener('pointermove', e => {
    if (!dragging) return;
    const i = hit(e);
    if (i >= 0) {
      if (sel.length > 1 && i === sel[sel.length - 2]) sel.pop();
      else if (!sel.includes(i)) { sel.push(i); beep(440 + sel.length * 50); }
    }
    const r = $('wheelBox').getBoundingClientRect(); drawSel(e.clientX - r.left, e.clientY - r.top);
  });
  addEventListener('pointerup', () => { if (!dragging) return; dragging = false; submit(sel.map(i => letters[i]).join('')); sel = []; drawSel(); });

  function flash(cls, w) { $('word').innerHTML = `<span>${w}</span>`; $('word').className = cls; setTimeout(() => { if (!dragging) { $('word').innerHTML = ''; $('word').className = ''; } }, 700); }
  function toast(t) { const e = $('toast'); e.textContent = t; e.classList.add('on'); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove('on'), 1500); }

  function submit(w) {
    if (w.length < 3) return;
    const wi = lv.words.findIndex(x => x[0] === w);
    if (wi >= 0) {
      if (S.found.includes(w)) return flash('dup', w);
      S.found.push(w); reveal(wi); chord(); save();
      if (lv.words.every(x => S.found.includes(x[0]))) setTimeout(win, 650);
      return;
    }
    if (lv.bonus.includes(w)) {
      if (S.bonus.includes(w)) return flash('dup', w);
      S.bonus.push(w); S.coins += 2; updCoins(); save(); flash('bonus', w); beep(880, .12, 'triangle'); toast('Бонусное слово! +2 монеты');
      return;
    }
    flash('bad', w); beep(160, .15, 'square', .04);
  }

  function updCoins() { $('coins').innerHTML = '<i class="coin"></i>' + S.coins; }
  function shuffle() {
    for (let i = letters.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [letters[i], letters[j]] = [letters[j], letters[i]]; }
    S.shuffled = letters; save(); document.querySelectorAll('.l').forEach((e, i) => e.textContent = letters[i]); beep(330);
  }
  function hint() {
    if (S.coins < HINT_COST) { toast(ADS() ? 'Не хватает монет — посмотрите рекламу 🎬' : 'Не хватает монет — ищите бонусные слова ⭐'); return; }
    const closed = Object.keys(cells).filter(k => !cells[k].e.textContent);
    if (!closed.length) return;
    // открываем букву в слове, где открыто меньше всего
    closed.sort((a, b) => cells[a].words.length - cells[b].words.length);
    const k = closed[Math.floor(Math.random() * Math.min(3, closed.length))];
    S.coins -= HINT_COST; S.hints.push(k); openCell(cells[k], 'h'); updCoins(); beep(700, .1, 'triangle');
    // если подсказка дооткрыла слово целиком — засчитываем
    lv.words.forEach(([w, r, c, d]) => {
      if (S.found.includes(w)) return;
      let all = true;
      for (let i = 0; i < w.length; i++) if (!cells[(d === 'v' ? r + i : r) + ',' + (d === 'h' ? c + i : c)].e.textContent) all = false;
      if (all) S.found.push(w);
    });
    save();
    if (lv.words.every(x => S.found.includes(x[0]))) setTimeout(win, 650);
  }
  function showBonus() {
    $('infoT').textContent = 'Бонусные слова';
    const total = lv.bonus.length;
    $('infoB').innerHTML = `<p>Найдено ${S.bonus.length} из ${total}. За каждое — 2 монеты.</p><div id="bonusList">${S.bonus.join(', ') || 'Пока ни одного. Составляйте слова, которых нет в кроссворде!'}</div>`;
    $('info').classList.add('on');
  }

  // ---------- победа и реклама ----------
  let reward = 0;
  function win() {
    reward = 10 + lv.words.length * 2; S.coins += reward; updCoins(); save(); chord();
    $('winTxt').textContent = `Уровень ${S.lvl + 1} пройден. +${reward} монет`;
    $('dbl').style.display = ADS() ? 'inline-block' : 'none';
    $('win').classList.add('on');
    if (ysdk) ysdk.features?.GameplayAPI?.stop?.();
  }
  $('next').onclick = () => {
    $('win').classList.remove('on');
    const done = S.lvl;
    S.lvl = Math.min(S.lvl + 1, L.length - 1); S.found = []; S.bonus = []; S.hints = []; S.shuffled = null; save();
    if (done + 1 >= L.length) toast('Вы прошли все уровни! Новые скоро 🙂');
    const go = () => { startLevel(); if (ysdk) ysdk.features?.GameplayAPI?.start?.(); };
    if (ADS() && (done + 1) % INTER_EVERY === 0) interstitial(go); else go();
  };
  $('dbl').onclick = () => rewardAd(() => { S.coins += reward; updCoins(); save(); toast('+' + reward + ' монет'); $('dbl').style.display = 'none'; });

  function interstitial(after) {
    if (ysdk) return ysdk.adv.showFullscreenAdv({ callbacks: { onOpen: () => { muted = true; }, onClose: () => { muted = false; after(); }, onError: () => { muted = false; after(); } } });
    muted = true;
    vk.send('VKWebAppShowNativeAds', { ad_format: 'interstitial' }).catch(() => {}).finally(() => { muted = false; after(); });
  }
  function rewardAd(onReward) {
    if (!ADS()) return;
    const fn = typeof onReward === 'function' ? onReward : () => { S.coins += AD_REWARD; updCoins(); save(); toast('+' + AD_REWARD + ' монет'); };
    const fail = () => { muted = false; toast('Реклама сейчас недоступна'); };
    if (ysdk) return ysdk.adv.showRewardedVideo({ callbacks: {
      onOpen: () => { muted = true; }, onRewarded: fn, onClose: () => { muted = false; }, onError: fail } });
    muted = true;
    vk.send('VKWebAppShowNativeAds', { ad_format: 'reward' })
      .then(r => { muted = false; if (r && r.result) fn(); else fail(); }).catch(fail);
  }

  // ---------- правила и авторство ----------
  function showAbout() {
    $('infoT').textContent = 'Как играть';
    $('infoB').innerHTML = '<p style="text-align:left">Проведите пальцем по буквам, чтобы составить слово. Отгадайте все слова кроссворда, чтобы пройти уровень.<br><br>⭐ Слова, которых нет в кроссворде, — бонусные: +2 монеты.<br>💡 Подсказка открывает букву.<br>🔀 Перемешать буквы.</p>' +
      '<p style="font-size:11px;color:#999;text-align:left">Словари: FrequencyWords © Hermit Dave (CC BY-SA 4.0), OpenCorpora / pymorphy (CC BY-SA 3.0).</p>';
    $('info').classList.add('on');
  }
  $('lvl').onclick = showAbout;
  if (!localStorage.getItem('bukvograd')) setTimeout(showAbout, 400);

  // ---------- запуск ----------
  addEventListener('resize', () => lv && layout());
  document.addEventListener('visibilitychange', () => { muted = document.hidden; });
  document.addEventListener('contextmenu', e => e.preventDefault());

  let booted = false;
  // ежедневный бонус: 20 монет, +10 за каждый день подряд (до 70)
  function daily() {
    const today = new Date().toISOString().slice(0, 10);
    if (S.day === today) return;
    const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    S.streak = S.day === y ? Math.min((S.streak || 0) + 1, 6) : 0;
    S.day = today;
    const bonus = 20 + S.streak * 10;
    S.coins += bonus; updCoins(); save();
    setTimeout(() => toast(`Ежедневный бонус: +${bonus} монет` + (S.streak ? ` (день ${S.streak + 1} подряд)` : '')), 900);
  }
  function boot() { if (booted) return; booted = true; startLevel(); daily(); if (ysdk) { ysdk.features?.LoadingAPI?.ready?.(); ysdk.features?.GameplayAPI?.start?.(); } }
  // ВКонтакте: мини-приложение открывается с параметрами vk_* в адресе
  if (/[?&]vk_app_id=/.test(location.search)) {
    const b = document.createElement('script');
    b.src = 'https://unpkg.com/@vkontakte/vk-bridge@2/dist/browser.min.js';
    b.onload = () => {
      vk = window.vkBridge;
      vk.send('VKWebAppInit').catch(() => {});
      vk.send('VKWebAppStorageGet', { keys: ['s'] })
        .then(r => { const v = r.keys && r.keys[0] && r.keys[0].value; if (v) { const d = JSON.parse(v); if (d.lvl >= S.lvl) S = d; } })
        .catch(() => {}).finally(boot);
    };
    b.onerror = boot;
    setTimeout(boot, 3000);  // мост не ответил (например, вне ВК) — играем без него
    document.head.appendChild(b);
    return;
  }
  const s = document.createElement('script');
  s.src = '/sdk.js'; s.async = true;
  s.onload = () => {
    if (!window.YaGames) return boot();
    YaGames.init().then(sdk => {
      ysdk = sdk;
      return sdk.getPlayer({ scopes: false }).then(p => {
        player = p;
        return p.getData(['s']).then(d => { if (d && d.s && d.s.lvl >= S.lvl) S = d.s; });
      }).catch(() => {});
    }).catch(() => {}).finally(boot);
  };
  s.onerror = boot;
  document.head.appendChild(s);
})();
