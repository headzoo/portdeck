import { useEffect, useState } from 'react'
import type { Service } from '@shared/types'

interface EditServiceDialogProps {
  service: Service | null
  onClose: () => void
  onSave: (stableKey: string, label: string, project: string, notes: string) => Promise<void>
}

export function EditServiceDialog({ service, onClose, onSave }: EditServiceDialogProps): JSX.Element | null {
  const [label, setLabel] = useState('')
  const [project, setProject] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (service) {
      setLabel(service.label ?? '')
      setProject(service.project ?? '')
      setNotes(service.notes ?? '')
    }
  }, [service])

  if (!service) return null

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave(service.stableKey, label.trim(), project.trim(), notes.trim())
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <header className="dialog__header">
          <h2>Edit Service</h2>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Close
          </button>
        </header>
        <form onSubmit={(e) => void handleSubmit(e)} className="dialog__form">
          <p className="dialog__subtitle">
            Port {service.port} · {service.processName ?? 'Unknown process'}
          </p>
          <label className="form-field">
            <span>Label</span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. API server"
            />
          </label>
          <label className="form-field">
            <span>Project</span>
            <input
              type="text"
              value={project}
              onChange={(e) => setProject(e.target.value)}
              placeholder="e.g. my-app"
            />
          </label>
          <label className="form-field">
            <span>Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
              rows={3}
            />
          </label>
          <div className="dialog__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
