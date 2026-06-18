import type { Service } from '@shared/types'

interface ServiceTableProps {
  services: Service[]
  selectedKey: string | null
  onSelect: (service: Service) => void
  onOpenUrl: (url: string) => void
}

export function ServiceTable({
  services,
  selectedKey,
  onSelect,
  onOpenUrl
}: ServiceTableProps): JSX.Element {
  if (services.length === 0) {
    return (
      <div className="empty-state">
        <p>No services detected. Click Refresh to scan local ports.</p>
      </div>
    )
  }

  return (
    <div className="table-wrapper">
      <table className="service-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Port</th>
            <th>Proto</th>
            <th className="col-url">URL</th>
            <th className="col-process">Process</th>
            <th>PID</th>
            <th>Type</th>
            <th className="col-label">Label</th>
            <th className="col-project">Project</th>
          </tr>
        </thead>
        <tbody>
          {services.map((service) => (
            <tr
              key={service.stableKey}
              className={selectedKey === service.stableKey ? 'service-table__row--selected' : ''}
              onClick={() => onSelect(service)}
            >
              <td>
                <span className="status-dot status-dot--listening" title="Listening" />
              </td>
              <td className="mono">{service.port}</td>
              <td>{service.protocol.toUpperCase()}</td>
              <td className="mono url-cell col-url">
                {service.localUrl ? (
                  <a
                    href={service.localUrl}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      onOpenUrl(service.localUrl!)
                    }}
                  >
                    {service.localUrl}
                  </a>
                ) : (
                  '—'
                )}
              </td>
              <td className="col-process">{service.processName ?? '—'}</td>
              <td className="mono">{service.pid ?? '—'}</td>
              <td>{service.typeLabel}</td>
              <td className="col-label">{service.label ?? '—'}</td>
              <td className="col-project">{service.project ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
