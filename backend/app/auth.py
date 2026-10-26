import hashlib
import hmac
import secrets
import time
from getpass import getpass
from app.db import connect

COOKIE = 'fruitmap_session'


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
    return f'scrypt${salt}${digest}'


def verify_password(password: str, encoded: str) -> bool:
    try:
        kind, salt, expected = encoded.split('$')
        if kind != 'scrypt':
            return False
        actual = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def token_hash(token: str, secret: str) -> str:
    return hmac.new(secret.encode(), token.encode(), hashlib.sha256).hexdigest()


def authenticated(request, settings) -> bool:
    if not settings.private_mode:
        return True
    token = request.cookies.get(COOKIE)
    if not token:
        return False
    with connect(settings.db_path, readonly=True) as db:
        return db.execute('SELECT 1 FROM sessions WHERE token_hash=? AND expires_at>?', (token_hash(token, settings.session_secret), int(time.time()))).fetchone() is not None


if __name__ == '__main__':
    password = getpass('New password (at least 12 characters): ')
    if len(password) < 12 or password != getpass('Repeat password: '):
        raise SystemExit('Password too short or confirmation differs')
    print('PASSWORD_HASH=' + hash_password(password))
