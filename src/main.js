import './style.css';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { cpp } from '@codemirror/lang-cpp';
import { oneDark } from '@codemirror/theme-one-dark';
import { zipSync, strToU8 } from 'fflate';

const KEY = 'lvgl-workshop.v1';
const NAMES = { label: 'Текст', button: 'Кнопка', slider: 'Слайдер', arc: 'Дуга', switch: 'Переключатель', bar: 'Полоса', obj: 'Блок' };
const DEF = {
  label: { text: 'Текст', w: 200, h: 30, fs: 20, color: '#ffffff' },
  button: { text: 'Кнопка', w: 150, h: 56, fs: 20, color: '#ffffff', bg: '#2f6bff', r: 14 },
  slider: { w: 260, h: 14, v: 40, bg: '#3a3f55', acc: '#2f6bff' },
  arc: { w: 160, h: 160, v: 60, bg: '#3a3f55', acc: '#2f6bff' },
  switch: { w: 70, h: 36, bg: '#3a3f55', acc: '#2f6bff', on: 1 },
  bar: { w: 260, h: 16, v: 70, bg: '#3a3f55', acc: '#2f6bff' },
  obj: { w: 150, h: 100, bg: '#1d2233', r: 16 },
};
const FIELDS = {
  label: ['text', 'fs', 'color'], button: ['text', 'fs', 'color', 'bg', 'r'], slider: ['v', 'bg', 'acc'],
  arc: ['v', 'bg', 'acc'], switch: ['bg', 'acc'], bar: ['v', 'bg', 'acc'], obj: ['bg', 'r'],
};
const LBL = { text: 'Текст', fs: 'Шрифт Montserrat', color: 'Цвет текста', bg: 'Цвет фона', acc: 'Цвет акцента', r: 'Скругление', v: 'Значение 0–100' };
const FONTS = [14, 20, 28, 36, 48];

const APP_C = `#include "lvgl.h"
#include "ui.h"

/* Твой код: обработчики событий и логика. */
static void on_click(lv_event_t * e)
{
    LV_UNUSED(e);
    /* например: lv_label_set_text(label1, "Нажато"); */
}

void app_init(void)
{
    ui_init();
    /* lv_obj_add_event_cb(button1, on_click, LV_EVENT_CLICKED, NULL); */
}
`;

let S = load(), sel = null, tab = 'canvas';
function fresh() {
  const items = [];
  items.push(mk('label', { x: 105, y: 60, text: '12:45', fs: 48, w: 200 }, items));
  items.push(mk('button', { x: 130, y: 200, text: 'Старт' }, items));
  items.push(mk('slider', { x: 75, y: 330 }, items));
  return { name: 'watch-ui', ver: 8, w: 410, h: 502, bg: '#000000', app: APP_C, items };
}
function load() {
  try { const j = JSON.parse(localStorage.getItem(KEY)); if (j && j.items) return j; } catch (e) { /* пусто */ }
  return fresh();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* нет места */ } }
function mk(type, extra, list) {
  const n = list || [];
  let k = 1; while (n.some((i) => i.name === type + k)) k++;
  return { type, name: type + k, x: 20, y: 20, ...DEF[type], ...extra };
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cs = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

/* ---------- каркас ---------- */
document.querySelector('#app').innerHTML = `
<header>
  <h1>LVGL Мастерская</h1>
  <input class="n" id="pname" aria-label="Название проекта" size="14">
  <select id="ver" aria-label="Версия LVGL"><option value="8">LVGL 8.x</option><option value="9">LVGL 9.x</option></select>
  <span class="sp"></span>
  <button id="bImp">Открыть project.json</button>
  <button id="bZip" class="pri">Скачать ZIP</button>
  <button id="bReset">Сбросить</button>
  <input id="imp" type="file" accept=".json" hidden>
</header>
<main>
  <aside id="left"></aside>
  <div id="center">
    <div class="tabs" id="tabs"></div>
    <div id="stage"><div id="cv"></div></div>
    <div id="codebox"></div>
  </div>
  <aside id="right"></aside>
</main>`;
const $ = (s) => document.querySelector(s);
$('#pname').value = S.name; $('#ver').value = S.ver;

/* ---------- холст ---------- */
function arcPath(cx, cy, r, a0, a1) {
  const p = (a) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  return `M${x0} ${y0}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}
function inner(i) {
  const f = i.fs ? `font-size:${i.fs}px;` : '';
  switch (i.type) {
    case 'label': return `<div style="${f}color:${i.color};white-space:nowrap">${esc(i.text)}</div>`;
    case 'button': return `<div style="width:100%;height:100%;background:${i.bg};border-radius:${i.r}px;color:${i.color};${f}display:flex;align-items:center;justify-content:center">${esc(i.text)}</div>`;
    case 'slider': case 'bar': {
      const k = i.type === 'slider' ? `<span style="position:absolute;left:calc(${i.v}% - ${i.h / 2}px);top:-2px;width:${i.h + 4}px;height:${i.h + 4}px;border-radius:50%;background:${i.acc}"></span>` : '';
      return `<div style="position:relative;width:100%;height:100%;background:${i.bg};border-radius:${i.h}px"><div style="width:${i.v}%;height:100%;background:${i.acc};border-radius:${i.h}px"></div>${k}</div>`;
    }
    case 'arc': {
      const s = Math.min(i.w, i.h), c = s / 2, r = c - 10;
      return `<svg width="${i.w}" height="${i.h}" fill="none" stroke-linecap="round" stroke-width="14"><path d="${arcPath(c, c, r, 135, 405)}" stroke="${i.bg}"/>${i.v > 0 ? `<path d="${arcPath(c, c, r, 135, 135 + 2.7 * Math.min(i.v, 99.9))}" stroke="${i.acc}"/>` : ''}</svg>`;
    }
    case 'switch': return `<div style="position:relative;width:100%;height:100%;background:${i.bg};border-radius:${i.h}px"><div style="position:absolute;inset:0;background:${i.acc};border-radius:${i.h}px"></div><span style="position:absolute;right:3px;top:3px;bottom:3px;aspect-ratio:1;border-radius:50%;background:#fff"></span></div>`;
    default: return `<div style="width:100%;height:100%;background:${i.bg};border-radius:${i.r}px"></div>`;
  }
}
function box(i) { return `left:${i.x}px;top:${i.y}px;width:${i.w}px;height:${i.type === 'label' || i.type === 'arc' ? 'auto' : i.h + 'px'}`; }
function drawCanvas() {
  const cv = $('#cv');
  cv.style.width = S.w + 'px'; cv.style.height = S.h + 'px'; cv.style.background = S.bg;
  cv.innerHTML = S.items.map((i, n) => `<div class="el${n === sel ? ' sel' : ''}" data-i="${n}" style="${box(i)}">${inner(i)}</div>`).join('');
}

/* ---------- панели ---------- */
function drawLeft() {
  $('#left').innerHTML = '<b>Добавить</b><div class="pal">' + Object.keys(NAMES).map((t) => `<button data-add="${t}">${NAMES[t]}</button>`).join('') +
    '</div><b>Объекты</b>' + S.items.map((i, n) => `<div class="row${n === sel ? ' on' : ''}" data-row="${n}">${esc(i.name)}</div>`).join('') +
    `<b>Экран</b><div class="g2"><label>Ширина<input type="number" data-s="w" value="${S.w}"></label><label>Высота<input type="number" data-s="h" value="${S.h}"></label></div><label>Фон<input type="color" data-s="bg" value="${S.bg}"></label>`;
}
function drawRight() {
  const i = S.items[sel], r = $('#right');
  if (!i) { r.innerHTML = '<b>Свойства</b><span style="color:var(--dim)">Выбери объект на холсте или в списке.</span>'; return; }
  let h = `<b>${NAMES[i.type]}</b><label>Имя в коде<input data-p="name" value="${esc(i.name)}"></label><div class="g2">` +
    ['x', 'y', 'w', 'h'].map((k) => `<label>${k.toUpperCase()}<input type="number" data-p="${k}" value="${i[k]}"></label>`).join('') + '</div>';
  FIELDS[i.type].forEach((k) => {
    if (k === 'fs') h += `<label>${LBL[k]}<select data-p="fs">${FONTS.map((f) => `<option${f === i.fs ? ' selected' : ''}>${f}</option>`).join('')}</select></label>`;
    else if (['color', 'bg', 'acc'].includes(k)) h += `<label>${LBL[k]}<input type="color" data-p="${k}" value="${i[k]}"></label>`;
    else h += `<label>${LBL[k]}<input ${['v', 'r'].includes(k) ? 'type="number"' : ''} data-p="${k}" value="${esc(i[k])}"></label>`;
  });
  h += '<button data-a="dup">Дублировать</button><button data-a="rm" style="color:var(--danger)">Удалить</button>';
  r.innerHTML = h;
}
function drawTabs() {
  $('#tabs').innerHTML = [['canvas', 'Холст'], ['ui.c', 'ui.c'], ['ui.h', 'ui.h'], ['app.c', 'app.c']]
    .map(([k, t]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${t}</button>`).join('');
  const code = tab !== 'canvas';
  $('#stage').style.display = code ? 'none' : ''; $('#codebox').style.display = code ? 'block' : 'none';
  if (code) showCode();
}
const all = () => { drawCanvas(); drawLeft(); drawRight(); refreshCode(); };

/* ---------- генерация LVGL ---------- */
function genC() {
  const v9 = S.ver === 9, hx = (c) => '0x' + c.slice(1).toUpperCase();
  const mkf = { label: 'lv_label_create', button: v9 ? 'lv_button_create' : 'lv_btn_create', slider: 'lv_slider_create', arc: 'lv_arc_create', switch: 'lv_switch_create', bar: 'lv_bar_create', obj: 'lv_obj_create' };
  let o = `/* Сгенерировано в LVGL Мастерской (LVGL ${S.ver}.x). Правки делай в редакторе. */\n#include "lvgl.h"\n#include "ui.h"\n\n`;
  S.items.forEach((i) => { o += `lv_obj_t * ${i.name};\n`; });
  o += `\nvoid ui_init(void)\n{\n    lv_obj_t * scr = ${v9 ? 'lv_screen_active' : 'lv_scr_act'}();\n    lv_obj_set_style_bg_color(scr, lv_color_hex(${hx(S.bg)}), 0);\n`;
  S.items.forEach((i) => {
    const n = i.name, col = (c, p) => `    lv_obj_set_style_bg_color(${n}, lv_color_hex(${hx(c)}), ${p});\n`;
    o += `\n    ${n} = ${mkf[i.type]}(scr);\n    lv_obj_set_pos(${n}, ${i.x}, ${i.y});\n`;
    o += i.type === 'label' ? `    lv_obj_set_width(${n}, ${i.w});\n` : i.type === 'arc' ? `    lv_obj_set_size(${n}, ${i.w}, ${i.h});\n` : `    lv_obj_set_size(${n}, ${i.w}, ${i.h});\n`;
    const font = `lv_obj_set_style_text_font(%, &lv_font_montserrat_${i.fs}, 0);\n`;
    if (i.type === 'label') {
      o += `    lv_label_set_text(${n}, "${cs(i.text)}");\n    lv_obj_set_style_text_color(${n}, lv_color_hex(${hx(i.color)}), 0);\n    ${font.replace('%', n)}`;
    } else if (i.type === 'button') {
      o += col(i.bg, 0) + `    lv_obj_set_style_radius(${n}, ${i.r}, 0);\n    lv_obj_set_style_shadow_width(${n}, 0, 0);\n`;
      o += `    lv_obj_t * ${n}_label = lv_label_create(${n});\n    lv_label_set_text(${n}_label, "${cs(i.text)}");\n    lv_obj_set_style_text_color(${n}_label, lv_color_hex(${hx(i.color)}), 0);\n    ${font.replace('%', n + '_label')}    lv_obj_center(${n}_label);\n`;
    } else if (i.type === 'slider' || i.type === 'bar') {
      o += `    lv_${i.type}_set_value(${n}, ${i.v}, LV_ANIM_OFF);\n` + col(i.bg, 'LV_PART_MAIN') + col(i.acc, 'LV_PART_INDICATOR');
      if (i.type === 'slider') o += col(i.acc, 'LV_PART_KNOB');
    } else if (i.type === 'arc') {
      o += `    lv_arc_set_value(${n}, ${i.v});\n    lv_obj_set_style_arc_color(${n}, lv_color_hex(${hx(i.bg)}), LV_PART_MAIN);\n    lv_obj_set_style_arc_color(${n}, lv_color_hex(${hx(i.acc)}), LV_PART_INDICATOR);\n` + col(i.acc, 'LV_PART_KNOB');
    } else if (i.type === 'switch') {
      o += col(i.bg, 'LV_PART_MAIN') + col(i.acc, '(uint32_t)LV_PART_INDICATOR | LV_STATE_CHECKED') + `    lv_obj_add_state(${n}, LV_STATE_CHECKED);\n`;
    } else {
      o += col(i.bg, 0) + `    lv_obj_set_style_radius(${n}, ${i.r}, 0);\n    lv_obj_set_style_border_width(${n}, 0, 0);\n    lv_obj_${v9 ? 'remove_flag' : 'clear_flag'}(${n}, LV_OBJ_FLAG_SCROLLABLE);\n`;
    }
  });
  return o + '}\n';
}
function genH() {
  return `#pragma once\n#include "lvgl.h"\n\n#ifdef __cplusplus\nextern "C" {\n#endif\n\nvoid ui_init(void);\nvoid app_init(void);\n\n` +
    S.items.map((i) => `extern lv_obj_t * ${i.name};\n`).join('') + `\n#ifdef __cplusplus\n}\n#endif\n`;
}
const files = () => ({ 'ui.c': genC(), 'ui.h': genH(), 'app.c': S.app });

/* ---------- CodeMirror 6 ---------- */
let view = null;
function showCode() {
  const ro = tab !== 'app.c', doc = files()[tab];
  const state = EditorState.create({
    doc,
    extensions: [basicSetup, cpp(), oneDark, EditorState.readOnly.of(ro), EditorView.editable.of(!ro),
      EditorView.updateListener.of((u) => { if (u.docChanged && !ro) { S.app = u.state.doc.toString(); save(); } })],
  });
  if (!view) view = new EditorView({ state, parent: $('#codebox') }); else view.setState(state);
}
function refreshCode() { if (tab === 'ui.c' || tab === 'ui.h') showCode(); }

/* ---------- события ---------- */
$('#tabs').onclick = (e) => { const t = e.target.dataset.t; if (t) { tab = t; drawTabs(); } };
$('#left').onclick = (e) => {
  const a = e.target.dataset.add, r = e.target.closest('[data-row]');
  if (a) { S.items.push(mk(a, { x: 20 + S.items.length * 8, y: 20 + S.items.length * 8 }, S.items)); sel = S.items.length - 1; save(); all(); }
  else if (r) { sel = +r.dataset.row; all(); }
};
$('#right').onclick = (e) => {
  const a = e.target.dataset.a;
  if (a === 'rm') { S.items.splice(sel, 1); sel = null; }
  else if (a === 'dup') { const c = { ...S.items[sel] }; c.x += 12; c.y += 12; S.items.push(c); sel = S.items.length - 1; c.name = mk(c.type, {}, S.items).name; }
  else return;
  save(); all();
};
$('#left').oninput = (e) => {
  const k = e.target.dataset.s; if (!k) return;
  S[k] = e.target.type === 'number' ? +e.target.value : e.target.value; save(); drawCanvas();
};
$('#right').oninput = (e) => {
  const k = e.target.dataset.p, i = S.items[sel]; if (!k || !i) return;
  const num = ['x', 'y', 'w', 'h', 'r', 'v', 'fs'].includes(k);
  i[k] = num ? +e.target.value : e.target.value;
  if (k === 'name') { i.name = e.target.value.replace(/[^A-Za-z0-9_]/g, '_') || i.type; }
  save(); drawCanvas(); refreshCode(); if (k === 'name') drawLeft();
};
let drag = null;
$('#cv').addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.el');
  if (!el) { sel = null; all(); return; }
  sel = +el.dataset.i; const i = S.items[sel]; drag = { x: e.clientX, y: e.clientY, ox: i.x, oy: i.y };
  drawCanvas(); drawLeft(); drawRight(); $('#cv').setPointerCapture(e.pointerId);
});
$('#cv').addEventListener('pointermove', (e) => {
  if (!drag) return; const i = S.items[sel];
  i.x = Math.round(drag.ox + e.clientX - drag.x); i.y = Math.round(drag.oy + e.clientY - drag.y);
  const el = $('#cv .sel'); el.style.left = i.x + 'px'; el.style.top = i.y + 'px';
});
$('#cv').addEventListener('pointerup', () => { if (drag) { drag = null; save(); drawRight(); } });
$('#pname').oninput = (e) => { S.name = e.target.value; save(); };
$('#ver').onchange = (e) => { S.ver = +e.target.value; save(); refreshCode(); };
$('#bZip').onclick = () => {
  const f = files(), z = {};
  Object.keys(f).forEach((k) => { z[k] = strToU8(f[k]); });
  z['project.json'] = strToU8(JSON.stringify(S, null, 1));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([zipSync(z)], { type: 'application/zip' }));
  a.download = (S.name || 'project').replace(/[^\w-]+/g, '_') + '.zip'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
$('#bImp').onclick = () => $('#imp').click();
$('#imp').onchange = (e) => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { try { const j = JSON.parse(r.result); if (!j.items) throw 0; S = j; sel = null; $('#pname').value = S.name; $('#ver').value = S.ver; save(); all(); } catch (x) { alert('Это не project.json из Мастерской'); } };
  r.readAsText(f); e.target.value = '';
};
$('#bReset').onclick = () => { if (!confirm('Вернуть пример и стереть проект?')) return; S = fresh(); sel = null; $('#pname').value = S.name; $('#ver').value = S.ver; save(); all(); };

all(); drawTabs();
