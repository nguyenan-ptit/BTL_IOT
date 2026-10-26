import { useEffect, useState } from 'react'

/** Thời điểm hiện tại, cập nhật định kỳ để các nhãn "x giây trước" tự chạy. */
export function useNow(intervalMs = 5_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
