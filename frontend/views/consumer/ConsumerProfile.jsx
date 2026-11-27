import React, { useEffect, useState } from "react";
import { User, Mail, Phone, ShieldCheck, LogOut, Star, Coins, Heart, Pencil, ShoppingBag, AlertTriangle } from "lucide-react";
import { Field } from "../../components/ui";
import { getConsumerProfile, updateConsumerProfile } from "../../services/profile";

const roleLabel = { consumidor: "Consumidor", lojista: "Lojista" };

export default function ConsumerProfile({
  user,
  onLogout,
  onFavorites,
  onPoints,
  onReviews,
  onPurchases,
  onProfileUpdated,
  notify,
  loadProfileFn = getConsumerProfile,
  saveProfileFn = updateConsumerProfile,
}) {
  const [profile, setProfile] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState({ nome_completo: "", telefone: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    loadProfileFn()
      .then((result) => { if (active) setProfile(result); })
      .catch((err) => { if (active) setLoadError(err.message || "Não foi possível carregar o perfil."); });
    return () => { active = false; };
  }, [loadProfileFn]);

  const name = profile?.nome_completo || user?.name;

  function startEditing() {
    setValues({ nome_completo: name || "", telefone: profile?.telefone || "" });
    setError("");
    setEditing(true);
  }

  async function save(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const updated = await saveProfileFn(values);
      setProfile(updated);
      setEditing(false);
      notify?.("Perfil atualizado com sucesso.");
      onProfileUpdated?.(updated);
    } catch (err) {
      setError(err.message || "Não foi possível salvar o perfil.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="consumer-page">
      <div className="page-title">
        <span className="eyebrow muted">MINHA CONTA</span>
        <h1>Meu perfil</h1>
        <p>Consulte e atualize suas informações no MiniMall.</p>
      </div>
      <div className="consumer-profile-card">
        <div className="consumer-profile-header">
          <div className="consumer-avatar" aria-hidden="true"><User size={32} /></div>
          <div>
            <h2>{name}</h2>
            <span className="consumer-role">{roleLabel[user?.role] || user?.role}</span>
          </div>
        </div>

        {loadError && (
          <div className="error-banner" role="alert"><AlertTriangle size={18} /><span>{loadError}</span></div>
        )}

        {editing ? (
          <form className="profile-edit-form" onSubmit={save}>
            <fieldset disabled={saving}>
              <Field label="Nome completo *">
                <input required minLength={2} maxLength={150} autoComplete="name" value={values.nome_completo} onChange={(e) => setValues((v) => ({ ...v, nome_completo: e.target.value }))} />
              </Field>
              <Field label="Telefone">
                <input type="tel" autoComplete="tel" placeholder="(89) 99999-0000" value={values.telefone} onChange={(e) => setValues((v) => ({ ...v, telefone: e.target.value }))} />
              </Field>
              {error && <p className="error" role="alert">{error}</p>}
              <div className="consumer-form-actions">
                <button type="button" className="secondary" onClick={() => setEditing(false)}>Cancelar</button>
                <button type="submit" className="primary">{saving ? "Salvando…" : "Salvar alterações"}</button>
              </div>
            </fieldset>
          </form>
        ) : (
          <div className="consumer-profile-info">
            <div className="consumer-info-item"><Mail size={19} aria-hidden="true" /><div><span>E-mail</span><strong>{user?.email || "Não informado"}</strong></div></div>
            <div className="consumer-info-item"><Phone size={19} aria-hidden="true" /><div><span>Telefone</span><strong>{profile?.telefone || "Não informado"}</strong></div></div>
            <div className="consumer-info-item"><ShieldCheck size={19} aria-hidden="true" /><div><span>Status</span><strong>Ativo</strong></div></div>
          </div>
        )}

        <div className="consumer-profile-actions">
          {!editing && profile && <button className="secondary" type="button" onClick={startEditing}><Pencil size={17} aria-hidden="true" />Editar perfil</button>}
          {onPurchases && <button className="secondary" type="button" onClick={onPurchases}><ShoppingBag size={17} aria-hidden="true" />Minhas compras</button>}
          {onFavorites && <button className="secondary" type="button" onClick={onFavorites}><Heart size={17} aria-hidden="true" />Meus favoritos</button>}
          {onPoints && <button className="secondary" type="button" onClick={onPoints}><Coins size={17} aria-hidden="true" />Meus pontos</button>}
          {onReviews && <button className="secondary" type="button" onClick={onReviews}><Star size={17} aria-hidden="true" />Minhas avaliações</button>}
          <button className="secondary" type="button" onClick={onLogout}><LogOut size={17} aria-hidden="true" />Sair da conta</button>
        </div>
      </div>
    </section>
  );
}
