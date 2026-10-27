import { useEffect, useRef, type ReactNode } from 'react';
import { Check, Clock3, ExternalLink, ShieldCheck, X, RefreshCw, ArrowUpRight } from 'lucide-react';
import { safeSource } from './api';
import { useResource } from './hooks';
import { statusLabels, type FruitRecord, type FruitDetail, type MonthStatus } from './types';

export function StatusBadge({ status }: { status: MonthStatus }) {
  return (
    <span className={`badge ${status}`}>
      {status === 'verified' ? (
        <Check size={13} />
      ) : status === 'sourced' ? (
        <ShieldCheck size={13} />
      ) : status === 'pending' ? (
        <Clock3 size={13} />
      ) : (
        <span aria-hidden>≈</span>
      )}
      {statusLabels[status]}
    </span>
  );
}
export function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="error-state" role="alert">
      <p>{message}</p>
      <button className="quiet" onClick={retry}>
        <RefreshCw size={14} />
        重试
      </button>
    </div>
  );
}
export function FruitCard({ record, onClick }: { record: FruitRecord; onClick: () => void }) {
  return (
    <button className="fruit-card" onClick={onClick} aria-label={`查看${record.product_name}详情`}>
      <div className="card-top">
        <span className="category-mark" aria-hidden>
          {record.category.slice(0, 1)}
        </span>
        <span className="category-label">{record.category}</span>
        <ArrowUpRight className="card-arrow" size={16} />
      </div>
      <h3>{record.product_name}</h3>
      {record.variety_name && (
        <p className="variety-name">
          {record.variety_scope?.startsWith('产区')
            ? '产区品种参考'
            : record.variety_scope === '原始名称'
              ? '品种线索'
              : '品种'}{' '}
          · {record.variety_name}
        </p>
      )}
      <p className="origin" title={record.full_origin}>
        {record.full_origin}
      </p>
      <div className="season">{record.month_range_label}</div>
      {record.taste_profile ? (
        <div className="taste-block">
          <p>{record.taste_profile}</p>
          <small>资料描述 · 非批次实测</small>
        </div>
      ) : (
        <p className="taste-empty">口味资料待补</p>
      )}
      <StatusBadge status={record.month_status} />
      <p className="month-note" title={record.month_note}>
        {record.taste_profile && record.month_status === 'estimated'
          ? '月份按类目与产区估算，详情可查看依据。'
          : record.month_note}
      </p>
      <div className="card-source">产地来源 · {record.origin_source_name || '待补充'}</div>
    </button>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`modal ${wide ? 'wide' : ''}`}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const r = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < r.left ||
            event.clientX > r.right ||
            event.clientY < r.top ||
            event.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-header">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="关闭" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
function SourceLink({ label, name, url }: { label: string; name: string; url: string }) {
  const safe = safeSource(url);
  return (
    <div className="detail-field">
      <dt>{label}</dt>
      <dd>
        {safe ? (
          <a href={safe} target="_blank" rel="noopener noreferrer">
            {name || '查看来源'}
            <ExternalLink size={13} />
          </a>
        ) : (
          name || '暂无独立来源'
        )}
      </dd>
    </div>
  );
}
export function Detail({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, loading, error, retry } = useResource<FruitDetail>(`/api/records/${id}`);
  return (
    <Modal title={data?.product_name || '水果详情'} onClose={onClose}>
      {loading ? (
        <div className="skeleton detail-skeleton" />
      ) : error ? (
        <ErrorState message={error} retry={retry} />
      ) : (
        data && (
          <>
            <div className="detail-intro">
              <span className="eyebrow">{data.category}</span>
              <div className="detail-season">{data.month_range_label}</div>
              <StatusBadge status={data.month_status} />
            </div>
            <dl className="detail-list">
              <div className="detail-field">
                <dt>完整产地</dt>
                <dd>{data.full_origin}</dd>
              </div>
              <div className="detail-field">
                <dt>品种</dt>
                <dd>
                  {data.variety_name || '待补充'}
                  {data.variety_name && (
                    <small className="field-note">
                      {data.variety_scope === '原始名称'
                        ? '由原始产品名称提取，未作为外部核验结论。'
                        : data.variety_scope}
                    </small>
                  )}
                </dd>
              </div>
              <div className="detail-field">
                <dt>口味与口感</dt>
                <dd>
                  {data.taste_profile || '暂无可靠资料，暂留空。'}
                  {data.taste_profile && (
                    <small className="field-note">
                      {data.taste_scope}。实际口味受成熟度、气候和栽培影响。
                    </small>
                  )}
                </dd>
              </div>
              {data.variety_name && (
                <SourceLink
                  label="品种依据"
                  name={data.variety_source_name || ''}
                  url={data.variety_source_url || ''}
                />
              )}
              {data.taste_profile && (
                <SourceLink
                  label="口味依据"
                  name={data.taste_source_name || ''}
                  url={data.taste_source_url || ''}
                />
              )}
              {data.checked_at && (
                <div className="detail-field">
                  <dt>资料核对日期</dt>
                  <dd>{data.checked_at}</dd>
                </div>
              )}
              {(data.merged_count || 1) > 1 && (
                <div className="detail-field">
                  <dt>清理说明</dt>
                  <dd>合并 {data.merged_count} 条同镇、同产品且月份依据一致的来源记录。</dd>
                </div>
              )}
              <div className="detail-field">
                <dt>行政区初步解析</dt>
                <dd>
                  {[data.province, data.city, data.county].filter(Boolean).join(' · ') || '待细分'}
                </dd>
              </div>
              <div className="detail-field">
                <dt>月份依据</dt>
                <dd>{data.month_note}</dd>
              </div>
              <SourceLink
                label="产地来源"
                name={data.origin_source_name}
                url={data.origin_source_url}
              />
              <SourceLink
                label="月份来源"
                name={data.month_source_name}
                url={data.month_source_url}
              />
              <div className="detail-field">
                <dt>地图定位</dt>
                <dd>
                  {data.geo_status === 'resolved'
                    ? '已匹配经核验县域中心点'
                    : '县域坐标待核验；省级汇总使用底图自带中心。'}
                </dd>
              </div>
              {data.source_status && (
                <div className="detail-field">
                  <dt>原始记录状态</dt>
                  <dd>{data.source_status}</dd>
                </div>
              )}
              {data.source_note && (
                <div className="detail-field">
                  <dt>底稿历史备注</dt>
                  <dd>
                    {data.source_note}
                    <small className="field-note">
                      描述原始资料的导入情况，不代表当前补充状态。
                    </small>
                  </dd>
                </div>
              )}
            </dl>
            <p className="footnote">
              产地展示最细到乡镇或同级单位；未记载乡镇时保留县级，不猜测村庄所属镇。地方产品名不等于品种名。产地、月份与口味依据分别记录。
            </p>
          </>
        )
      )}
    </Modal>
  );
}
