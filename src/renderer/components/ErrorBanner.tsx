interface ErrorBannerProps {
  message: string | null
  warnings?: string[]
}

export function ErrorBanner({ message, warnings = [] }: ErrorBannerProps): JSX.Element | null {
  if (!message && warnings.length === 0) return null

  return (
    <div className="error-banner">
      {message && <p className="error-banner__message">{message}</p>}
      {warnings.length > 0 && (
        <ul className="error-banner__warnings">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
