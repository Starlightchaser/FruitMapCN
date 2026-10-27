from contextlib import contextmanager
from pathlib import Path
import sqlite3


def initialize(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as db:
        if db.execute('PRAGMA user_version').fetchone()[0] > 2:
            raise RuntimeError('Database schema is newer than this application')
        db.execute('PRAGMA journal_mode=WAL')
        db.execute('PRAGMA foreign_keys=ON')
        db.executescript(Path(__file__).with_name('schema.sql').read_text(encoding='utf-8'))


@contextmanager
def connect(path: Path, readonly: bool = False):
    db = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True, timeout=10) if readonly else sqlite3.connect(path, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    try:
        yield db
        if not readonly:
            db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
