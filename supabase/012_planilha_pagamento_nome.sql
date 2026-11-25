-- Planilha: forma de pagamento (Pix, Dinheiro, Cartão…) e nome (de quem / para quem) em cada linha.
-- Vale para a Planilha principal (lancamentos) e para as Planilhas 2, 3 e 4 (planilha_itens).
alter table public.lancamentos add column if not exists pagamento text;
alter table public.lancamentos add column if not exists pessoa text;

alter table public.planilha_itens add column if not exists pagamento text;
alter table public.planilha_itens add column if not exists pessoa text;

-- Recarrega o cache da API para as colunas novas aparecerem na hora
notify pgrst, 'reload schema';

select 'ok' as planilha_pagamento_nome;
