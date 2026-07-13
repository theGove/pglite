import re
from pathlib import Path

path = Path(r'f:\code\pglite\data\excelBook\simpsons\data2.sql')
lines = path.read_text(encoding='utf-8').splitlines()

blank_idx = [i for i, l in enumerate(lines) if l == '']
cat_start = next(i for i, l in enumerate(lines) if l.startswith('update credit set category'))
person_start = next(i for i, l in enumerate(lines) if l.startswith('update credit set person'))
role_start = next(i for i, l in enumerate(lines) if l.startswith('update credit set role'))

header = lines[0]
data_lines = lines[1:cat_start - 1]
cat_lines = lines[cat_start:person_start - 1]
person_lines = lines[person_start:role_start - 1]
role_lines = lines[role_start:]

data_pattern = re.compile(r"^\('([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']*)'\)([,;])$")
rows = []
for line in data_lines:
    m = data_pattern.match(line)
    if not m:
        raise SystemExit(f"Data line did not match expected shape: {line!r}")
    rows.append(list(m.groups()))  # epid, catcode, personcode, rolecode, credited, punct

update_pattern_tpl = r"^update credit set {col} = '((?:[^']|'')*)' where {col} = '([^']*)';$"


def parse_updates(block_lines, col):
    pattern = re.compile(update_pattern_tpl.format(col=col))
    result = {}
    for line in block_lines:
        m = pattern.match(line)
        if not m:
            raise SystemExit(f"Update line did not match expected shape: {line!r}")
        value, code = m.groups()
        result[code] = (value, line)
    return result


cat_map = parse_updates(cat_lines, 'category')
person_map = parse_updates(person_lines, 'person')
role_map = parse_updates(role_lines, 'role')


def count_codes(rows, field_idx):
    counts = {}
    for row in rows:
        code = row[field_idx]
        counts[code] = counts.get(code, 0) + 1
    return counts


cat_counts = count_codes(rows, 1)
person_counts = count_codes(rows, 2)
role_counts = count_codes(rows, 3)

NEWLINE_BYTES = 2  # CRLF


def decide_reverts(value_map, counts):
    revert = set()
    for code, (value, update_line) in value_map.items():
        n = counts.get(code, 0)
        e = len(value.encode('utf-8'))
        k = len(code.encode('utf-8'))
        update_cost = len(update_line.encode('utf-8')) + NEWLINE_BYTES
        net_change_if_revert = n * (e - k) - update_cost
        if net_change_if_revert < 0:
            revert.add(code)
    return revert


cat_revert = decide_reverts(cat_map, cat_counts)
person_revert = decide_reverts(person_map, person_counts)
role_revert = decide_reverts(role_map, role_counts)

print('category reverts:', len(cat_revert), '/', len(cat_map))
print('person reverts:', len(person_revert), '/', len(person_map))
print('role reverts:', len(role_revert), '/', len(role_map))

new_data_lines = []
for epid, catcode, personcode, rolecode, credited, punct in rows:
    new_cat = cat_map[catcode][0] if catcode in cat_revert else catcode
    new_person = person_map[personcode][0] if personcode in person_revert else personcode
    new_role = role_map[rolecode][0] if rolecode in role_revert else rolecode
    new_data_lines.append(f"('{epid}', '{new_cat}', '{new_person}', '{new_role}', '{credited}'){punct}")

out_lines = [header] + new_data_lines

for value_map, revert, col in ((cat_map, cat_revert, 'category'), (person_map, person_revert, 'person'), (role_map, role_revert, 'role')):
    kept = [line for code, (value, line) in value_map.items() if code not in revert]
    if kept:
        out_lines.append('')
        out_lines.extend(kept)

path.write_text('\n'.join(out_lines), encoding='utf-8')
print('new size:', path.stat().st_size)
