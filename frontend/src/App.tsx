import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Info,
  Leaf,
  LogOut,
  Search,
  SlidersHorizontal,
  Sprout,
  X,
} from 'lucide-react';
import { request, query } from './api';
import { useResource } from './hooks';
import { Detail, ErrorState, FruitCard, Modal } from './components';
import { MapPanel } from './MapPanel';
import {
  emptyFilters,
  statusLabels,
  type FilterState,
  type FilterOptions,
  type RecordPage,
  type Summary,
  type MapPoints,
  type PublicConfig,
} from './types';

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await request('/api/auth/login', undefined, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      onLogin();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <form className="login-panel panel" onSubmit={submit}>
        <span className="brand-icon">
          <Sprout size={28} />
        </span>
        <p className="eyebrow">FRUITMAP · PRIVATE</p>
        <h1>国产水果赏味地图</h1>
        <p>输入访问密码，继续探索产地与时令。</p>
        <label htmlFor="password">访问密码</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p role="alert">{error}</p>}
        <button className="primary" disabled={busy}>
          {busy ? '正在登录…' : '进入地图'}
        </button>
      </form>
    </main>
  );
}

function Atlas({ privateMode, onLogout }: { privateMode: boolean; onLogout: () => void }) {
  const [filters, setFilters] = useState<FilterState>({ ...emptyFilters });
  const [search, setSearch] = useState(''),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(24),
    [sort, setSort] = useState('discovery');
  const [more, setMore] = useState(false),
    [info, setInfo] = useState<'about' | 'help' | null>(null),
    [detail, setDetail] = useState<number | null>(null);
  const options = useResource<FilterOptions>('/api/filters');
  const config = useResource<PublicConfig>('/api/config');
  const list = useResource<RecordPage>(
    `/api/records?${query(filters, { page, page_size: pageSize, sort })}`,
  );
  const summary = useResource<Summary>(`/api/summary?${query(filters)}`);
  const points = useResource<MapPoints>(`/api/map-points?${query(filters)}`);
  function update(change: Partial<FilterState>) {
    setFilters((old) => ({ ...old, ...change }));
    setPage(1);
  }
  function reset() {
    setFilters({ ...emptyFilters });
    setSearch('');
    setPage(1);
  }
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((old) => (old.q === search.trim() ? old : { ...old, q: search.trim() }));
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const active =
    filters.month !== null ||
    !!filters.category ||
    !!filters.province ||
    !!filters.county ||
    !!filters.month_status ||
    !!filters.taste ||
    !!filters.q;
  const counties =
    options.data?.counties.filter((c) => !filters.province || c.province === filters.province) ||
    [];
  const count = summary.data?.total;
  const currentScope = filters.county || filters.province || '全国';
  const pageCount = list.data?.total_pages || 0;
  const pages = Array.from(
    new Set([
      1,
      ...Array.from({ length: 5 }, (_, i) => page + i - 2).filter((p) => p >= 1 && p <= pageCount),
      pageCount,
    ]),
  ).filter((p) => p > 0);
  return (
    <div className="app-shell">
      <header className="page-header">
        <div className="brand">
          <span className="brand-icon">
            <Sprout size={30} strokeWidth={1.6} />
          </span>
          <div>
            <div className="brand-title">
              <h1>国产水果赏味地图</h1>
              <span>FruitMap</span>
            </div>
            <p>跟随月份，发现不同产区的时令果实</p>
          </div>
        </div>
        <nav aria-label="页面帮助">
          <button className="quiet" onClick={() => setInfo('about')}>
            <Info size={15} />
            关于数据
          </button>
          <button className="quiet" onClick={() => setInfo('help')}>
            <BookOpen size={15} />
            使用说明
          </button>
          {privateMode && (
            <button
              className="quiet"
              onClick={async () => {
                await request('/api/auth/logout', undefined, { method: 'POST' });
                onLogout();
              }}
            >
              <LogOut size={15} />
              退出
            </button>
          )}
        </nav>
      </header>

      <section className="filter-panel glass" aria-label="水果筛选">
        <div className="month-row">
          <span className="filter-caption">选择月份</span>
          <div className="months" role="group" aria-label="上市月份">
            {[0, ...Array.from({ length: 12 }, (_, i) => i + 1)].map((month) => (
              <button
                key={month}
                className={(filters.month || 0) === month ? 'active' : ''}
                aria-pressed={(filters.month || 0) === month}
                onClick={() => update({ month: month || null })}
              >
                {month ? `${month}月` : '全年'}
              </button>
            ))}
          </div>
          <span className="season-hint">
            <Leaf size={14} />
            顺时而食
          </span>
        </div>
        <div className="filter-row">
          <label>
            水果类目
            <select
              aria-label="水果类目"
              value={filters.category}
              onChange={(e) => update({ category: e.target.value })}
            >
              <option value="">全部水果</option>
              {options.data?.categories.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            省份 / 产区
            <select
              aria-label="省份或产区"
              value={filters.province}
              onChange={(e) => update({ province: e.target.value, county: '' })}
            >
              <option value="">全国产区</option>
              {options.data?.provinces.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            县域（初步解析）
            <select
              aria-label="县域"
              value={filters.county ? JSON.stringify([filters.province, filters.county]) : ''}
              onChange={(e) => {
                if (e.target.value) {
                  const [province, county] = JSON.parse(e.target.value);
                  update({ province, county });
                } else update({ county: '' });
              }}
            >
              <option value="">全部县域</option>
              {counties.map((c) => (
                <option
                  key={JSON.stringify([c.province, c.county])}
                  value={JSON.stringify([c.province, c.county])}
                >
                  {c.county} · {c.province}
                </option>
              ))}
            </select>
          </label>
          <label className="search-label">
            关键词
            <span className="search-box">
              <Search size={17} />
              <input
                type="search"
                aria-label="搜索水果或产地"
                placeholder="搜索水果、品种或产地…"
                value={search}
                maxLength={120}
                onChange={(e) => setSearch(e.target.value)}
              />
            </span>
          </label>
          <button
            className={`filter-more ${more || filters.month_status ? 'selected' : ''}`}
            aria-expanded={more}
            onClick={() => setMore((value) => !value)}
          >
            <SlidersHorizontal size={15} />
            更多筛选{filters.month_status && <span className="filter-dot" />}
          </button>
        </div>
        {more && (
          <div className="advanced">
            <span>月份依据</span>
            <div role="group" aria-label="月份状态">
              {(['', 'verified', 'sourced', 'estimated', 'pending'] as const).map((status) => (
                <button
                  key={status}
                  className={filters.month_status === status ? 'active' : ''}
                  aria-pressed={filters.month_status === status}
                  onClick={() => update({ month_status: status })}
                >
                  {status ? statusLabels[status] : '全部状态'}
                </button>
              ))}
            </div>
            <p>估算区间仅作时令线索，不等同于当地成熟期核验。</p>
          </div>
        )}
        {options.error && <ErrorState message="筛选选项未能加载" retry={options.retry} />}
      </section>

      <div className="section-context">
        <div>
          <span className="eyebrow">EXPLORE THE SEASON</span>
          <h2>{filters.month ? `${filters.month}月的水果产地` : '把时令，放回产地'}</h2>
        </div>
        <span className="scope">
          {currentScope}
          <ChevronRight size={13} />
          {filters.month ? `${filters.month}月` : '全年'}
          {active && (
            <button onClick={reset}>
              <X size={13} />
              清除筛选
            </button>
          )}
        </span>
      </div>

      <main className="overview-grid">
        <MapPanel
          config={config.data?.map || null}
          points={points.data}
          month={filters.month}
          total={count}
          county={filters.county}
          province={filters.province}
          onProvince={(province) => update({ province, county: '' })}
          onSelect={(point) => update({ province: point.province, county: point.county })}
          error={points.error || config.error}
          retry={() => {
            points.retry();
            config.retry();
          }}
        />
        <aside className="summary-column">
          <section className="summary-panel panel" aria-label="当前筛选结果">
            <div className="panel-title">
              <h2>当前筛选结果</h2>
              <span>
                {filters.month ? `${filters.month}月` : '全年'} · {currentScope}
              </span>
            </div>
            {summary.error ? (
              <ErrorState message={summary.error} retry={summary.retry} />
            ) : (
              <>
                <div className="kpis" aria-live="polite">
                  {[
                    { value: summary.data?.total, label: '条水果记录' },
                    { value: summary.data?.categories, label: '个水果类目' },
                    { value: summary.data?.counties, label: '个初步解析县域' },
                    { value: summary.data?.estimated, label: '条月份估算' },
                  ].map((kpi) => (
                    <div key={kpi.label}>
                      <strong>{kpi.value === undefined ? '—' : kpi.value.toLocaleString()}</strong>
                      <span>{kpi.label}</span>
                    </div>
                  ))}
                </div>
                <div className="distribution">
                  <div className="subheading">
                    <h3>水果类目分布</h3>
                    <span>前 8 类</span>
                  </div>
                  {summary.loading ? (
                    <div className="skeleton summary-skeleton" />
                  ) : summary.data?.distribution.length ? (
                    summary.data.distribution.map((item) => (
                      <button
                        key={item.category}
                        className="distribution-row"
                        onClick={() => update({ category: item.category })}
                      >
                        <span>{item.category}</span>
                        <span className="bar-track">
                          <span
                            style={{
                              width: `${(item.count / (summary.data?.distribution[0]?.count || 1)) * 100}%`,
                            }}
                          />
                        </span>
                        <span>{item.count}</span>
                      </button>
                    ))
                  ) : (
                    <p className="muted">当前条件下没有记录</p>
                  )}
                </div>
              </>
            )}
          </section>
          <section className="data-note panel">
            <span className="eyebrow">
              <ShieldLeaf />
              READ WITH CONTEXT
            </span>
            <h3>每一段月份，都有它的依据</h3>
            <p>区分已核验、已有来源与估算，让时令信息在使用中逐步完善。</p>
            <div className="maturity">
              <span>
                <i className="verified-dot" />
                已核验 <b>{summary.data?.verified ?? '—'}</b>
              </span>
              <span>
                <i className="sourced-dot" />
                有来源 <b>{summary.data?.sourced ?? '—'}</b>
              </span>
              <span>
                <i className="estimated-dot" />
                估算 <b>{summary.data?.estimated ?? '—'}</b>
              </span>
              <span>
                <i className="pending-dot" />
                待补 <b>{summary.data?.pending ?? '—'}</b>
              </span>
            </div>
            <button className="text-link" onClick={() => setInfo('about')}>
              了解数据口径
              <ArrowRight size={14} />
            </button>
          </section>
        </aside>
      </main>

      <section className="discovery-strip panel" aria-label="赏味探索">
        <div className="discovery-intro">
          <span className="eyebrow">TASTE SOMETHING DIFFERENT</span>
          <h3>今天，想吃哪一种口感？</h3>
          <p>先找口感，再沿着地图认识产地。资料不足的水果继续保留，等有依据再补充。</p>
        </div>
        <div className="discovery-actions">
          <button
            className="primary"
            onClick={() => {
              setFilters({
                ...emptyFilters,
                month: new Date().getMonth() + 1,
                taste: 'documented',
              });
              setSearch('');
              setSort('discovery');
              setPage(1);
            }}
          >
            本月尝鲜 <ArrowRight size={14} />
          </button>
          <button
            className="quiet"
            onClick={() => {
              setFilters({ ...emptyFilters, taste: 'documented' });
              setSearch('');
              setSort('discovery');
              setPage(1);
            }}
          >
            全年风味
          </button>
        </div>
        <div className="taste-filters" role="group" aria-label="口味偏好">
          {[
            ['', '全部口味'],
            ['documented', '有口味资料'],
            ['清甜', '清甜'],
            ['酸甜', '酸甜'],
            ['浓甜', '浓甜'],
            ['脆爽', '脆爽'],
            ['软糯', '软糯'],
            ['浓香', '香气明显'],
          ].map(([value, label]) => (
            <button
              key={value}
              className={filters.taste === value ? 'active' : ''}
              aria-pressed={filters.taste === value}
              onClick={() => update({ taste: value })}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="records-section" aria-label="水果记录">
        <div className="records-toolbar">
          <div>
            <h2>
              水果记录 <span>{list.data ? `(${list.data.total})` : ''}</span>
            </h2>
            <p>{active ? '当前筛选下的水果与产地' : '从一颗水果，认识一片产地'}</p>
            {summary.data && (
              <p className="curation-coverage">
                当前有 {summary.data.variety_records ?? 0} 条品种资料 ·{' '}
                {summary.data.taste_records ?? 0} 条口味资料
              </p>
            )}
          </div>
          <label className="sort-label">
            <span className="visually-hidden">排序</span>
            <select
              aria-label="排序"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
            >
              <option value="discovery">优先看有资料的</option>
              <option value="default">按类目排序</option>
              <option value="name">按产品名排序</option>
              <option value="status">按月份依据排序</option>
              <option value="updated">最近更新</option>
            </select>
          </label>
        </div>
        {list.error ? (
          <ErrorState message={list.error} retry={list.retry} />
        ) : list.loading ? (
          <div className="records-grid" aria-label="正在加载水果记录">
            {Array.from({ length: 8 }, (_, i) => (
              <div className="fruit-card skeleton card-skeleton" key={i} />
            ))}
          </div>
        ) : list.data?.items.length ? (
          <>
            <div className="records-grid">
              {list.data.items.map((record) => (
                <FruitCard key={record.id} record={record} onClick={() => setDetail(record.id)} />
              ))}
            </div>
            <div className="pagination">
              <span>
                第 {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, list.data.total)} 条，共{' '}
                {list.data.total} 条
              </span>
              <nav aria-label="记录分页">
                <button
                  aria-label="上一页"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ArrowLeft size={15} />
                </button>
                {pages.map((value, index) => (
                  <span key={value}>
                    {index > 0 && value - pages[index - 1] > 1 && (
                      <span className="ellipsis">…</span>
                    )}
                    <button
                      aria-label={`第${value}页`}
                      aria-current={page === value ? 'page' : undefined}
                      className={page === value ? 'active' : ''}
                      onClick={() => setPage(value)}
                    >
                      {value}
                    </button>
                  </span>
                ))}
                <button
                  aria-label="下一页"
                  disabled={page >= pageCount}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ArrowRight size={15} />
                </button>
              </nav>
              <label>
                每页
                <select
                  aria-label="每页记录数"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  <option value={12}>12 条</option>
                  <option value={24}>24 条</option>
                  <option value={30}>30 条</option>
                </select>
              </label>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <Search size={28} />
            <h3>暂时没有匹配的水果</h3>
            <p>试试其他月份、类目或产区。</p>
            <button className="quiet" onClick={reset}>
              重置全部筛选
            </button>
          </div>
        )}
      </section>
      <footer className="page-footer">
        <span>
          <Sprout size={15} />
          FruitMap · 国产水果赏味地图
        </span>
        <span>时令会因气候、品种与栽培方式变化，请结合当地实际信息。</span>
      </footer>
      {detail !== null && <Detail id={detail} onClose={() => setDetail(null)} />}
      {info && (
        <Modal title={info === 'about' ? '关于数据' : '使用说明'} onClose={() => setInfo(null)}>
          {info === 'about' ? (
            <div className="prose">
              <p>
                数据以最终版水果产地月份数据库为底稿。每条记录表示一个水果产品或品种与一个产地的关联，网页产地最细到乡镇；同镇、同产品且月份依据一致的重复项合并展示，原始资料保留在维护库中。
              </p>
              <h3>月份依据</h3>
              <p>
                <Check size={14} />{' '}
                已核验：有明确核验记录。有来源：沿用具体来源，仍可继续复核。估算：按水果类别与产区粗估；卡片会显示依据。待补：暂无可用月份，不参与具体月份筛选。
              </p>
              <h3>产地与地图</h3>
              <p>
                地图按省汇总，每省一个气泡，数字代表当前筛选下的水果记录数。气泡依据省级中心定位，不代表果园位置。省份名称尚未可靠归属的记录仍在清单展示。
              </p>
              <p>
                地方产品名不等于品种名。品种与口味单独补充依据；“原始名称”表示从主表名称提取，“品种参考”不代表某个镇或某一批次的实测。查不清的留空，不按水果大类批量补写口味。暂不提供水果图片和价格。
              </p>
            </div>
          ) : (
            <div className="prose">
              <p>① 选择全年或某个月，查看对应上市区间的水果。</p>
              <p>② 用类目、产区、县域和关键词缩小范围。“更多筛选”可以按月份依据筛选。</p>
              <p>
                ③
                悬停省级气泡查看记录数和月份依据，点击气泡即可筛选该省。可拖动地图、滚轮缩放，或点击复位按钮查看全国。
              </p>
              <p>
                ④ 点击水果卡片查看完整产地、月份说明与来源链接。页面只加载当前页，切换分页继续浏览。
              </p>
              <p>⑤ 点击“清除筛选”恢复全年全国结果。</p>
              <p>
                ⑥
                “本月尝鲜”查看全国当月有口味资料的记录；口味标签会同时筛选地图、统计和清单。月份是上市区间，不表示当前一定可买到或处于最佳赏味期。
              </p>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
function ShieldLeaf() {
  return <Leaf size={13} />;
}
export default function App() {
  const auth = useResource<{ private_mode: boolean; authenticated: boolean }>('/api/auth/status');
  useEffect(() => {
    const handler = () => auth.retry();
    window.addEventListener('fruitmap:unauthorized', handler);
    return () => window.removeEventListener('fruitmap:unauthorized', handler);
  }, [auth.retry]);
  if (auth.loading)
    return (
      <div className="startup">
        <Sprout size={32} />
        <p>正在打开水果地图…</p>
      </div>
    );
  if (auth.error)
    return (
      <div className="startup">
        <ErrorState message={auth.error} retry={auth.retry} />
      </div>
    );
  if (!auth.data?.authenticated) return <LoginScreen onLogin={auth.retry} />;
  return <Atlas privateMode={auth.data.private_mode} onLogout={auth.retry} />;
}
