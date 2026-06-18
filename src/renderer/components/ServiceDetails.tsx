import type { Service } from '@shared/types'
import { RiskBadge } from './RiskBadge'

interface ServiceDetailsProps {
  service: Service | null
  onEdit: (service: Service) => void
  onOpenUrl: (url: string) => void
  onCopyUrl: (url: string) => void
  onIgnore: (service: Service) => void
  onUnignore: (service: Service) => void
  onKill: (service: Service) => void
}

export function ServiceDetails({
  service,
  onEdit,
  onOpenUrl,
  onCopyUrl,
  onIgnore,
  onUnignore,
  onKill
}: ServiceDetailsProps): JSX.Element {
  if (!service) {
    return (
      <aside className="details-panel details-panel--empty">
        <p>Select a service to view details.</p>
      </aside>
    )
  }

  return (
    <aside className="details-panel">
      <header className="details-panel__header">
        <h2>{service.label ?? service.typeLabel}</h2>
        <RiskBadge level={service.riskLevel} reason={service.riskReason} />
      </header>

      <dl className="details-list">
        <div>
          <dt>Port</dt>
          <dd>{service.port}</dd>
        </div>
        <div>
          <dt>Protocol</dt>
          <dd>{service.protocol.toUpperCase()}</dd>
        </div>
        <div>
          <dt>Address</dt>
          <dd>{service.address}</dd>
        </div>
        <div>
          <dt>Process</dt>
          <dd>{service.processName ?? '—'}</dd>
        </div>
        <div>
          <dt>PID</dt>
          <dd>{service.pid ?? '—'}</dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>
            {service.typeLabel} ({service.typeConfidence} confidence)
          </dd>
        </div>
        <div>
          <dt>Project</dt>
          <dd>{service.project ?? '—'}</dd>
        </div>
        <div>
          <dt>Local URL</dt>
          <dd>{service.localUrl ?? '—'}</dd>
        </div>
        <div>
          <dt>Risk</dt>
          <dd>{service.riskReason}</dd>
        </div>
        {service.httpProbe?.reachable && (
          <>
            <div>
              <dt>HTTP Status</dt>
              <dd>{service.httpProbe.statusCode ?? '—'}</dd>
            </div>
            <div>
              <dt>Server</dt>
              <dd>{service.httpProbe.serverHeader ?? '—'}</dd>
            </div>
            <div>
              <dt>Title</dt>
              <dd>{service.httpProbe.title ?? '—'}</dd>
            </div>
          </>
        )}
        {service.notes && (
          <div>
            <dt>Notes</dt>
            <dd>{service.notes}</dd>
          </div>
        )}
      </dl>

      <div className="details-panel__actions">
        {service.localUrl && (
          <>
            <button type="button" className="btn btn--primary" onClick={() => onOpenUrl(service.localUrl!)}>
              Open URL
            </button>
            <button type="button" className="btn" onClick={() => onCopyUrl(service.localUrl!)}>
              Copy URL
            </button>
          </>
        )}
        <button type="button" className="btn" onClick={() => onEdit(service)}>
          Edit label/project
        </button>
        {service.pid !== null && (
          <button type="button" className="btn btn--danger" onClick={() => onKill(service)}>
            Kill process
          </button>
        )}
        {service.ignored ? (
          <button type="button" className="btn" onClick={() => onUnignore(service)}>
            Unignore
          </button>
        ) : (
          <button type="button" className="btn btn--danger" onClick={() => onIgnore(service)}>
            Ignore
          </button>
        )}
      </div>
    </aside>
  )
}
