import re
from pathlib import Path

path = Path(r'f:\code\pglite\data\excelBook\simpsons\data2.sql')
text = path.read_text(encoding='utf-8')


def to_letter(match):
    n = int(match.group(1))
    return f"'{chr(ord('a') + n - 1)}'"


new_text, count = re.subn(r"'c(\d{2})'", to_letter, text)
path.write_text(new_text, encoding='utf-8')
print('replacements:', count)
print('new size:', path.stat().st_size)
