'use strict';
const DAY_MS = 86400000;
const DEFAULT_GROUP = '3a651b16-3ac2-11f0-954a-00155d639805';
const DEFAULT_YEAR = '55df8c55-eac7-11ef-9549-00155d3a4704';
const SELECTION_KEY = 'ruc-selected-group-v2';
const CATALOG_KEY = 'ruc-group-catalog-v2';
const get = id => document.getElementById(id);
const iso = value => new Date(value).toISOString().slice(0, 10);
const format = (value, options) => new Date(value).toLocaleDateString('ru-RU', { ...options, timeZone: 'UTC' });
let selected = Date.parse(new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' }));
let fullWeek = false;
let schedule = null;
let catalog = null;
let groupId = DEFAULT_GROUP;
let yearId = DEFAULT_YEAR;
let loading = false;
let loadFailed = false;
let controller = null;
let requestVersion = 0;
let storageAvailable = true;

function readStored(key) {
    try { return JSON.parse(localStorage.getItem(key)); }
    catch { return null; }
}
function storeValue(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { return false; }
}
function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
}
function isCatalog(data) {
    return data?.schemaVersion === 1 && Array.isArray(data.years) && Array.isArray(data.groups) &&
        data.years.every(year => typeof year.id === 'string' && typeof year.name === 'string') &&
        data.groups.every(group => /^[a-f0-9-]{36}$/.test(group.id) &&
            typeof group.name === 'string' && data.years.some(year => year.id === group.yearId));
}
function isSchedule(data, id) {
    return data?.schemaVersion === 1 && data.groupId === id &&
        data.days && Object.keys(data.days).length > 0 &&
        Object.entries(data.days).every(([key, day]) =>
            /^\d{4}-\d{2}-\d{2}$/.test(key) && Number.isFinite(Date.parse(key)) &&
            day && Number.isFinite(Date.parse(day.checkedAt)) && Array.isArray(day.lessons) &&
            day.lessons.every(row => Number.isInteger(row.number) &&
                ['subject', 'teacher', 'room', 'type'].every(field => typeof row[field] === 'string')));
}
function scheduleKey(id) { return 'ruc-schedule-' + id; }
function currentGroup() { return catalog?.groups.find(group => group.id === groupId); }
function saveSelection() {
    if (!groupId) return;
    storageAvailable = storeValue(SELECTION_KEY, { groupId, yearId });
    get('preference-status').textContent = storageAvailable ? 'Группа сохранена на этом устройстве.' :
        'Браузер запретил сохранение. Группа будет выбрана только до закрытия страницы.';
}
function populateGroups() {
    const search = get('group-search').value.trim().toLocaleLowerCase('ru-RU');
    const groups = catalog.groups.filter(group => group.yearId === yearId).sort((a, b) => a.name.localeCompare(b.name, 'ru-RU'));
    // Keep the selected option visible when a search is active.
    const visible = groups.filter(group => group.id === groupId || group.name.toLocaleLowerCase('ru-RU').includes(search));
    const select = get('group');
    select.replaceChildren();
    const prompt = element('option', groups.length ? 'Выбери группу' : 'В этом наборе групп нет');
    prompt.value = '';
    select.append(prompt);
    for (const group of visible) {
        const option = element('option', group.name);
        option.value = group.id;
        select.append(option);
    }
    select.disabled = groups.length === 0;
    select.value = groupId || '';
    if (groups.length && !visible.length) {
        prompt.textContent = 'По этому запросу групп нет';
    }
}
function populateCatalog() {
    const years = get('year');
    years.replaceChildren();
    for (const year of [...catalog.years].reverse()) {
        const option = element('option', year.name.match(/\d{4}/)?.[0] || year.name);
        option.value = year.id;
        years.append(option);
    }
    if (!catalog.years.some(year => year.id === yearId)) yearId = catalog.years.at(-1)?.id || '';
    years.value = yearId;
    const group = catalog.groups.find(item => item.id === groupId && item.yearId === yearId);
    if (!group) groupId = '';
    populateGroups();
}
function lesson(row) {
    const article = element('article');
    const number = element('div', row.number || '—', 'number');
    number.append(element('small', row.unit || 'пара'));
    const content = element('div', undefined, 'lesson-content');
    content.append(element('h3', row.subject), element('div', row.teacher));
    const info = element('div', undefined, 'info');
    if (row.type) info.append(element('span', row.type, 'tag'));
    info.append(element('span', row.room));
    if (row.subgroup) info.append(element('span', 'Подгруппа ' + row.subgroup));
    content.append(info);
    const time = element('div', undefined, 'lesson-time');
    if (row.start && row.end) {
        time.setAttribute('aria-label', 'С ' + row.start + ' до ' + row.end + ' по московскому времени');
        time.append(element('time', row.start), element('span', undefined, 'time-divider'), element('time', row.end), element('span', 'МСК'));
    } else {
        time.append(element('span', 'ВРЕМЯ'), element('span', 'НЕ УКАЗАНО'));
    }
    article.append(number, content, time);
    return article;
}
function render() {
    const monday = selected - ((new Date(selected).getUTCDay() + 6) % 7) * DAY_MS;
    const nav = document.querySelector('nav');
    const body = get('schedule');
    nav.replaceChildren();
    body.replaceChildren();
    get('group-title').textContent = currentGroup()?.name || (groupId === DEFAULT_GROUP ? 'ЮР(ЮР)2-О/Бп/СР25' : 'Выбери свой год набора и группу');
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
        if (record?.lessons.length) body.append(...record.lessons.map(lesson));
        else {
            const message = !groupId ? 'Выбери группу выше.' : record ? 'На сайте РУК занятия на этот день не указаны.' :
                loading ? 'Загружаем расписание…' : 'Данные на эту дату ещё не загружены. Проверь расписание РУК по ссылке ниже.';
            body.append(element('p', message));
        }
    }
    get('date').value = iso(selected);
    get('date-display').textContent = iso(selected).split('-').reverse().join('.');
    get('prev').disabled = !groupId || (dates.length > 0 && monday <= Date.parse(dates[0]));
    get('next').disabled = !groupId || (dates.length > 0 && monday + 7 * DAY_MS > Date.parse(dates.at(-1)));
    get('date').min = dates[0] || '';
    get('date').max = dates.at(-1) || '';
    get('all').setAttribute('aria-pressed', String(fullWeek));
    get('refresh').disabled = loading;
    const displayed = Object.entries(schedule?.days || {}).filter(([key]) =>
        fullWeek ? Date.parse(key) >= monday && Date.parse(key) < monday + 7 * DAY_MS : key === iso(selected));
    const oldest = displayed.length ? Math.min(...displayed.map(([, record]) => Date.parse(record.checkedAt))) : null;
    let status = oldest ? 'Проверено в РУК ' + new Date(oldest).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) + ' МСК' : 'Источник — расписание РУК';
    // Distant weeks are refreshed daily; near dates every 30 minutes.
    const near = Math.abs(selected - Date.parse(new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' }))) < 14 * DAY_MS;
    if (oldest && Date.now() - oldest > (near ? 2 : 26) * 60 * 60 * 1000) status += ' · данные могли устареть';
    if (loadFailed) status += ' · обновление недоступно';
    get('source').textContent = status;
}
async function loadSchedule() {
    const version = ++requestVersion;
    controller?.abort();
    if (!groupId) { loading = false; render(); return; }
    const requestedGroup = groupId;
    const requestController = new AbortController();
    controller = requestController;
    loading = true;
    render();
    const timer = setTimeout(() => requestController.abort(), 20000);
    try {
        const response = await fetch('./data/years/' + yearId + '.json', { cache: 'no-store', signal: requestController.signal });
        if (!response.ok) throw new Error('Schedule download failed');
        const bundle = await response.json();
        const data = bundle.groups?.[requestedGroup];
        if (!isSchedule(data, requestedGroup)) throw new Error('Invalid schedule');
        if (version !== requestVersion) return;
        schedule = data;
        loadFailed = false;
        storeValue(scheduleKey(requestedGroup), data);
    } catch {
        if (version === requestVersion) loadFailed = true;
    } finally {
        clearTimeout(timer);
        if (version === requestVersion) { loading = false; render(); }
    }
}
function selectGroup() {
    controller?.abort();
    ++requestVersion;
    const cached = readStored(scheduleKey(groupId));
    schedule = isSchedule(cached, groupId) ? cached : null;
    // Migrate the previous single-group browser cache without showing it for other groups.
    if (!schedule && groupId === DEFAULT_GROUP) {
        const legacy = readStored('ruc-schedule-v1');
        if (isSchedule(legacy, groupId)) schedule = legacy;
    }
    loadFailed = false;
    saveSelection();
    loadSchedule();
}
async function loadCatalog() {
    const catalogController = new AbortController();
    const timer = setTimeout(() => catalogController.abort(), 20000);
    try {
        const response = await fetch('./data/groups.json', { cache: 'no-store', signal: catalogController.signal });
        if (!response.ok) throw new Error('Catalog unavailable');
        const data = await response.json();
        if (!isCatalog(data)) throw new Error('Invalid catalog');
        catalog = data;
        storeValue(CATALOG_KEY, data);
    } catch {
        const cached = readStored(CATALOG_KEY);
        if (isCatalog(cached)) catalog = cached;
        else {
            get('preference-status').textContent = 'Не удалось загрузить список групп. Нажми «Обновить».';
            get('year').replaceChildren(element('option', 'Список недоступен'));
            get('group').replaceChildren(element('option', 'Список недоступен'));
            loadFailed = true;
            render();
            return;
        }
    }
    finally { clearTimeout(timer); }
    populateCatalog();
    selectGroup();
}
get('year').onchange = event => {
    yearId = event.target.value;
    groupId = '';
    schedule = null;
    loadFailed = false;
    get('group-search').value = '';
    populateGroups();
    get('preference-status').textContent = 'Выбери группу — она сохранится на этом устройстве.';
    loadSchedule();
};
get('group-search').oninput = () => { if (catalog) populateGroups(); };
get('group').onchange = event => { groupId = event.target.value; selectGroup(); };
get('date').onchange = event => {
    const value = Date.parse(event.target.value);
    if (Number.isFinite(value)) { selected = value; fullWeek = false; }
    render();
};
get('prev').onclick = () => { selected -= 7 * DAY_MS; render(); };
get('next').onclick = () => { selected += 7 * DAY_MS; render(); };
get('all').onclick = () => { fullWeek = !fullWeek; render(); };
get('refresh').onclick = () => catalog ? loadSchedule() : loadCatalog();
const saved = readStored(SELECTION_KEY);
if (saved && typeof saved.groupId === 'string' && typeof saved.yearId === 'string') {
    groupId = saved.groupId;
    yearId = saved.yearId;
}
render();
loadCatalog();
setInterval(() => { if (!document.hidden && catalog && !loading) loadSchedule(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && catalog) loadSchedule(); });
