import { useEffect } from 'react'

export default function Modal({ titulo, fechar, children, largo }) {
  useEffect(() => {
    const f = (e) => e.key === 'Escape' && fechar()
    document.addEventListener('keydown', f)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', f); document.body.style.overflow = '' }
  }, [fechar])
  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && fechar()}>
      <div className={'modal' + (largo ? ' largo' : '')} role="dialog" aria-modal="true">
        <div className="modal-topo">
          <h2>{titulo}</h2>
          <button className="x" onClick={fechar} aria-label="Fechar">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
