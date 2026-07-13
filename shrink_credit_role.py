import re
from pathlib import Path

path = Path(r'f:\code\pglite\data\excelBook\simpsons\data2.sql')
lines = path.read_text(encoding='utf-8').splitlines()

header = lines[0]
data_lines = lines[1:]

# Parses episode_id, category, person(code), and role precisely; the
# credited field + closing punctuation is carried through untouched.
pattern = re.compile(r"^\('([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'((?:[^']|'')*)',\s*(.*)$")

# Printable ASCII (0x21-0x7E) excluding the single quote and backslash.
ALPHABET = ''.join(chr(c) for c in range(0x21, 0x7F) if chr(c) not in ("'", "\\"))


def code_for(i):
    return ALPHABET[i // len(ALPHABET)] + ALPHABET[i % len(ALPHABET)]


parsed = []
roles = set()
unmatched = 0
for line in data_lines:
    m = pattern.match(line)
    if not m:
        unmatched += 1
        parsed.append((None, None, None, None, line))
        continue
    epid, cat, person, role, rest = m.groups()
    roles.add(role)
    parsed.append((epid, cat, person, role, rest))

print('unmatched lines:', unmatched)

sorted_roles = sorted(roles)
if len(sorted_roles) > len(ALPHABET) ** 2:
    raise SystemExit(f"Need more than 2 chars: {len(sorted_roles)} distinct roles")
placeholder_map = {r: code_for(i) for i, r in enumerate(sorted_roles)}

new_lines = [header]
for epid, cat, person, role, rest in parsed:
    if epid is None:
        new_lines.append(rest)
        continue
    code = placeholder_map[role]
    new_lines.append(f"('{epid}', '{cat}', '{person}', '{code}', {rest}")

new_lines.append('')
for role in sorted_roles:
    code = placeholder_map[role]
    new_lines.append(f"update credit set role = '{role}' where role = '{code}';")

path.write_text('\n'.join(new_lines), encoding='utf-8')
print('distinct roles:', len(sorted_roles))
print('new size:', path.stat().st_size)
