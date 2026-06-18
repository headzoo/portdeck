import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RiskLevel, Service } from '@shared/types'
import { ServiceTable } from './components/ServiceTable'
import { ServiceDetails } from './components/ServiceDetails'
import { ProjectFilter } from './components/ProjectFilter'
import { EditServiceDialog } from './components/EditServiceDialog'
import { ErrorBanner } from './components/ErrorBanner'

const RISK_OPTIONS: Array<RiskLevel | ''> = ['', 'none', 'info', 'low', 'medium', 'high']

export default function App(): JSX.Element {
  const [services, setServices] = useState<Service[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [riskFilter, setRiskFilter] = useState<RiskLevel | ''>('')
  const [showIgnored, setShowIgnored] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [lastScannedAt, setLastScannedAt] = useState<string | null>(null)
  const [editService, setEditService] = useState<Service | null>(null)
  const refreshInFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return
    refreshInFlight.current = true
    setLoading(true)
    try {
      const result = await window.portdeck.scanServices()
      setServices(result.services)
      setError(result.error)
      setWarnings(result.warnings)
      setLastScannedAt(result.scannedAt)
      if (selectedKey && !result.services.some((s) => s.stableKey === selectedKey)) {
        setSelectedKey(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      refreshInFlight.current = false
      setLoading(false)
    }
  }, [selectedKey])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), 10_000)
    return () => clearInterval(id)
  }, [refresh])

  const projects = useMemo(() => {
    const set = new Set<string>()
    for (const service of services) {
      if (service.project) set.add(service.project)
    }
    return [...set].sort()
  }, [services])

  const filteredServices = useMemo(() => {
    const query = search.trim().toLowerCase()
    return services.filter((service) => {
      if (!showIgnored && service.ignored) return false
      if (projectFilter && service.project !== projectFilter) return false
      if (riskFilter && service.riskLevel !== riskFilter) return false
      if (!query) return true

      const haystack = [
        String(service.port),
        service.processName,
        service.typeLabel,
        service.label,
        service.project,
        service.localUrl,
        service.address
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(query)
    })
  }, [services, search, projectFilter, riskFilter, showIgnored])

  const selectedService = services.find((s) => s.stableKey === selectedKey) ?? null

  const handleSaveMetadata = async (
    stableKey: string,
    label: string,
    project: string,
    notes: string
  ): Promise<void> => {
    const updated = await window.portdeck.updateServiceMetadata(stableKey, {
      label: label || null,
      project: project || null,
      notes: notes || null
    })
    if (updated) {
      setServices((prev) => prev.map((s) => (s.stableKey === stableKey ? updated : s)))
    }
  }

  const handleIgnore = async (service: Service): Promise<void> => {
    await window.portdeck.ignoreService(service.stableKey)
    setServices((prev) =>
      prev.map((s) => (s.stableKey === service.stableKey ? { ...s, ignored: true } : s))
    )
  }

  const handleUnignore = async (service: Service): Promise<void> => {
    await window.portdeck.unignoreService(service.stableKey)
    setServices((prev) =>
      prev.map((s) => (s.stableKey === service.stableKey ? { ...s, ignored: false } : s))
    )
  }

  const handleKill = async (service: Service): Promise<void> => {
    if (service.pid === null) return

    const label = service.processName ?? service.typeLabel
    const confirmed = window.confirm(
      `Kill process "${label}" (PID ${service.pid}) listening on port ${service.port}?`
    )
    if (!confirmed) return

    try {
      const result = await window.portdeck.killProcess(service.pid)
      if (result.success) {
        setError(null)
        await refresh()
      } else {
        setError(result.error ?? 'Failed to kill process.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="app">
      <ErrorBanner message={error} warnings={warnings} />

      <div className="app-toolbar">
        <label className="filter-control">
          <span className="filter-control__label">Search</span>
          <input
            className="search-input"
            type="search"
            placeholder="Port, process, label, project…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <ProjectFilter projects={projects} value={projectFilter} onChange={setProjectFilter} />
        <label className="filter-control">
          <span className="filter-control__label">Risk</span>
          <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value as RiskLevel | '')}>
            <option value="">All risks</option>
            {RISK_OPTIONS.filter(Boolean).map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={showIgnored}
            onChange={(e) => setShowIgnored(e.target.checked)}
          />
          Show ignored
        </label>
      </div>

      <div className="app-body">
        <main className="app-main">
          <ServiceTable
            services={filteredServices}
            selectedKey={selectedKey}
            onSelect={(service) => setSelectedKey(service.stableKey)}
            onOpenUrl={(url) => void window.portdeck.openExternalUrl(url)}
          />
        </main>
        <ServiceDetails
          service={selectedService}
          onEdit={setEditService}
          onOpenUrl={(url) => void window.portdeck.openExternalUrl(url)}
          onCopyUrl={(url) => void window.portdeck.copyText(url)}
          onIgnore={(service) => void handleIgnore(service)}
          onUnignore={(service) => void handleUnignore(service)}
          onKill={(service) => void handleKill(service)}
        />
      </div>

      {lastScannedAt && (
        <footer className="app-footer">
          Last scanned: {new Date(lastScannedAt).toLocaleString()} · {filteredServices.length} shown /{' '}
          {services.length} total
        </footer>
      )}

      <EditServiceDialog
        service={editService}
        onClose={() => setEditService(null)}
        onSave={handleSaveMetadata}
      />
    </div>
  )
}
