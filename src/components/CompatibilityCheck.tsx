import { CheckCircle2, CircleAlert, Gauge, MinusCircle } from 'lucide-react'
import { useCompatibility } from '../hooks/useCompatibility'

export function CompatibilityCheck() {
  const compatibility = useCompatibility()
  return (
    <details className="compatibility card" open>
      <summary>
        <span><Gauge size={20} aria-hidden="true" /> Systemprüfung</span>
        <span className={compatibility.ready ? 'status success' : 'status warning'}>{compatibility.summary}</span>
      </summary>
      <div className="compatibility-grid">
        {compatibility.items.map((item) => (
          <div className="compatibility-item" key={item.key}>
            {item.available ? <CheckCircle2 size={18} className="icon-success" aria-hidden="true" /> : item.required ? <CircleAlert size={18} className="icon-danger" aria-hidden="true" /> : <MinusCircle size={18} className="icon-muted" aria-hidden="true" />}
            <div><strong>{item.label}</strong><small>{item.detail}</small></div>
          </div>
        ))}
      </div>
    </details>
  )
}
