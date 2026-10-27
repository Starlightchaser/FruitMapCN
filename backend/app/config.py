from dataclasses import dataclass, field
from pathlib import Path
import os

ROOT = Path(__file__).resolve().parents[2]
def load_local_env(path: Path) -> None:
    """Read literal KEY=value settings; no shell execution or interpolation."""
    if not path.exists():
        return
    for line in path.read_text(encoding='utf-8-sig').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        key, value = key.strip(), value.strip()
        if key and all(c.isalnum() or c == '_' for c in key):
            if len(value) >= 2 and value[0] == value[-1] and value[0] in ('\"', "'"):
                value = value[1:-1]
            os.environ.setdefault(key, value)


load_local_env(ROOT / '.env')


def flag(name: str, default: str = 'false') -> bool:
    return os.getenv(name, default).lower() == 'true'


@dataclass
class Settings:
    database_url: str = field(default_factory=lambda: os.getenv('DATABASE_URL', 'sqlite:///backend/data/fruit.db'))
    env: str = field(default_factory=lambda: os.getenv('ENV', 'development'))
    private_mode: bool = field(default_factory=lambda: flag('PRIVATE_MODE'))
    session_secret: str = field(default_factory=lambda: os.getenv('SESSION_SECRET', ''))
    password_hash: str = field(default_factory=lambda: os.getenv('PASSWORD_HASH', ''))
    rate_limit: int = field(default_factory=lambda: int(os.getenv('RATE_LIMIT', '180')))
    map_provider: str = field(default_factory=lambda: os.getenv('MAP_PROVIDER', 'disabled'))
    map_key: str = field(default_factory=lambda: os.getenv('MAP_JS_KEY', os.getenv('AMAP_JS_KEY', '')))
    amap_security_code: str = field(default_factory=lambda: os.getenv('AMAP_SECURITY_CODE', ''))
    amap_web_key: str = field(default_factory=lambda: os.getenv('AMAP_WEB_KEY', ''))
    tianditu_key: str = field(default_factory=lambda: os.getenv('TIANDITU_KEY', ''))
    map_review_number: str = field(default_factory=lambda: os.getenv('MAP_REVIEW_NUMBER', ''))
    map_attribution: str = field(default_factory=lambda: os.getenv('MAP_ATTRIBUTION', ''))
    map_publication_approved: bool = field(default_factory=lambda: flag('MAP_PUBLICATION_APPROVED'))
    datav_boundary_path: Path = ROOT / 'backend' / 'assets' / 'maps' / 'datav-china.geojson'
    datav_coordinate_system: str = field(default_factory=lambda: os.getenv('DATAV_COORDINATE_SYSTEM', ''))
    frontend_dist: Path = ROOT / 'frontend' / 'dist'

    @property
    def db_path(self) -> Path:
        if not self.database_url.startswith('sqlite:///'):
            raise ValueError('DATABASE_URL must use sqlite:///')
        path = Path(self.database_url.removeprefix('sqlite:///'))
        return path if path.is_absolute() else ROOT / path

    @property
    def map_configured(self) -> bool:
        return (self.map_provider == 'amap' and bool(self.map_key and self.amap_security_code)) or (self.map_provider == 'tianditu' and bool(self.tianditu_key)) or (self.map_provider == 'datav' and self.datav_boundary_path.is_file())

    def validate(self) -> None:
        if self.map_provider not in ('disabled', 'amap', 'tianditu', 'datav'):
            raise ValueError('Unsupported MAP_PROVIDER')
        if self.datav_coordinate_system not in ('', 'WGS84', 'GCJ02', 'CGCS2000'):
            raise ValueError('DATAV_COORDINATE_SYSTEM must be empty or an explicitly verified datum')
        if self.rate_limit < 1:
            raise ValueError('RATE_LIMIT must be positive')
        if self.private_mode and (len(self.session_secret) < 32 or not self.password_hash.startswith('scrypt$')):
            raise ValueError('PRIVATE_MODE requires a scrypt PASSWORD_HASH and SESSION_SECRET >= 32 characters')
        if self.env == 'production' and not (self.map_configured and self.map_publication_approved and self.map_review_number and self.map_attribution):
            raise ValueError('Production map requires a configured provider, attribution, review number and MAP_PUBLICATION_APPROVED=true after review')
