from collections import defaultdict, deque
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Literal, Optional
import logging
import secrets
import time
import httpx
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel, Field
from app.config import Settings
from app.db import initialize, connect
from app.auth import COOKIE, authenticated, token_hash, verify_password
from app.queries import Filters, records, summary, map_points, DETAIL_FIELDS


def get_filters(
    month: Annotated[Optional[int], Query(ge=1, le=12)] = None,
    category: Annotated[str, Query(max_length=120)] = '',
    province: Annotated[str, Query(max_length=120)] = '',
    county: Annotated[str, Query(max_length=120)] = '',
    county_code: Annotated[str, Query(max_length=12)] = '',
    month_status: Literal['', 'verified', 'sourced', 'estimated', 'pending'] = '',
    q: Annotated[str, Query(max_length=120)] = '',
    taste: Literal['', 'documented', '清甜', '酸甜', '浓甜', '脆爽', '软糯', '浓香'] = '',
) -> Filters:
    return Filters(month, category, province, county, county_code, month_status, q, taste)


class Login(BaseModel):
    password: str = Field(min_length=1, max_length=256)


def create_app(settings: Optional[Settings] = None) -> FastAPI:
    config = settings or Settings()

    @asynccontextmanager
    async def lifespan(app):
        config.validate()
        initialize(config.db_path)
        if not config.map_configured:
            logging.warning('Map provider is not configured. No fallback national boundary will be loaded.')
        yield

    app = FastAPI(title='FruitMap', lifespan=lifespan, docs_url='/docs' if config.env != 'production' else None, redoc_url=None, openapi_url='/openapi.json' if config.env != 'production' else None)
    app.state.settings = config
    buckets = defaultdict(deque)

    @app.middleware('http')
    async def guard(request: Request, call_next):
        path = request.url.path
        protected = path.startswith(('/api/', '/_AMapService/'))
        public = path in ('/api/health', '/api/auth/status', '/api/auth/login')
        if protected:
            now = time.monotonic()
            ip = request.client.host if request.client else 'unknown'
            login = path == '/api/auth/login'
            key = (ip, 'login' if login else 'api')
            # Bound memory by removing expired buckets before accepting a new client.
            if key not in buckets:
                for old in [k for k,v in buckets.items() if not v or v[-1] < now - 60]:
                    del buckets[old]
                if len(buckets) >= 10000:
                    return JSONResponse({'detail':'请求过多，请稍后重试'}, 429, headers={'Retry-After':'60'})
            bucket = buckets[key]
            while bucket and bucket[0] <= now - 60:
                bucket.popleft()
            if len(bucket) >= (5 if login else config.rate_limit):
                return JSONResponse({'detail':'请求过多，请稍后重试'}, 429, headers={'Retry-After':'60'})
            bucket.append(now)
            if request.method not in ('GET', 'HEAD', 'OPTIONS') and request.headers.get('origin') not in (None, str(request.base_url).rstrip('/')):
                return JSONResponse({'detail':'不允许跨站请求'}, 403)
            if not public and not authenticated(request, config):
                return JSONResponse({'detail':'请先登录'}, 401)
        response = await call_next(request)
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response.headers['X-Frame-Options'] = 'DENY'
        if protected:
            response.headers['Cache-Control'] = 'no-store'
        return response

    @app.get('/api/health')
    def health():
        return {'status':'ok'}

    @app.get('/api/auth/status')
    def auth_status(request: Request):
        return {'private_mode':config.private_mode, 'authenticated':authenticated(request, config)}

    @app.post('/api/auth/login')
    def login(body: Login):
        if not config.private_mode:
            return {'authenticated':True}
        if not verify_password(body.password, config.password_hash):
            raise HTTPException(401, '密码不正确')
        token = secrets.token_urlsafe(32)
        with connect(config.db_path) as db:
            db.execute('DELETE FROM sessions WHERE expires_at<=?', (int(time.time()),))
            db.execute('INSERT INTO sessions VALUES (?,?)', (token_hash(token, config.session_secret), int(time.time()) + 8 * 3600))
        response = JSONResponse({'authenticated':True})
        response.set_cookie(COOKIE, token, max_age=8*3600, httponly=True, secure=config.env == 'production', samesite='strict')
        return response

    @app.post('/api/auth/logout')
    def logout(request: Request):
        with connect(config.db_path) as db:
            db.execute('DELETE FROM sessions WHERE token_hash=?', (token_hash(request.cookies.get(COOKIE,''), config.session_secret),))
        response = JSONResponse({'authenticated':False})
        response.delete_cookie(COOKIE)
        return response

    @app.get('/api/config')
    def public_config():
        return {'map':dict(provider=config.map_provider, configured=config.map_configured,
            js_key=(config.tianditu_key if config.map_provider == 'tianditu' else config.map_key if config.map_provider == 'amap' else '') if config.map_configured else '', attribution=config.map_attribution,
            coordinate_system=config.datav_coordinate_system if config.map_provider == 'datav' else '',
            review_number=config.map_review_number, publication_approved=config.map_publication_approved), 'environment':config.env}

    @app.get('/api/map-boundary')
    def map_boundary():
        if config.map_provider != 'datav' or not config.datav_boundary_path.is_file():
            raise HTTPException(404, 'DataV 边界文件尚未配置')
        return FileResponse(config.datav_boundary_path, media_type='application/geo+json')

    @app.get('/api/filters')
    def filters(province: Annotated[str, Query(max_length=120)] = ''):
        with connect(config.db_path, True) as db:
            return {
                'categories':[r[0] for r in db.execute('SELECT DISTINCT category FROM fruit_catalog ORDER BY category')],
                'provinces':[r[0] for r in db.execute("SELECT DISTINCT province FROM fruit_catalog WHERE province!='' ORDER BY province")],
                'counties':[dict(r) for r in db.execute("SELECT province,county,COUNT(*) count FROM fruit_catalog WHERE county!='' AND (?='' OR province=?) GROUP BY province,county ORDER BY province,county", (province,province))],
                'statuses':[dict(r) for r in db.execute('SELECT month_status,COUNT(*) count FROM fruit_catalog GROUP BY month_status')]
            }

    @app.get('/api/records')
    def list_records(filters: Annotated[Filters, Depends(get_filters)], page: Annotated[int, Query(ge=1, le=100000)] = 1, page_size: Annotated[int, Query(ge=1)] = 24, sort: Literal['default','discovery','name','updated','status'] = 'default'):
        with connect(config.db_path, True) as db:
            return records(db, filters, page, min(30, page_size), sort)

    @app.get('/api/summary')
    def get_summary(filters: Annotated[Filters, Depends(get_filters)]):
        with connect(config.db_path, True) as db:
            return summary(db, filters)

    @app.get('/api/map-points')
    def get_map_points(filters: Annotated[Filters, Depends(get_filters)]):
        with connect(config.db_path, True) as db:
            return map_points(db, filters)

    @app.get('/api/records/{record_id}')
    def detail(record_id: int):
        with connect(config.db_path, True) as db:
            row = db.execute(f'SELECT {DETAIL_FIELDS} FROM fruit_catalog WHERE id=?', (record_id,)).fetchone()
            if row is None:
                raise HTTPException(404, '记录不存在')
            result = dict(row)
            result['months'] = [r[0] for r in db.execute('SELECT month FROM fruit_record_months WHERE record_id=? ORDER BY month', (record_id,))]
            return result

    @app.get('/_AMapService/{proxy_path:path}')
    async def amap_proxy(proxy_path: str, request: Request):
        # Fixed upstream and allowlist: this route cannot be used as an arbitrary proxy.
        if not config.map_configured or config.map_provider != 'amap':
            raise HTTPException(503, '地图尚未配置')
        hosts = {'v4/map/styles':'webapi.amap.com', 'v3/vectormap':'fmap01.amap.com', '':'restapi.amap.com'}
        host = next((h for p,h in hosts.items() if p and proxy_path.startswith(p)), None)
        if host is None and proxy_path == 'v3/log/init':
            host = 'restapi.amap.com'
        if host is None or '..' in proxy_path:
            raise HTTPException(404)
        params = dict(request.query_params)
        params['jscode'] = config.amap_security_code
        try:
            async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
                upstream = await client.get(f'https://{host}/{proxy_path}', params=params)
            if upstream.status_code != 200:
                raise HTTPException(502, '地图服务暂不可用')
            return Response(upstream.content, media_type=upstream.headers.get('content-type', 'application/octet-stream'))
        except httpx.HTTPError:
            raise HTTPException(502, '地图服务暂不可用') from None

    @app.get('/{path:path}', include_in_schema=False)
    def frontend(path: str):
        dist = config.frontend_dist.resolve()
        candidate = (dist / path).resolve()
        if path.startswith(('api/', 'docs/', 'data/', 'backend/', 'frontend/', '_AMapService/')) or any(p.startswith('.') for p in Path(path).parts):
            raise HTTPException(404)
        if not candidate.is_relative_to(dist):
            raise HTTPException(404)
        if candidate.is_file() and candidate.suffix.lower() in ('.html','.js','.css','.svg','.png','.ico','.woff2'):
            return FileResponse(candidate)
        if path and Path(path).suffix:
            raise HTTPException(404)
        if (dist / 'index.html').is_file():
            return FileResponse(dist / 'index.html')
        raise HTTPException(404, '前端尚未构建，请启动 Vite 或先构建前端')

    return app


app = create_app()
