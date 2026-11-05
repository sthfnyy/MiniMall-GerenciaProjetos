import React, { useState } from 'react';
import { Field } from '../components/ui';
import { signIn, signUp } from '../services/auth';
export default function AuthPage({ mode, onSuccess, go }) {
  const signup = mode === 'cadastro';
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setError(''); setMessage('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (signup && values.password !== values.confirm) return setError('As senhas não coincidem.');
    setBusy(true);
    try {
      const result = signup ? await signUp([], values) : await signIn([], values.email, values.password);
      if (result.confirmationRequired) {
        setMessage('Solicitação de cadastro recebida. Confira seu e-mail para confirmar a conta e depois entre.');
      } else await onSuccess(result.session);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <section className="auth-page">
    <div className="auth-intro"><h1>{signup ? 'Criar conta' : 'Entrar'}</h1>
      <p>{signup ? 'Crie sua conta. Para vender, cadastre sua loja depois de entrar.' : 'Acesse sua conta MiniMall.'}</p>
      <div className="auth-visual" aria-hidden="true"><span>m.</span></div>
    </div>
    <div className="panel auth-form"><form onSubmit={submit}>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
        {signup && <Field label="Nome completo" name="name" required minLength={2} maxLength={150} autoComplete="name" />}
        <Field label="E-mail" name="email" type="email" required autoComplete="email" />
        <Field label="Senha" name="password" type="password" required minLength={signup ? 8 : undefined} autoComplete={signup ? 'new-password' : 'current-password'} />
        {signup && <Field label="Confirmar senha" name="confirm" type="password" required minLength={8} autoComplete="new-password" />}
        {error && <p className="error" role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        <button className="primary full">{busy ? 'Aguarde…' : signup ? 'Criar conta' : 'Entrar'}</button>
      </fieldset>
    </form>
    <button className="text-button section-space" onClick={() => go(signup ? 'login' : 'cadastro')}>{signup ? 'Já tenho uma conta' : 'Criar uma conta'}</button></div>
  </section>;
}
