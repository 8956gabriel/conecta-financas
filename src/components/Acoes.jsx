// Botões visíveis de Editar / Excluir para cada item das listas
export default function Acoes({ editar, excluir }) {
  const parar = (f) => (e) => { e.stopPropagation(); f() }
  return (
    <span className="acoes-item">
      {editar && <button type="button" className="ic-btn" onClick={parar(editar)} title="Editar" aria-label="Editar">✏️</button>}
      {excluir && <button type="button" className="ic-btn perigo" onClick={parar(excluir)} title="Excluir" aria-label="Excluir">🗑</button>}
    </span>
  )
}
