import csv
import re
from pathlib import Path

source = Path(r'C:\Users\Gove\Box\Atlas\data\data.world\simpsons\data')
base = Path(r'f:\code\pglite\data\excelBook\simpsons')
base.mkdir(parents=True, exist_ok=True)
files = sorted(p for p in source.iterdir() if p.is_file())


def infer_sql_type(values, column_name):
    vals = [v for v in values if v is not None and str(v).strip() != '']
    if not vals:
        return 'text'
    if all(re.fullmatch(r'true|false', str(v).strip(), re.I) for v in vals):
        return 'boolean'
    if all(re.fullmatch(r'[-+]?\d+', str(v).strip()) for v in vals):
        return 'integer'
    if all(re.fullmatch(r'[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?', str(v).strip()) for v in vals):
        return 'double precision'
    if all(re.fullmatch(r'\d{4}-\d{2}-\d{2}', str(v).strip()) for v in vals):
        return 'date'
    if all(re.fullmatch(r'\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?$', str(v).strip()) for v in vals):
        return 'timestamp'
    return 'text'


def sanitize(name):
    name = re.sub(r'[^a-zA-Z0-9_]+', '_', str(name).strip())
    name = re.sub(r'^_+|_+$', '', name)
    if not name:
        name = 'column'
    if re.match(r'\d', name):
        name = '_' + name
    return name.lower()


lines = []
lines.append('-- Generated from CSV files in ' + str(source))
lines.append('-- Run this SQL in PGlite to recreate the tables.')
lines.append('')

for path in files:
    with path.open(newline='', encoding='utf-8') as handle:
        rows = list(csv.reader(handle))
    if not rows:
        continue

    headers = rows[0]
    data_rows = rows[1:]
    table_name = sanitize(path.stem)

    columns = []
    for idx, header in enumerate(headers):
        values = [row[idx] if idx < len(row) else '' for row in data_rows]
        columns.append((sanitize(header or f'column_{idx + 1}'), infer_sql_type(values, header)))

    lines.append(f'drop table if exists {table_name};')
    lines.append(f'create table {table_name} (')
    lines.append(',\n'.join(f'  {name} {ctype}' for name, ctype in columns))
    lines.append(');')
    lines.append('')

    if data_rows:
        insert_rows = []
        for row in data_rows:
            values = []
            for idx, (column_name, column_type) in enumerate(columns):
                raw = row[idx] if idx < len(row) else ''
                if raw is None or str(raw).strip() == '':
                    values.append('NULL')
                elif re.fullmatch(r'true|false', str(raw).strip(), re.I):
                    values.append(str(raw).strip().lower())
                elif re.fullmatch(r'[-+]?\d+', str(raw).strip()):
                    values.append(str(raw).strip())
                elif re.fullmatch(r'[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?', str(raw).strip()):
                    values.append(str(raw).strip())
                else:
                    escaped = str(raw).replace("'", "''")
                    values.append(f"'{escaped}'")
            insert_rows.append('(' + ', '.join(values) + ')')

        col_names = ', '.join(name for name, _ in columns)
        lines.append(f'insert into {table_name} ({col_names}) values')
        lines.append(',\n'.join(insert_rows) + ';')
        lines.append('')

out_path = base / 'create_tables.sql'
out_path.write_text('\n'.join(lines), encoding='utf-8')
print(out_path)
print(out_path.exists(), out_path.stat().st_size)
