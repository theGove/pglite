import re
from pathlib import Path

src = Path(r'f:\code\pglite\data\excelBook\simpsons\data2.sql')
out_dir = src.parent

lines = src.read_text(encoding='utf-8').splitlines()

cat_start = next(i for i, l in enumerate(lines) if l.startswith('update credit set category'))
person_start = next(i for i, l in enumerate(lines) if l.startswith('update credit set person'))
role_start = next(i for i, l in enumerate(lines) if l.startswith('update credit set role'))

header = lines[0]
data_lines = lines[1:cat_start - 1]
cat_lines = lines[cat_start:person_start - 1]
person_lines = lines[person_start:role_start - 1]
role_lines = lines[role_start:]


def line_bytes(line):
    return len(line.encode('utf-8')) + 2  # + CRLF


header_bytes = line_bytes(header)
tail_block_bytes = 0
tail_lines = []
for block in (cat_lines, person_lines, role_lines):
    if block:
        tail_block_bytes += 2  # blank separator line (0 chars + CRLF)
        tail_block_bytes += sum(line_bytes(l) for l in block)
        tail_lines.append(block)

total_bytes = header_bytes + sum(line_bytes(l) for l in data_lines) + tail_block_bytes
target = total_bytes / 3

# File C must also carry header + tail blocks, so its data-row budget is
# reduced accordingly, keeping all three files roughly equal in size.
budget_a = target - header_bytes
budget_b = target - header_bytes
budget_c_overhead = header_bytes + tail_block_bytes

n = len(data_lines)
cum = 0
cut_a = n
for i, l in enumerate(data_lines):
    cum += line_bytes(l)
    if cum >= budget_a:
        cut_a = i + 1
        break

cum2 = 0
cut_b = n
for i in range(cut_a, n):
    cum2 += line_bytes(data_lines[i])
    if cum2 >= budget_b:
        cut_b = i + 1
        break

rows_a = data_lines[:cut_a]
rows_b = data_lines[cut_a:cut_b]
rows_c = data_lines[cut_b:]


def terminate(rows):
    """Ensure the row group ends with ';' (a valid, complete statement)."""
    rows = list(rows)
    if rows and rows[-1].endswith(','):
        rows[-1] = rows[-1][:-1] + ';'
    return rows


rows_a = terminate(rows_a)
rows_b = terminate(rows_b)
rows_c = terminate(rows_c)  # already ends with ';' from the original file

out_a = [header] + rows_a
out_b = [header] + rows_b
out_c = [header] + rows_c
for block in (cat_lines, person_lines, role_lines):
    if block:
        out_c.append('')
        out_c.extend(block)

(out_dir / 'data2a.sql').write_text('\n'.join(out_a), encoding='utf-8')
(out_dir / 'data2b.sql').write_text('\n'.join(out_b), encoding='utf-8')
(out_dir / 'data2c.sql').write_text('\n'.join(out_c), encoding='utf-8')

for name in ('data2a.sql', 'data2b.sql', 'data2c.sql'):
    p = out_dir / name
    print(name, p.stat().st_size, 'bytes')
print('row counts:', len(rows_a), len(rows_b), len(rows_c), 'sum', len(rows_a) + len(rows_b) + len(rows_c), 'orig', len(data_lines))
