import React, { useState } from 'react';
import { Tags, ShieldCheck } from 'lucide-react';
import { PageTitle } from '../../components/ui';
import Registrations from './Registrations';
import Moderation from './Moderation';
export default function Admin({ notify }) {
  const [tab, setTab] = useState('categorias');
  return <section className="admin-page"><PageTitle eyebrow="ADMINISTRAÇÃO" title="Painel administrativo" text="Gerencie as categorias e a moderação do MiniMall." />
    <nav className="admin-navigation" aria-label="Administração">
      <button className={tab === 'categorias' ? 'active' : ''} aria-current={tab === 'categorias' ? 'page' : undefined} onClick={() => setTab('categorias')}><Tags size={18} />Categorias</button>
      <button className={tab === 'moderacao' ? 'active' : ''} aria-current={tab === 'moderacao' ? 'page' : undefined} onClick={() => setTab('moderacao')}><ShieldCheck size={18} />Moderação</button>
    </nav>
    {tab === 'categorias' ? <Registrations notify={notify} /> : <Moderation notify={notify} />}
  </section>;
}
