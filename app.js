'use strict';
const DAY_MS = 86400000;
const GROUP_ID = '3a651b16-3ac2-11f0-954a-00155d639805';
const CACHE_KEY = 'ruc-schedule-v1';
const get = id => document.getElementById(id);
const iso = value => new Date(value).toISOString().slice(0, 10);
const format = (value, options) => new Date(value).toLocaleDateString('ru-RU', { ...options, timeZone: 'UTC' });
let selected = Date.parse(new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' }));
let fullWeek = false;
let schedule = null;
let loading = false;
let loadFailed = false;

function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
}

function isSchedule(data) {
    return data && data.schemaVersion === 1 && data.groupId === GROUP_ID &&
        data.days && Object.keys(data.days).length > 0 &&
        Object.entries(data.days).every(([key, day]) =>
            /^\d{4}-\d{2}-\d{2}$/.test(key) && Number.isFinite(Date.parse(key)) &&
            day && Number.isFinite(Date.parse(day.checkedAt)) && Array.isArray(day.lessons) &&
            day.lessons.every(row => Number.isInteger(row.number) &&
                ['subject', 'teacher', 'room', 'type'].every(field => typeof row[field] === 'string')));
}

function lesson(row) {
    const article = element('article');
    const number = element('div', row.number, 'number');
    number.append(element('small', 'пара'));
    const content = element('div');
    content.append(element('h3', row.subject), element('div', row.teacher));
    const info = element('div', undefined, 'info');
    if (row.type) info.append(element('span', row.type, 'tag'));
    info.append(element('span', row.room));
    content.append(info);
    article.append(number, content);
    return article;
}

function render() {
    const monday = selected - ((new Date(selected).getUTCDay() + 6) % 7) * DAY_MS;
    const nav = document.querySelector('nav');
    const body = get('schedule');
    nav.replaceChildren();
    body.replaceChildren();
    const dates = schedule ? Object.keys(schedule.days).sort() : [];
    for (let index = 0; index < 7; index++) {
        const day = monday + index * DAY_MS;
        const button = element('button', format(day, { weekday: 'short' }));
        button.append(element('b', new Date(day).getUTCDate()));
        button.setAttribute('aria-pressed', String(!fullWeek && day === selected));
        button.onclick = () => { selected = day; fullWeek = false; render(); };
        nav.append(button);
        if (!fullWeek && day !== selected) continue;
        body.append(element('h2', format(day, { weekday: 'long', day: 'numeric', month: 'long' })));
        const record = schedule?.days[iso(day)];
        if (record?.lessons.length) {
            body.append(...record.lessons.map(lesson));
        } else {
            const message = record ? 'На сайте РУК занятия на этот день не указаны.' :
                loading ? 'Загружаем расписание…' : 'Данные на эту дату ещё не загружены. Проверь расписание РУК по ссылке ниже.';
            body.append(element('p', message));
        }
    }
    get('date').value = iso(selected);
    get('prev').disabled = dates.length === 0 || monday <= Date.parse(dates[0]);
    get('next').disabled = dates.length === 0 || monday + 7 * DAY_MS > Date.parse(dates.at(-1));
    get('date').min = dates[0] || '';
    get('date').max = dates.at(-1) || '';
    get('all').setAttribute('aria-pressed', String(fullWeek));
    get('refresh').disabled = loading;
    const displayed = Object.entries(schedule?.days || {}).filter(([key]) =>
        fullWeek ? Date.parse(key) >= monday && Date.parse(key) < monday + 7 * DAY_MS : key === iso(selected));
    const oldest = displayed.length ? Math.min(...displayed.map(([, record]) => Date.parse(record.checkedAt))) : null;
    let status = oldest ? 'Проверено в РУК ' + new Date(oldest).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) + ' МСК' : 'Источник — расписание РУК';
    if (oldest && Date.now() - oldest > 2 * 60 * 60 * 1000) status += ' · данные могли устареть';
    if (loadFailed) status += ' · обновление недоступно';
    get('source').textContent = status;
}

async function refresh() {
    if (loading) return;
    loading = true;
    render();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
        const response = await fetch('./data/schedule.json', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Schedule download failed');
        const data = await response.json();
        if (!isSchedule(data)) throw new Error('Invalid schedule');
        schedule = data;
        loadFailed = false;
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* Storage can be unavailable in WebViews. */ }
    } catch {
        loadFailed = true;
    } finally {
        clearTimeout(timer);
        loading = false;
        render();
    }
}

get('date').onchange = event => {
    const value = Date.parse(event.target.value);
    if (Number.isFinite(value)) { selected = value; fullWeek = false; }
    render();
};
get('prev').onclick = () => { selected -= 7 * DAY_MS; render(); };
get('next').onclick = () => { selected += 7 * DAY_MS; render(); };
get('all').onclick = () => { fullWeek = !fullWeek; render(); };
get('refresh').onclick = refresh;
try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (isSchedule(cached)) schedule = cached;
} catch { /* Start with the network when browser storage is inaccessible. */ }
refresh();
setInterval(() => { if (!document.hidden) refresh(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
