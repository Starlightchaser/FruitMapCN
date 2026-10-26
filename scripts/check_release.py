"""Audit the staged Git tree or a source ZIP before publishing. No business data."""
import argparse
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
ROOT_FILES = {
    '.editorconfig', '.env.example', '.gitignore', '.gitattributes', 'AGENTS.md',
    'README.md', 'CMD-GUIDE.md', 'CHANGELOG.md', 'Start-FruitMap.cmd', 'Start-FruitMap.ps1',
}
DOCS = {'USER-GUIDE.md', 'DATA-MANAGEMENT.md', 'DEVELOPMENT.md', 'MAP-NOTES.md'}
SHOTS = {'01-overview.jpg', '02-season.jpg', '03-detail.jpg', '04-national.jpg'}


def allowed(path):
    parts = PurePosixPath(path).parts
    if not parts or '..' in parts or path.startswith('/') or '\\' in path:
        return False
    if re.search(r'\.(db(?:-\w+)?|sqlite\w*|xlsx?|docx?|csv|zip)$', path, re.I):
        return path == 'data/county-locations.example.csv'
    if any(p in {'.git', '.venv', 'node_modules', 'dist', '__pycache__', '.pytest_cache'}
           or p.endswith('.egg-info') for p in parts):
        return False
    if path in ROOT_FILES:
        return True
    if path in {'data/imports/.gitkeep', 'data/curation/evidence.example.json',
                'data/county-locations.example.csv'}:
        return True
    if len(parts) == 2 and parts[0] == 'docs':
        return parts[1] in DOCS
    if len(parts) == 3 and parts[:2] == ('docs', 'screenshots'):
        return parts[2] in SHOTS
    if path in {'backend/pyproject.toml', 'backend/requirements.lock.txt',
                'backend/assets/maps/datav-china.geojson', 'backend/assets/maps/datav-china.source.json'}:
        return True
    if parts[0] == 'backend' and len(parts) > 2 and parts[1] in {'app', 'tests'}:
        return path.endswith(('.py', '.sql'))
    if parts[0] == 'frontend':
        if len(parts) > 2 and parts[1] == 'src':
            return path.endswith(('.ts', '.tsx', '.mjs', '.css'))
        return len(parts) == 2 and parts[1] in {
            'index.html', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
            '.npmrc', '.prettierrc.json', 'tsconfig.json', 'vite.config.ts',
        }
    return len(parts) == 2 and parts[0] == 'scripts' and path.endswith('.py')


def inspect(entries):
    errors = []
    for path, content in entries:
        if not allowed(path):
            errors.append('Disallowed release path: ' + path)
            continue
        if path == 'data/curation/evidence.example.json':
            if json.loads(content) != {'records': [], 'profiles': [], 'name_extractions': {}}:
                errors.append('Evidence example must stay empty')
        if path.endswith(('.png', '.jpg', '.geojson')):
            continue
        value = content.decode('utf-8-sig')
        if re.search(r'(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)', value):
            errors.append('Potential credential in: ' + path)
        if re.search(r'[A-Za-z]:[\\/]Users[\\/]', value):
            errors.append('Personal workstation path in: ' + path)
        if path == '.env.example':
            for line in value.splitlines():
                if '=' in line and not line.lstrip().startswith('#'):
                    key, setting = line.split('=', 1)
                    if (key.endswith('_KEY') or key in {'SESSION_SECRET', 'PASSWORD_HASH', 'AMAP_SECURITY_CODE'}) and setting.strip():
                        errors.append('Secret value in environment example: ' + key)
    if errors:
        raise SystemExit('\n'.join(errors))
    print(f'Release audit passed: {len(entries)} files; no business-data paths or detected credentials.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path)
    args = parser.parse_args()
    if args.archive:
        with zipfile.ZipFile(args.archive) as archive:
            names = [i.filename for i in archive.infolist() if not i.is_dir()]
            prefix = 'FruitMapCN-v0.1.0/'
            entries = [(name[len(prefix):] if name.startswith(prefix) else name, archive.read(name)) for name in names]
    else:
        paths = subprocess.check_output(['git', 'ls-files', '--cached', '-z'], cwd=ROOT).decode().split('\0')
        entries = [(p, subprocess.check_output(['git', 'show', ':' + p], cwd=ROOT)) for p in paths if p]
    if not entries:
        raise SystemExit('Nothing to publish')
    inspect(entries)


if __name__ == '__main__':
    main()
