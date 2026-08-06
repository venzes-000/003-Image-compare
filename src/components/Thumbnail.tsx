import { ImageOff } from 'lucide-react'
import { useThumbnailUrl } from '../hooks/useThumbnailUrl'

interface ThumbnailProps {
  thumbnailKey: string
  alt: string
  className?: string
}

export function Thumbnail({ thumbnailKey, alt, className }: ThumbnailProps) {
  const url = useThumbnailUrl(thumbnailKey)
  return url ? <img className={className} src={url} alt={alt} loading="lazy" decoding="async" /> : <div className={`thumbnail-placeholder ${className ?? ''}`} role="img" aria-label={`Keine Vorschau für ${alt}`}><ImageOff size={28} aria-hidden="true" /></div>
}
