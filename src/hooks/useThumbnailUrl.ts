import { useEffect, useState } from 'react'
import { thumbnailStore } from '../app/thumbnailStore'

export function useThumbnailUrl(key: string): string | undefined {
  const [url, setUrl] = useState<string>()

  useEffect(() => {
    let disposed = false
    let objectUrl: string | undefined
    void thumbnailStore.getAsync(key).then((blob) => {
      if (!blob || disposed) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    })
    return () => {
      disposed = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [key])

  return url
}
