"""Fetch official RUC weeks and atomically update the site's schedule cache."""
import argparse
from datetime import date, datetime, timedelta, timezone
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

SOURCE = 'https://schedule.ruc.su/'
PARAMS = {
    'branch': '844a7035-7a9a-11df-b9d8-005056bd3ce5',
    'year': '55df8c55-eac7-11ef-9549-00155d3a4704',
    'group': '3a651b16-3ac2-11f0-954a-00155d639805',
}
GROUP = 'ЮР(ЮР)2-О/Бп/СР25'


class Node:
    def __init__(self, tag='', attrs=()):
        self.tag = tag
        self.attrs = dict(attrs)
        self.children = []

    def text(self):
        return ''.join(child.text() if isinstance(child, Node) else child for child in self.children)

    def find(self, tag=None, css_class=None, **attrs):
        result = []
        for child in self.children:
            if isinstance(child, Node):
                if (tag is None or child.tag == tag) and (css_class is None or css_class in child.attrs.get('class', '').split()) and all(child.attrs.get(k) == v for k, v in attrs.items()):
                    result.append(child)
                result.extend(child.find(tag, css_class, **attrs))
        return result


class Document(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.stack = [self.root]
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        if tag == 'br':
            self.stack[-1].children.append('\n')
            return
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in {'input', 'meta', 'link', 'img', 'hr', 'source', 'wbr', 'area', 'base', 'embed', 'param', 'track', 'col'}:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def clean(text):
    return ' '.join(text.split())


def parse_week(html, monday):
    root = Document(html).root
    for name, value in PARAMS.items():
        selects = root.find('select', name=name)
        if not selects or not any(option.attrs.get('value') == value and 'selected' in option.attrs for option in selects[0].find('option')):
            raise ValueError(f'RUC did not confirm selected {name}')
    dates = root.find('input', name='scheduler-date')
    if not dates or dates[0].attrs.get('value') != monday.isoformat():
        raise ValueError('RUC returned another date or an incomplete page')
    buttons = root.find('button', css_class='disabled')
    if not any(monday.strftime('%d.%m.%Y') in clean(button.text()) and (monday + timedelta(days=6)).strftime('%d.%m.%Y') in clean(button.text()) for button in buttons):
        raise ValueError('RUC week heading missing')
    days = {(monday + timedelta(days=i)).isoformat(): [] for i in range(7)}
    for card in root.find('div', css_class='card'):
        headings = card.find('div', css_class='card-header')
        if len(headings) != 1:
            raise ValueError('Unrecognized RUC day heading')
        match = re.match(r'(\d{2}\.\d{2}\.\d{4})', clean(headings[0].text()))
        if not match:
            raise ValueError('Unrecognized RUC day date')
        key = datetime.strptime(match[1], '%d.%m.%Y').date().isoformat()
        if key not in days:
            raise ValueError('RUC returned a day outside requested week')
        for body in card.find('div', css_class='card-body'):
            lines = [clean(line) for line in body.text().split('\n') if clean(line)]
            if len(lines) < 3:
                raise ValueError('Incomplete RUC lesson')
            title = re.fullmatch(r'(\d+)\.\s*(.+)', lines[0])
            if not title:
                raise ValueError('Unrecognized RUC lesson number')
            details = lines[-1]
            place, separator, kind = details.rpartition(',')
            days[key].append({
                'number': int(title[1]), 'subject': title[2],
                'teacher': ' / '.join(lines[1:-1]),
                'room': place.strip() if separator else details,
                'type': kind.strip() if separator else '',
            })
    return days


def fetch_week(monday):
    payload = urlencode({**PARAMS, 'scheduler-date': monday.isoformat(), 'date-search': monday.isoformat(), 'search-date': 'search-date'}).encode()
    for attempt in range(3):
        try:
            request = Request(SOURCE, data=payload, headers={'User-Agent': 'RUC-Group-Schedule/1.0', 'Accept': 'text/html'})
            with urlopen(request, timeout=45) as response:
                html = response.read().decode('utf-8')
            return parse_week(html, monday)
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path('data/schedule.json'))
    parser.add_argument('--today', type=date.fromisoformat)
    parser.add_argument('--future-weeks', type=int, default=12)
    parser.add_argument('--past-weeks', type=int, default=1)
    args = parser.parse_args()
    if args.future_weeks < 0 or args.past_weeks < 0:
        parser.error('Week counts must be nonnegative')
    today = args.today or datetime.now(ZoneInfo('Europe/Moscow')).date()
    monday = today - timedelta(days=today.weekday())
    old = json.loads(args.output.read_text()) if args.output.exists() else {}
    if old and old.get('groupId') != PARAMS['group']:
        raise ValueError('Cache belongs to another group')
    days = old.get('days', {}).copy()
    failures = []
    successful = 0
    for offset in range(-args.past_weeks, args.future_weeks + 1):
        week = monday + timedelta(weeks=offset)
        try:
            fetched = fetch_week(week)
            checked = datetime.now(timezone.utc).isoformat()
            for key, lessons in fetched.items():
                days[key] = {'lessons': lessons, 'checkedAt': checked}
            successful += 1
            print(f'{week}: {sum(map(len, fetched.values()))} lessons', flush=True)
        except Exception as error:
            failures.append({'week': week.isoformat(), 'error': str(error)})
            print(f'{week}: kept existing cache, {error}', flush=True)
        time.sleep(0.3)
    if not successful:
        raise RuntimeError('No successful weeks. Existing cache was not changed.')
    data = {
        'schemaVersion': 1, 'source': SOURCE, 'group': GROUP, 'groupId': PARAMS['group'],
        'updatedAt': datetime.now(timezone.utc).isoformat(),
        'failedWeeks': failures, 'days': dict(sorted(days.items())),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(args.output)


if __name__ == '__main__':
    main()
