import re
import unicodedata


def parse_months(label: str) -> list[int]:
    text = unicodedata.normalize('NFKC', str(label or '')).strip()
    if not text or any(word in text for word in ('待补', '未知', '不详')):
        return []
    if '全年' in text:
        return list(range(1, 13))
    text = re.sub(r'\([^)]*\)', '', text).replace('月份', '').replace('月', '')
    text = re.sub(r'[–—~～至到]', '-', text)
    months = set()
    for part in re.split(r'[,，、;；/\s]+', text):
        if not part:
            continue
        m = re.fullmatch(r'(\d{1,2})(?:-(\d{1,2}))?', part)
        if not m:
            raise ValueError(f'无法解析月份：{label}')
        start, end = int(m[1]), int(m[2] or m[1])
        if not (1 <= start <= 12 and 1 <= end <= 12):
            raise ValueError(f'月份超出 1–12：{label}')
        months.update(range(start, end + 1) if start <= end else [*range(start, 13), *range(1, end + 1)])
    return sorted(months)


def month_status(basis: str, months: list[int]) -> str:
    if not months:
        return 'pending'
    if '估' in basis:
        return 'estimated'
    if '已核验' in basis and not any(x in basis for x in ('未核验', '待核验', '尚未核验', '未经核验')):
        return 'verified'
    return 'sourced'
