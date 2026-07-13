import re
from pathlib import Path

path = Path(r'f:\code\pglite\data\excelBook\simpsons\data2.sql')
lines = path.read_text(encoding='utf-8').splitlines()

header = lines[0]
data_lines = lines[1:]

# Only parses episode_id, category, and person precisely; everything after
# person (role, credited, closing punctuation) is carried through untouched,
# so a malformed role/credited field elsewhere on the line can't corrupt this.
pattern = re.compile(r"^\('([^']*)',\s*'([^']*)',\s*'((?:[^']|'')*)',\s*(.*)$")

ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'


def code_for(i):
    return ALPHABET[i // len(ALPHABET)] + ALPHABET[i % len(ALPHABET)]


parsed = []
persons = set()
for line in data_lines:
    m = pattern.match(line)
    if not m:
        parsed.append((None, None, None, line))
        continue
    epid, cat, person, rest = m.groups()
    persons.add(person)
    parsed.append((epid, cat, person, rest))

sorted_persons = sorted(persons)
if len(sorted_persons) > len(ALPHABET) ** 2:
    raise SystemExit(f"Need more than 2 chars: {len(sorted_persons)} distinct persons")
placeholder_map = {p: code_for(i) for i, p in enumerate(sorted_persons)}

new_lines = [header]
for epid, cat, person, rest in parsed:
    if epid is None:
        new_lines.append(rest)
        continue
    code = placeholder_map[person]
    new_lines.append(f"('{epid}', '{cat}', '{code}', {rest}")

new_lines.append('')
for person in sorted_persons:
    code = placeholder_map[person]
    new_lines.append(f"update credit set person = '{person}' where person = '{code}';")

path.write_text('\n'.join(new_lines), encoding='utf-8')
print('distinct persons:', len(sorted_persons))
print('new size:', path.stat().st_size)
