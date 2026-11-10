import { useEffect } from 'react'
import { Loading } from '@/components/states'
import { useGoSuspended } from './useGoSuspended'

/** Render when the server reports "banned": refreshes the profile, then shows /suspended. */
export function GoSuspended() {
  const goSuspended = useGoSuspended()
  useEffect(() => {
    void goSuspended()
  }, [goSuspended])
  return <Loading fullScreen />
}
