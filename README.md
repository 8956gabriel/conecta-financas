# Conecta Finanças

Controle financeiro do casal: cada integrante entra com o próprio login e os dois compartilham os mesmos dados (isolados por casal via RLS no Supabase).

- Visão do casal ou individual
- Receitas e despesas com status padronizados (Pendente, Agendado, Pago/Recebido, Atrasado)
- Compras à vista, parceladas e fixas mensais
- Cartões com limite, faturas por mês, parcelas e pagamento de fatura
- Contas com saldo calculado
- Metas do casal
- Dashboard com filtros por mês, categorias e histórico de 6 meses

## Rodar
```
npm install
npm run dev
```
Variáveis (opcionais, já há padrão no código): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

Banco: execute `supabase/schema.sql` no SQL Editor do Supabase.
