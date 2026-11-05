import React, { useEffect, useState } from 'react';
import { Save, Store, RotateCcw } from 'lucide-react';
import { Field, PageTitle } from '../../components/ui';
import MerchantNav from './MerchantNav';
import { merchantApi } from '../../services/merchant-api';
import { mapStore } from '../../services/adapters';

const initial = { nome_loja: '', descricao: '', endereco_logradouro: '', endereco_numero: '', endereco_bairro: '', endereco_cidade: '', endereco_uf: '', endereco_cep: '', whatsapp: '', instagram: '', horario_funcionamento: null };
export default function StoreSettings({ user, onSaveStore, go, notify }) {
  const [store, setStore] = useState(null);
  const [values, setValues] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError('');
    (user.role === 'consumidor' ? Promise.resolve(null) : merchantApi.getStore()).then(result => {
      if (active) { setStore(result); setValues(result ? { ...initial, ...result } : initial); }
    }).catch(err => { if (active) setLoadError(err.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user.id, user.role, revision]);
  const set = (key, value) => setValues(prev => ({ ...prev, [key]: value }));
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try {
      const saved = await merchantApi.saveStore(values, Boolean(store));
      setStore(saved); setValues({ ...initial, ...saved });
      await onSaveStore(mapStore(saved));
      notify(store ? 'Dados da loja atualizados.' : 'Loja cadastrada. Aguarde a aprovação da administração.');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function requestApproval() {
    setBusy(true); setError('');
    try { const saved = await merchantApi.requestApproval(); setStore(saved); await onSaveStore(mapStore(saved)); notify('Solicitação enviada para análise.'); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <section className="consumer-page merchant-page">
    <PageTitle eyebrow="PAINEL DO LOJISTA" title="Configuração da Loja" text="Cadastre e mantenha atualizadas as informações da sua loja." />
    {user.role === 'lojista' && <MerchantNav go={go} />}
    {loading ? <p role="status">Carregando loja…</p> : loadError ? <div role="alert" className="error">{loadError}<button className="outline" onClick={() => setRevision(r => r + 1)}>Tentar novamente</button></div> : <>
      <div className="merchant-status-banner"><Store size={28} /><div><h2>{store?.nome_loja || 'Cadastre sua loja'}</h2><p>{store ? `Situação: ${store.status}` : 'Preencha os dados do seu estabelecimento.'}</p>{store?.motivo_rejeicao && <p>Motivo: {store.motivo_rejeicao}</p>}</div>
        {store?.status === 'rejeitada' && <button className="outline" disabled={busy} onClick={requestApproval}>Solicitar nova aprovação</button>}
      </div>
      <div className="consumer-profile-card merchant-form-card"><form className="merchant-form" onSubmit={submit}>
        <fieldset disabled={busy} style={{ border: 0, padding: 0, minWidth: 0 }}>
          <div className="merchant-form-section"><h3>Informações da loja</h3>
            <Field label="Nome da loja" required minLength={2} maxLength={150} value={values.nome_loja} onChange={e => set('nome_loja', e.target.value)} />
            <Field label="Descrição"><textarea rows={3} value={values.descricao || ''} onChange={e => set('descricao', e.target.value)} /></Field>
            <div className="merchant-grid"><Field label="WhatsApp com DDD" type="tel" required placeholder="(89) 99999-9999" value={values.whatsapp} onChange={e => set('whatsapp', e.target.value)} /><Field label="Instagram (opcional)" value={values.instagram || ''} onChange={e => set('instagram', e.target.value)} /></div>
          </div>
          <div className="merchant-form-section"><h3>Endereço e atendimento</h3><div className="merchant-grid">
            {[
              ['endereco_logradouro', 'Rua / Avenida'], ['endereco_numero', 'Número'], ['endereco_bairro', 'Bairro'], ['endereco_cidade', 'Cidade'], ['endereco_uf', 'UF'], ['endereco_cep', 'CEP'],
            ].map(([key, label]) => <Field key={key} label={label} required={['endereco_cidade', 'endereco_uf'].includes(key)} maxLength={key === 'endereco_uf' ? 2 : undefined} value={values[key] || ''} onChange={e => set(key, e.target.value)} />)}
          </div><Field label="Horário de funcionamento" value={values.horario_funcionamento?.descricao || ''} onChange={e => set('horario_funcionamento', { ...values.horario_funcionamento, descricao: e.target.value })} placeholder="Segunda a sexta, 8h às 18h" /></div>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="merchant-actions"><button type="button" className="secondary" onClick={() => { setValues(store ? { ...initial, ...store } : initial); setError(''); }}><RotateCcw size={16} />Descartar alterações</button><button className="primary"><Save size={16} />{busy ? 'Salvando…' : store ? 'Salvar alterações' : 'Cadastrar loja'}</button></div>
        </fieldset>
      </form></div>
    </>}
  </section>;
}
