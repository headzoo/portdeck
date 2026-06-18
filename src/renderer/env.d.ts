import type { PortdeckAPI } from '@shared/types'

declare global {
  interface Window {
    portdeck: PortdeckAPI
  }
}

export {}
