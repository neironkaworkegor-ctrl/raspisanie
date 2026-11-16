<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Что по парам? · СКИ РУК</title>
<style>
*{box-sizing:border-box}
:root{color-scheme:dark;--paper:#f8f5ef;--ink:#21221f;--pink:#e4a1cf;--plum:#a05188}
body{margin:0;background:var(--ink);color:var(--paper);font:16px/1.4 Arial,sans-serif}
main{max-width:900px;margin:auto;padding:18px clamp(14px,4vw,40px) 40px}
header,footer,.controls,.heading,.info{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
header,footer,.heading{justify-content:space-between}
header{border-bottom:1px solid #777;padding-bottom:14px;font-weight:bold}
button,input,a{font:inherit}
button,input{color:inherit;background:#2c2d29;border:1px solid #666;border-radius:6px;padding:10px;cursor:pointer}
button[aria-pressed=true]{background:var(--pink);color:var(--ink);border-color:var(--pink)}
button:disabled{opacity:.35;cursor:default}
:focus-visible{outline:3px solid var(--pink);outline-offset:3px}
.hero{position:relative;isolation:isolate;overflow:hidden;padding:34px 10px 28px;margin-bottom:18px;border-bottom:1px solid #777}
.hero:before{content:"";position:absolute;z-index:-1;right:-6%;top:-38%;width:52%;aspect-ratio:1;background:var(--plum);transform:rotate(12deg);clip-path:polygon(50% 0,55% 32%,70% 4%,65% 35%,89% 14%,72% 41%,100% 33%,74% 48%,100% 54%,75% 56%,97% 77%,69% 64%,84% 96%,61% 70%,61% 100%,52% 72%,37% 99%,43% 69%,17% 94%,34% 64%,0 72%,29% 55%,0 47%,29% 46%,4% 23%,35% 38%,20% 2%,44% 32%)}
h1{font:1000 clamp(48px,12vw,108px)/.85 "Arial Black",Arial,sans-serif;letter-spacing:-.085em;margin:4px 0 28px;transform:rotate(-4deg) skew(-7deg);transform-origin:left center}
.hero p{font-weight:bold;margin:0}
.controls{margin:16px 0}.controls label{display:flex;align-items:center;gap:8px}
nav{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}nav button{padding:8px 0;font-size:13px}nav b{display:block;font-size:21px}
h2{font-size:clamp(23px,4vw,34px);letter-spacing:-.05em;margin:22px 0 8px}
article{display:grid;grid-template-columns:52px 1fr;gap:12px;margin:8px 0;background:var(--paper);color:var(--ink);padding:16px;border-radius:4px}
.number{font:bold 36px/1 Arial;color:#794768}.number small{display:block;font:12px Arial}
h3{margin:0 0 6px;font-size:clamp(18px,3vw,24px);line-height:1.12}
.info{font-size:14px;margin-top:8px;gap:6px}.tag{background:#eed8e7;padding:3px 7px;border-radius:3px}
footer{margin-top:24px;border-top:1px solid #777;padding-top:14px;font-size:13px;color:#ddd}a{color:var(--pink)}
@media(max-width:440px){main{padding-inline:12px}.controls{gap:6px}.controls label{font-size:14px}article{grid-template-columns:34px 1fr;padding:13px}}
</style>
</head>
<body>
<main>
<header><span>СКИ РУК / Саранск</span><button id="download">Скачать HTML ↓</button></header>
<section class="hero"><h1>ЧТО ПО<br>ПАРАМ?</h1><p>Юриспруденция · ЮР(ЮР)2-О/Бп/СР25</p></section>
<div class="controls">
<button id="prev" aria-label="Предыдущая неделя">←</button>
<label>Дата <input id="date" type="date" min="2026-11-16" max="2026-12-30"></label>
<button id="next" aria-label="Следующая неделя">→</button>
<button id="all" aria-pressed="false">Вся неделя</button>
</div>
<nav aria-label="Дни недели"></nav>
<section id="schedule" aria-live="polite"></section>
<footer><span id="source"></span><a href="https://schedule.ruc.su/" target="_blank" rel="noopener">Сверить с РУК ↗</a></footer>
</main>
<script>
const subjects=[
 ['Юридическая психология','Литяйкина Ольга Геннадьевна'],
 ['Экологическое право','Никишова Наталья Валерьевна'],
 ['Управление карьерой и тайм-менеджмент','Солдаткина Светлана Михайловна'],
 ['Юридическая техника','Печаткин Александр Сергеевич'],
 ['Профессиональная этика','Литяйкина Ольга Геннадьевна'],
 ['Административное право','Свешникова Лариса Николаевна'],
 ['Уголовное право','Асанова Ирина Павловна'],
 ['Гражданское право','Минеева Ирина Николаевна'],
 ['Муниципальное право','Котляров Сергей Борисович'],
 ['Элективные дисциплины по физической культуре и спорту','Муратова Ирина Викторовна']
];
const weeks=[
 [
  [[2,0,'403','Л'],[3,1,'217','С']],
  [[3,2,'304','С'],[4,2,'204','Л']],
  [[3,3,'Актовый зал','С'],[4,4,'106','С'],[5,3,'413','Л']],
  [[3,5,'407','С'],[4,5,'406б','Л']],
  [[3,6,'412','С'],[4,0,'100а','С']]
 ],
 [
  [[3,7,'206','С'],[4,7,'413','Л'],[5,1,'413','Л']],
  [[3,5,'405','С'],[4,4,'105','Л']],
  [[1,1,'101','Л'],[2,8,'206','Л'],[3,8,'304','С']],
  [[2,9,'109','С'],[3,9,'109','С'],[4,5,'413','Л']],
  [[3,6,'407','Л'],[4,5,'104','С']]
 ]
];
const start=Date.UTC(2026,10,16), dayMs=86400000, last=44;
const dateAt=n=>new Date(start+n*dayMs);
const iso=n=>dateAt(n).toISOString().slice(0,10);
const fmt=(n,options)=>dateAt(n).toLocaleDateString('ru-RU',{...options,timeZone:'UTC'});
const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Moscow'});
const offset=Math.round((Date.parse(today)-start)/dayMs);
let selected=offset>=0&&offset<=last?offset:0, fullWeek=false;
const get=id=>document.getElementById(id);
function lesson([number,id,room,kind]){
 const [name,teacher]=subjects[id];
 const place=room==='Актовый зал'?room:'Ауд. '+room+(room==='101'?'':' · корпус №1');
 return `<article><div class="number">${number}<small>пара</small></div><div><h3>${name}</h3>${teacher}<div class="info"><span class="tag">${kind==='Л'?'Лекция':'Семинар'}</span>${place}</div></div></article>`;
}
function render(){
 const week=Math.floor(selected/7), monday=week*7;
 const nav=document.querySelector('nav');
 nav.replaceChildren();
 const sections=[];
 for(let i=0;i<7&&monday+i<=last;i++){
  const n=monday+i, btn=document.createElement('button');
  btn.innerHTML=fmt(n,{weekday:'short'})+'<b>'+dateAt(n).getUTCDate()+'</b>';
  btn.setAttribute('aria-pressed',String(!fullWeek&&n===selected));
  btn.onclick=()=>{selected=n;fullWeek=false;render()};
  nav.append(btn);
  if(fullWeek||n===selected){
   const rows=weeks[week%2][i]||[];
   sections.push('<h2>'+fmt(n,{weekday:'long',day:'numeric',month:'long'})+'</h2>'+
    (rows.length?rows.map(lesson).join(''):'<p>В расписании пар нет.</p>'));
  }
 }
 get('schedule').innerHTML=sections.join('');
 get('date').value=iso(selected);
 get('prev').disabled=week===0;
 get('next').disabled=monday+7>last;
 get('all').setAttribute('aria-pressed',String(fullWeek));
 get('source').textContent=week<2?'Данные со скриншота РУК':'По чередованию недель · возможны изменения';
}
get('date').onchange=e=>{
 const n=Math.round((Date.parse(e.target.value)-start)/dayMs);
 if(Number.isInteger(n)&&n>=0&&n<=last){selected=n;fullWeek=false}
 render();
};
get('prev').onclick=()=>{selected=Math.max(0,selected-7);render()};
get('next').onclick=()=>{selected=Math.min(last,selected+7);render()};
get('all').onclick=()=>{fullWeek=!fullWeek;render()};
get('download').onclick=()=>{
 const blob=new Blob(['<!doctype html>\n',document.documentElement.outerHTML],{type:'text/html;charset=utf-8'});
 const url=URL.createObjectURL(blob), link=document.createElement('a');
 link.href=url;link.download='SKI-RUK-Nov-Dec-2026.html';
 document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),30000);
};
render();
</script>
</body>
</html>
