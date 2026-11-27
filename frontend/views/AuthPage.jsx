import React, { useState } from "react";
import { ShoppingBag, Store } from "lucide-react";
import { Field } from "../components/ui";
import { passwordsMatch, signIn, signUp } from "../services/auth";

const ACCOUNT_TYPES = [
  {
    value: "consumidor",
    title: "Consumidor",
    text: "Encontre produtos, favorite, confirme compras e avalie lojas.",
    Icon: ShoppingBag,
  },
  {
    value: "lojista",
    title: "Lojista",
    text: "Cadastre sua loja, publique produtos e responda aos clientes.",
    Icon: Store,
  },
];

export default function AuthPage({ mode, onSuccess, go }) {
  const signup = mode === "cadastro";
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [accountType, setAccountType] = useState("consumidor");

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setMessage("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (signup && !passwordsMatch(values.password, values.confirm)) return setError("As senhas não coincidem.");
    setBusy(true);
    try {
      if (signup) {
        await signUp([], { ...values, accountType });
        setMessage("Conta criada! Entrando…");
        try {
          const result = await signIn([], values.email, values.password);
          await onSuccess(result.session);
        } catch {
          setMessage("Conta criada com sucesso. Entre com seu e-mail e senha.");
          go("login");
        }
      } else {
        const result = await signIn([], values.email, values.password);
        await onSuccess(result.session);
      }
    } catch (err) {
      setMessage("");
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-page">
      <div className="auth-intro">
        <h1>{signup ? "Criar conta" : "Entrar"}</h1>
        <p>{signup ? "Cadastre-se como consumidor ou lojista." : "Acesse sua conta MiniMall."}</p>
        <div className="auth-visual" aria-hidden="true"><span>m.</span></div>
      </div>
      <div className="panel auth-form">
        <form onSubmit={submit}>
          <fieldset disabled={busy}>
            {signup && (
              <fieldset className="account-type-picker">
                <legend>Tipo de conta</legend>
                <div className="account-type-options">
                  {ACCOUNT_TYPES.map(({ value, title, text, Icon }) => (
                    <label key={value} className={`account-type-option ${accountType === value ? "selected" : ""}`}>
                      <input
                        type="radio"
                        name="accountType"
                        value={value}
                        checked={accountType === value}
                        onChange={() => setAccountType(value)}
                      />
                      <Icon size={22} aria-hidden="true" />
                      <span className="account-type-title">{title}</span>
                      <span className="account-type-text">{text}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {signup && <Field label="Nome completo" name="name" required minLength={2} maxLength={150} autoComplete="name" />}
            <Field label="E-mail" name="email" type="email" required autoComplete="email" />
            <Field label="Senha" name="password" type="password" required minLength={signup ? 8 : undefined} autoComplete={signup ? "new-password" : "current-password"} />
            {signup && <Field label="Confirmar senha" name="confirm" type="password" required minLength={8} autoComplete="new-password" />}
            {error && <p className="error" role="alert">{error}</p>}
            {message && <p className="success-message" role="status">{message}</p>}
            <button className="primary full">
              {busy ? "Aguarde…" : signup ? `Criar conta de ${accountType === "lojista" ? "lojista" : "consumidor"}` : "Entrar"}
            </button>
          </fieldset>
        </form>
        <button className="text-button section-space" onClick={() => go(signup ? "login" : "cadastro")}>
          {signup ? "Já tenho uma conta" : "Criar uma conta"}
        </button>
      </div>
    </section>
  );
}
