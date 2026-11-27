-- MiniMall · Créditos de pontos órfãos
--
-- Contexto: antes da correção da moderação, remover uma avaliação pelo admin
-- apagava a avaliação, mas o FK pontos_transacoes.avaliacao_id (ON DELETE SET NULL)
-- deixava o crédito de 10 pontos sem vínculo. A partir desta versão, a moderação
-- e o consumidor estornam os pontos ANTES de excluir a avaliação.
--
-- 1) RELATÓRIO (somente leitura): créditos "por avaliação" sem avaliação vinculada.
select
    pt.id,
    pt.usuario_id,
    p.nome_completo                    as consumidor,
    l.nome_loja                        as loja,
    pt.quantidade,
    pt.descricao,
    pt.criado_em
from public.pontos_transacoes pt
left join public.profiles p on p.id = pt.usuario_id
left join public.lojas l on l.id = pt.loja_id
where pt.tipo = 'credito'
  and pt.avaliacao_id is null
  and pt.descricao = 'Pontos por avaliação publicada'
order by pt.criado_em;

-- 1b) Créditos de foto cuja foto não existe mais (descricao = 'RF08:foto:<uuid>').
select pt.id, pt.usuario_id, pt.quantidade, pt.descricao, pt.criado_em
from public.pontos_transacoes pt
where pt.tipo = 'credito'
  and pt.descricao like 'RF08:foto:%'
  and not exists (
      select 1 from public.avaliacao_fotos f
      where 'RF08:foto:' || f.id::text = pt.descricao
  );

-- 2) CORREÇÃO (DESTRUTIVA) — revise o relatório acima, faça backup e só então
--    descomente e execute em uma transação. Mantém créditos ainda vinculados.
--
-- begin;
-- delete from public.pontos_transacoes pt
-- where pt.tipo = 'credito'
--   and pt.avaliacao_id is null
--   and pt.descricao = 'Pontos por avaliação publicada';
-- delete from public.pontos_transacoes pt
-- where pt.tipo = 'credito'
--   and pt.descricao like 'RF08:foto:%'
--   and not exists (select 1 from public.avaliacao_fotos f where 'RF08:foto:' || f.id::text = pt.descricao);
-- -- confira o saldo antes de confirmar:
-- -- select usuario_id, sum(quantidade) from public.pontos_transacoes group by 1;
-- commit;   -- ou rollback;
