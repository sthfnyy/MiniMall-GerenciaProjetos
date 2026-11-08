import React from "react";
import { User, Mail, ShieldCheck, LogOut } from "lucide-react";

const roleLabel = { consumidor: "Consumidor", lojista: "Lojista" };

export default function ConsumerProfile({ user, onLogout }) {
  return (
    <section className="consumer-page">
      <div className="page-title">
        <span className="eyebrow muted">MINHA CONTA</span>
        <h1>Meu perfil</h1>
        <p>Consulte suas informações pessoais no MiniMall.</p>
      </div>
      <div className="consumer-profile-card">
        <div className="consumer-profile-header">
          <div className="consumer-avatar" aria-hidden="true"><User size={32} /></div>
          <div>
            <h2>{user?.name}</h2>
            <span className="consumer-role">{roleLabel[user?.role] || user?.role}</span>
          </div>
        </div>
        <div className="consumer-profile-info">
          <div className="consumer-info-item"><Mail size={19} /><div><span>E-mail</span><strong>{user?.email || "Não informado"}</strong></div></div>
          <div className="consumer-info-item"><ShieldCheck size={19} /><div><span>Status</span><strong>Ativo</strong></div></div>
        </div>
        <div className="consumer-profile-actions">
          <button className="secondary" type="button" onClick={onLogout}><LogOut size={17} />Sair da conta</button>
        </div>
      </div>
    </section>
  );
}
