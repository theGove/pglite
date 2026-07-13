import re
from pathlib import Path

path = Path(r'f:\code\pglite\data\excelBook\simpsons\data2.sql')
lines = path.read_text(encoding='utf-8').splitlines()

header = lines[0]
data_lines = lines[1:]

pattern = re.compile(r"^\('([^']*)',\s*'([^']*)',\s*(.*)$")

categories = set()
parsed = []
for line in data_lines:
    m = pattern.match(line)
    if not m:
        parsed.append((None, None, line))
        continue
    epid, cat, rest = m.groups()
    categories.add(cat)
    parsed.append((epid, cat, rest))

sorted_cats = sorted(categories)
placeholder_map = {cat: f"c{idx + 1:02d}" for idx, cat in enumerate(sorted_cats)}

new_lines = [header]
for epid, cat, rest in parsed:
    if epid is None:
        new_lines.append(rest)
        continue
    placeholder = placeholder_map[cat]
    new_lines.append(f"('{epid}', '{placeholder}', {rest}")

new_lines.append('')
for cat in sorted_cats:
    placeholder = placeholder_map[cat]
    escaped = cat.replace("'", "''")
    new_lines.append(f"update credit set category = '{escaped}' where category = '{placeholder}';")

path.write_text('\n'.join(new_lines), encoding='utf-8')
print('distinct categories:', len(sorted_cats))
for cat in sorted_cats:
    print(placeholder_map[cat], '->', cat)
print('new size:', path.stat().st_size)
