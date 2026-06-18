import type { RiskLevel } from '@shared/types'

interface RiskBadgeProps {
  level: RiskLevel
  reason?: string
}

export function RiskBadge({ level, reason }: RiskBadgeProps): JSX.Element {
  return (
    <span className={`risk-badge risk-badge--${level}`} title={reason}>
      {level}
    </span>
  )
}
