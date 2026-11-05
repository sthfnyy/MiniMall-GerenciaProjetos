"""Prévia isolada para inspeção manual. Não use este módulo em produção.

DATABASE_URL=postgresql+asyncpg://test:test@127.0.0.1/test SUPABASE_JWT_SECRET=test-only \
.venv/bin/python -m uvicorn backend.tests.preview_app:app --host 127.0.0.1 --port 8100

Credenciais fictícias: lojista@teste.local, admin@teste.local, consumidor@teste.local.
Senha exclusiva da prévia: Teste1234!
Todos os dados são recriados na memória ao reiniciar. Não acessa o Supabase.
"""
import base64
import json
import time
import uuid
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import Depends, HTTPException, Request
from sqlalchemy import Column, Table, Uuid, create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.main import app
from backend.auth import get_current_user_id
from backend.config.database import get_db
from backend.models import Avaliacao, Base, Categoria, Loja, Produto, Profile, StatusLoja, UserRole
from backend.tests.sqlite_produtos_fixture import AdaptadorSessaoAsync

engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)

@event.listens_for(engine, 'connect')
def attach_auth(connection, _):
    connection.execute("PRAGMA foreign_keys=ON")
    connection.execute("ATTACH DATABASE ':memory:' AS auth")

Table('users', Base.metadata, Column('id', Uuid, primary_key=True), schema='auth', extend_existing=True)
Base.metadata.create_all(engine)
now = datetime.now(UTC)
accounts = {}
with Session(engine) as session:
    for role in UserRole:
        email = f'{role.value}@teste.local'
        profile = Profile(id=uuid.uuid5(uuid.NAMESPACE_DNS, email), role=role, nome_completo=f'Conta {role.value}', criado_em=now, atualizado_em=now)
        session.execute(Base.metadata.tables['auth.users'].insert().values(id=profile.id))
        session.add(profile)
        accounts[email] = {'id': str(profile.id), 'email': email, 'role': role.value}
    categories = [Categoria(id=uuid.uuid4(), nome=name, criado_em=now) for name in ['Vestuário', 'Casa e decoração', 'Perfumaria']]
    session.add_all(categories)
    shop = Loja(id=uuid.uuid4(), lojista_id=uuid.UUID(accounts['lojista@teste.local']['id']), nome_loja='Loja da Praça', descricao='Comércio local de Picos', endereco_cidade='Picos', endereco_uf='PI', whatsapp='5589999999999', status=StatusLoja.aprovada, criado_em=now, atualizado_em=now)
    session.add(shop)
    session.flush()
    for index, (title, amount, image) in enumerate([('Camisa de algodão', '79.90', 'shirt.jpg'), ('Caneca artesanal', '39.90', 'mug.jpg'), ('Perfume floral', '89.90', 'perfume.jpg'), ('Bolsa de couro', '129.90', 'bag.jpg')]):
        session.add(Produto(id=uuid.uuid4(), loja_id=shop.id, categoria_id=categories[index % 3].id, titulo=title, descricao='Produto cadastrado para validação local.', preco_base=Decimal(amount), foto_principal_url=f'http://127.0.0.1:5173/images/{image}', ativo=True, criado_em=now, atualizado_em=now))
    session.add(Avaliacao(id=uuid.uuid4(), loja_id=shop.id, usuario_id=uuid.UUID(accounts['consumidor@teste.local']['id']), nota=5, comentario='Avaliação criada para verificar a moderação local.', foto_url='http://127.0.0.1:5173/images/mug.jpg', criado_em=now))
    session.commit()

async def database():
    with Session(engine, expire_on_commit=False) as session:
        yield AdaptadorSessaoAsync(session)

async def current_id(request: Request):
    token = request.headers.get('authorization', '').removeprefix('Bearer ')
    try:
        payload = json.loads(base64.urlsafe_b64decode(token.split('.')[1] + '=='))
        identifier = payload['sub']
        if not any(a['id'] == identifier for a in accounts.values()): raise ValueError()
        return uuid.UUID(identifier)
    except Exception:
        raise HTTPException(status_code=401, detail='Entre na conta de teste.')

app.dependency_overrides[get_db] = database
app.dependency_overrides[get_current_user_id] = current_id

def session_data(account):
    def encode(value): return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
    token = '.'.join([encode({'alg': 'HS256', 'typ': 'JWT'}), encode({'sub': account['id'], 'exp': int(time.time()) + 3600, 'iat': int(time.time()), 'role': 'authenticated'}), 'cHJldmlldy1vbmx5'])
    return {'access_token': token, 'refresh_token': account['email'], 'token_type': 'bearer', 'expires_in': 3600, 'expires_at': int(time.time()) + 3600, 'user': {'id': account['id'], 'email': account['email'], 'aud': 'authenticated', 'role': 'authenticated', 'app_metadata': {'provider': 'email'}, 'user_metadata': {}, 'created_at': now.isoformat()}}

@app.post('/auth/v1/token')
async def test_login(request: Request):
    values = await request.json()
    email = values.get('refresh_token') or values.get('email')
    if email not in accounts or (not values.get('refresh_token') and values.get('password') != 'Teste1234!'):
        raise HTTPException(status_code=400, detail='Dados de teste inválidos')
    return session_data(accounts[email])

@app.post('/auth/v1/logout', status_code=204)
async def test_logout():
    return None

@app.get('/auth/v1/user')
async def test_user(user_id=Depends(current_id)):
    account = next(a for a in accounts.values() if a['id'] == str(user_id))
    return session_data(account)['user']


@app.post('/auth/v1/signup')
async def test_signup(request: Request):
    values = await request.json()
    email = values.get('email', '').strip().lower()
    if not email or email in accounts:
        raise HTTPException(status_code=400, detail='E-mail de teste inválido ou já cadastrado')
    identifier = uuid.uuid4()
    accounts[email] = {'id': str(identifier), 'email': email, 'role': 'consumidor'}
    with Session(engine) as session:
        session.execute(Base.metadata.tables['auth.users'].insert().values(id=identifier))
        session.add(Profile(id=identifier, role=UserRole.consumidor, nome_completo=values.get('data', {}).get('nome_completo', 'Conta de teste'), criado_em=now, atualizado_em=now))
        session.commit()
    return session_data(accounts[email])['user']
