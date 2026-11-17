"""Synchronize all Saransk enrollment years from the official RUC JSON API."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone
import json
from pathlib import Path
import re
import time
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

API = 'https://api-schedule.ruc.su/api/v1'
BRANCH = '844a7035-7a9a-11df-b9d8-005056bd3ce5'
DEFAULT_GROUP = '3a651b16-3ac2-11f0-954a-00155d639805'
GUID = re.compile(r'^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$')


def request_json(path):
    for attempt in range(3):
        try:
            request = Request(f'{API}/{path}', headers={'Accept': 'application/json', 'User-Agent': 'RUC-Group-Schedule/2.0'})
            with urlopen(request, timeout=35) as response:
                return json.load(response)
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}


def fetch_groups():
    years = request_json('get_years')
    groups = {}
    catalog_years = []
    for year in years:
        if not GUID.fullmatch(year['guid']):
            raise ValueError('Invalid year in RUC catalog')
        catalog_years.append({'id': year['guid'], 'name': year['name']})
        source = request_json(f"get_groups_filter/{BRANCH}/{year['guid']}")
        for section in source:
            for item in section['groups']:
                if not GUID.fullmatch(item['guid']) or not item['name'].strip():
                    raise ValueError('Invalid group in RUC catalog')
                groups[item['guid']] = {
                    'id': item['guid'], 'name': item['name'].strip(),
                    'yearId': year['guid'], 'yearName': year['name'],
                }
    if DEFAULT_GROUP not in groups:
        raise ValueError('Default group missing from RUC catalog')
    return catalog_years, sorted(groups.values(), key=lambda group: group['name'])


def parse_week(payload, monday, group):
    meta = payload['date']
    expected = monday.strftime('%Y%m%d')
    if str(meta['to_sch']) != expected:
        raise ValueError('RUC returned another requested date')
    if (int(meta['year']), int(meta['month']), int(meta['monday'])) != (monday.year, monday.month, monday.day):
        raise ValueError('RUC returned another week')
    source = payload['schedule']
    if source == []:
        source = {}
    if not isinstance(source, dict):
        raise ValueError('Invalid RUC schedule')
    days = {(monday + timedelta(days=i)).isoformat(): [] for i in range(7)}
    for rows in source.values():
        if not isinstance(rows, list):
            raise ValueError('Invalid RUC day')
        for row in rows:
            key = datetime.strptime(row['Data'], '%d.%m.%Y').date().isoformat()
            if key not in days or row['FilialGUID'] != BRANCH or row['Group'].strip() != group['name']:
                raise ValueError('RUC returned another date, branch or group')
            number_match = re.fullmatch(r'(?:(Урок|Пара)\s*)?(\d+)\.?', str(row['Time']).strip(), re.IGNORECASE)
            if not number_match:
                raise ValueError('Invalid lesson number')
            number = int(number_match[2])
            unit = 'урок' if (number_match[1] or '').lower() == 'урок' else 'пара'
            start, end = row.get('Time_start', ''), row.get('Time_end', '')
            for value in (start, end):
                if value and not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d', value):
                    raise ValueError('Invalid lesson time')
            if bool(start) != bool(end):
                raise ValueError('Incomplete lesson time range')
            if start and end <= start:
                raise ValueError('Invalid lesson time range')
            days[key].append({
                'number': number, 'unit': unit, 'subject': row['Discipline'].strip(),
                'teacher': row['Employee'].strip(), 'room': 'ауд. ' + ' '.join(row['Classroom'].split()),
                'type': row['Type'].strip(), 'start': start, 'end': end,
                'subgroup': row.get('SubGroup', '').strip(),
            })
    for lessons in days.values():
        lessons.sort(key=lambda row: (row['start'], row['number'], row['subgroup']))
    return days


def sync_group(group, output, monday, past_weeks, future_weeks, now):
    path = output / 'groups' / (group['id'] + '.json')
    old = read_json(path)
    if not old and group.get('yearId'):
        old = read_json(output / 'years' / (group['yearId'] + '.json')).get('groups', {}).get(group['id'], {})
    if not old and group['id'] == DEFAULT_GROUP:
        old = read_json(output / 'schedule.json')
    if old and old.get('groupId') != group['id']:
        raise ValueError('Cache belongs to another group')
    days = old.get('days', {}).copy()
    failures = []
    successes = 0
    for offset in range(-past_weeks, future_weeks + 1):
        week = monday + timedelta(weeks=offset)
        keys = [(week + timedelta(days=i)).isoformat() for i in range(7)]
        # Refresh current and next week every run. Refresh the remaining horizon daily.
        records = [days.get(key) for key in keys]
        if group['id'] != DEFAULT_GROUP and offset not in (0, 1) and all(record and all('start' in lesson and 'end' in lesson for lesson in record['lessons']) for record in records):
            checked = min(datetime.fromisoformat(record['checkedAt']) for record in records)
            if (now - checked).total_seconds() < 86400:
                continue
        try:
            payload = request_json(f"get_schedule/group/{BRANCH}/{group['id']}/{week.strftime('%Y.%m.%d')}")
            fetched = parse_week(payload, week, group)
            checked = datetime.now(timezone.utc).isoformat()
            for key, lessons in fetched.items():
                days[key] = {'lessons': lessons, 'checkedAt': checked}
            successes += 1
        except Exception as error:
            failures.append({'week': week.isoformat(), 'error': str(error)})
    if successes:
        data = {
            'schemaVersion': 1, 'source': 'https://schedule.ruc.su/',
            'group': group['name'], 'groupId': group['id'],
            'updatedAt': datetime.now(timezone.utc).isoformat(),
            'failedWeeks': failures, 'days': dict(sorted(days.items())),
        }
        atomic_json(path, data)
        if group['id'] == DEFAULT_GROUP:
            atomic_json(output / 'schedule.json', data)
    elif not path.exists() and old:
        atomic_json(path, old)
    return successes, len(failures)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, default=Path('data'))
    parser.add_argument('--today', type=date.fromisoformat)
    parser.add_argument('--future-weeks', type=int, default=12)
    parser.add_argument('--past-weeks', type=int, default=1)
    parser.add_argument('--workers', type=int, default=4)
    args = parser.parse_args()
    if args.future_weeks < 0 or args.past_weeks < 0 or not 1 <= args.workers <= 4:
        parser.error('Invalid horizon or worker count (1–4)')
    now = datetime.now(timezone.utc)
    today = args.today or datetime.now(ZoneInfo('Europe/Moscow')).date()
    monday = today - timedelta(days=today.weekday())
    catalog_path = args.output_dir / 'groups.json'
    try:
        years, groups = fetch_groups()
    except Exception:
        catalog = read_json(catalog_path)
        if not catalog:
            raise
        groups = catalog['groups']
        years = catalog['years']
        print('::warning::Catalog unavailable; using previously fetched group list')
    successful = failed = 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        tasks = {pool.submit(sync_group, group, args.output_dir, monday, args.past_weeks, max(12, args.future_weeks) if group['id'] == DEFAULT_GROUP else args.future_weeks, now): group for group in groups}
        for task in as_completed(tasks):
            group = tasks[task]
            try:
                refreshed, failures = task.result()
                successful += refreshed
                failed += failures
                print(f"{group['name']}: refreshed {refreshed} weeks, failed {failures}", flush=True)
            except Exception as error:
                failed += 1
                print(f"::warning::{group['name']}: {error}", flush=True)
    if not successful:
        raise RuntimeError('No successful refreshes. Previous cache remains available.')
    available = 0
    for year in years:
        bundle_path = args.output_dir / 'years' / (year['id'] + '.json')
        bundle = read_json(bundle_path).get('groups', {})
        for group in groups:
            if group['yearId'] != year['id']:
                continue
            path = args.output_dir / 'groups' / (group['id'] + '.json')
            if path.exists():
                bundle[group['id']] = read_json(path)
        available += len(bundle)
        atomic_json(bundle_path, {'schemaVersion': 1, 'yearId': year['id'], 'groups': bundle})
    atomic_json(catalog_path, {'schemaVersion': 1, 'branch': 'Саранский филиал', 'years': years, 'updatedAt': now.isoformat(), 'groups': groups})
    # Per-group files are staging only. Year bundles are the persistent source cache.
    staging = args.output_dir / 'groups'
    if staging.exists():
        for path in staging.glob('*.json'):
            path.unlink()
        staging.rmdir()
    print(f'Published {available} groups. Refreshed {successful} weeks; failures: {failed}', flush=True)
    if failed:
        print('::warning::Some RUC weeks could not be refreshed; preserved their last successful data')


if __name__ == '__main__':
    main()
