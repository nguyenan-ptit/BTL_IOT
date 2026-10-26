import { useSyncExternalStore } from 'react'
import { connection } from './http'

export function useConnection() {
  return useSyncExternalStore(connection.subscribe, connection.get)
}
