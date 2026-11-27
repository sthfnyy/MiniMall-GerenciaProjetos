import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
import httpx
from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError
from backend.config.database import get_db
from backend.main import app
from backend.auth import get_current_profile
from backend.controllers import auth_profile
from backend.models import UserRole

class SessaoCadastroFake:
    def __init__(self, perfil_existente=None, falhar_commit=False):
        self.perfil_existente = perfil_existente
        self.falhar_commit = falhar_commit
        self.added = []
        self.committed = False
        self.rolled_back = False

    async def execute(self, _consulta):
        perfil = self.perfil_existente
        return SimpleNamespace(scalar_one_or_none=lambda: perfil)

    def add(self, item):
        self.added.append(item)

    async def commit(self):
        if self.falhar_commit:
            raise SQLAlchemyError("falha simulada")
        self.committed = True

    async def rollback(self):
        self.rolled_back = True


class RF01TestCase(unittest.TestCase):
    def setUp(self):
        app.dependency_overrides.clear()
        self.client = TestClient(app)
        self.cadastro = {"nome_completo":"Usuário Teste", "email":"teste@exemplo.com", "senha":"SenhaForte123!"}
        self.login = {"email":"teste@exemplo.com", "senha":"SenhaForte123!"}

    def tearDown(self):
        app.dependency_overrides.clear()
        self.client.close()

    def simular_supabase(self, codigo, dados):
        return patch.object(auth_profile, "_requisitar_auth", new_callable=AsyncMock,
                            return_value=httpx.Response(codigo, json=dados))

    # ----- Cadastro com escolha de perfil -----

    def autenticar_banco(self, perfil_existente=None, falhar_commit=False):
        sessao = SessaoCadastroFake(perfil_existente, falhar_commit)

        async def db_override():
            yield sessao

        app.dependency_overrides[get_db] = db_override
        return sessao

    def simular_admin_api(self, codigo, dados):
        return patch.object(auth_profile, "_requisitar_admin", new_callable=AsyncMock,
                            return_value=httpx.Response(codigo, json=dados))

    def perfil_trigger(self, uid):
        return SimpleNamespace(id=uid, role=UserRole.consumidor, nome_completo="x", atualizado_em=None)

    def test_cadastro_consumidor_define_perfil(self):
        uid = uuid.uuid4()
        perfil = self.perfil_trigger(uid)
        sessao = self.autenticar_banco(perfil_existente=perfil)
        with self.simular_admin_api(200, {"id": str(uid)}) as chamada:
            resp = self.client.post('/auth/register', json={**self.cadastro, "perfil": "consumidor"})
        self.assertEqual(resp.status_code, 201, resp.text)
        self.assertEqual(resp.json()["perfil"], "consumidor")
        self.assertEqual(perfil.role, UserRole.consumidor)
        self.assertTrue(sessao.committed)
        metodo, caminho, corpo = chamada.await_args.args
        self.assertEqual((metodo, caminho), ("POST", "users"))
        self.assertTrue(corpo["email_confirm"])
        self.assertNotIn("role", corpo.get("user_metadata", {}))

    def test_cadastro_lojista_define_perfil_lojista(self):
        uid = uuid.uuid4()
        perfil = self.perfil_trigger(uid)
        self.autenticar_banco(perfil_existente=perfil)
        with self.simular_admin_api(200, {"id": str(uid)}):
            resp = self.client.post('/auth/register', json={**self.cadastro, "perfil": "lojista"})
        self.assertEqual(resp.status_code, 201, resp.text)
        self.assertEqual(resp.json()["perfil"], "lojista")
        self.assertEqual(perfil.role, UserRole.lojista)
        self.assertEqual(perfil.nome_completo, "Usuário Teste")

    def test_cadastro_cria_perfil_quando_trigger_nao_criou(self):
        uid = uuid.uuid4()
        sessao = self.autenticar_banco(perfil_existente=None)
        with self.simular_admin_api(201, {"id": str(uid)}):
            resp = self.client.post('/auth/register', json={**self.cadastro, "perfil": "lojista"})
        self.assertEqual(resp.status_code, 201, resp.text)
        self.assertEqual(len(sessao.added), 1)
        self.assertEqual(sessao.added[0].role, UserRole.lojista)

    def test_cadastro_rejeita_perfis_nao_publicos(self):
        for perfil in ["admin", "administrador", "Admin", "qualquer", ""]:
            with self.subTest(perfil=perfil), self.simular_admin_api(200, {"id": str(uuid.uuid4())}) as chamada:
                resp = self.client.post('/auth/register', json={**self.cadastro, "perfil": perfil})
                self.assertEqual(resp.status_code, 422)
                chamada.assert_not_awaited()

    def test_cadastro_exige_perfil(self):
        resp = self.client.post('/auth/register', json=self.cadastro)
        self.assertEqual(resp.status_code, 422)

    def test_cadastro_nao_aceita_role_extra(self):
        resp = self.client.post('/auth/register', json={**self.cadastro, "perfil": "consumidor", "role": "admin"})
        self.assertEqual(resp.status_code, 422)

    def test_cadastro_senha_curta(self):
        resp = self.client.post('/auth/register', json={**self.cadastro, "perfil": "consumidor", "senha": "123"})
        self.assertEqual(resp.status_code, 422)

    def test_cadastro_email_invalido(self):
        resp = self.client.post('/auth/register', json={**self.cadastro, "perfil": "consumidor", "email": "sem-arroba"})
        self.assertEqual(resp.status_code, 422)

    def test_cadastro_email_duplicado_retorna_409(self):
        with self.simular_admin_api(422, {"msg": "A user with this email address has already been registered"}):
            resp = self.client.post('/auth/register', json={**self.cadastro, "perfil": "consumidor"})
        self.assertEqual(resp.status_code, 409)
        self.assertIn("já está cadastrado", resp.json()["detail"])

    def test_cadastro_falha_supabase_nao_expoe_detalhe(self):
        with self.simular_admin_api(400, {"msg": "invalid signup internal detail"}):
            resp = self.client.post('/auth/register', json={**self.cadastro, "perfil": "consumidor"})
        self.assertEqual(resp.status_code, 400)
        self.assertNotIn('internal detail', resp.text)

    def test_cadastro_falha_ao_gravar_perfil_desfaz_usuario(self):
        uid = uuid.uuid4()
        sessao = self.autenticar_banco(perfil_existente=self.perfil_trigger(uid), falhar_commit=True)
        respostas = [httpx.Response(200, json={"id": str(uid)}), httpx.Response(200, json={})]
        with patch.object(auth_profile, "_requisitar_admin", new_callable=AsyncMock, side_effect=respostas) as chamada:
            resp = self.client.post('/auth/register', json={**self.cadastro, "perfil": "lojista"})
        self.assertEqual(resp.status_code, 500)
        self.assertTrue(sessao.rolled_back)
        self.assertEqual(chamada.await_args_list[1].args, ("DELETE", f"users/{uid}"))

    def test_cadastro_sem_service_role_retorna_503(self):
        with patch.object(auth_profile.settings, 'supabase_url', 'https://teste.supabase.co'), \
             patch.object(auth_profile.settings, 'supabase_service_role_key', None):
            resp = self.client.post('/auth/register', json={**self.cadastro, "perfil": "consumidor"})
        self.assertEqual(resp.status_code, 503)

    def test_cadastro_service_role_vai_somente_no_header(self):
        uid = uuid.uuid4()
        self.autenticar_banco(perfil_existente=self.perfil_trigger(uid))
        with patch.object(auth_profile.settings, 'supabase_url', 'https://teste.supabase.co'), \
             patch.object(auth_profile.settings, 'supabase_service_role_key', 'segredo-simulado'), \
             patch.object(httpx.AsyncClient, 'request', new_callable=AsyncMock,
                          return_value=httpx.Response(200, json={"id": str(uid)})) as chamada:
            resp = self.client.post('/auth/register', json={**self.cadastro, "perfil": "consumidor"})
        self.assertEqual(resp.status_code, 201, resp.text)
        self.assertNotIn('segredo-simulado', resp.text)
        self.assertEqual(chamada.await_args.args[1], 'https://teste.supabase.co/auth/v1/admin/users')
        self.assertEqual(chamada.await_args.kwargs['headers']['apikey'], 'segredo-simulado')

    def test_login_sucesso(self):
        dados={"access_token":"jwt-simulado","refresh_token":"refresh-simulado", "user":{"id":"abc"}}
        with self.simular_supabase(200,dados) as chamada:
            resp=self.client.post('/auth/login',json=self.login)
        self.assertEqual(resp.status_code,200)
        self.assertEqual(resp.json()['access_token'],'jwt-simulado')
        self.assertEqual(chamada.await_args.args[0],'token')
        self.assertEqual(chamada.await_args.kwargs['parametros'],{'grant_type':'password'})

    def test_login_invalido(self):
        with self.simular_supabase(400,{"error":"invalid_grant"}):
            resp=self.client.post('/auth/login',json=self.login)
        self.assertEqual(resp.status_code,401)

    def test_login_sem_token(self):
        with self.simular_supabase(200,{"user":{}}):
            resp=self.client.post('/auth/login',json=self.login)
        self.assertEqual(resp.status_code,502)

    def test_login_sem_senha(self):
        self.assertEqual(self.client.post('/auth/login',json={"email":"teste@exemplo.com"}).status_code,422)

    def test_me_sem_token(self):
        self.assertEqual(self.client.get('/auth/me').status_code,401)

    def test_me_identifica_tres_perfis(self):
        uid=uuid.uuid4()
        for role in [UserRole.consumidor,UserRole.lojista,UserRole.admin]:
            with self.subTest(role=role.value):
                async def perfil_atual(role=role):
                    return SimpleNamespace(id=uid,role=role,nome_completo='Usuário de Teste')
                app.dependency_overrides[get_current_profile]=perfil_atual
                resp=self.client.get('/auth/me')
                self.assertEqual(resp.status_code,200)
                self.assertEqual(resp.json()['role'],role.value)
                self.assertEqual(resp.json()['id'],str(uid))

    def test_supabase_rate_limit(self):
        with patch.object(auth_profile.settings,'supabase_url','https://teste.supabase.co'), \
             patch.object(auth_profile.settings,'supabase_anon_key','chave-publica-simulada'), \
             patch.object(httpx.AsyncClient,'post',new_callable=AsyncMock,return_value=httpx.Response(429,json={} )):
            resp=self.client.post('/auth/login',json=self.login)
        self.assertEqual(resp.status_code,429)

    def test_supabase_indisponivel(self):
        with patch.object(auth_profile.settings,'supabase_url','https://teste.supabase.co'), \
             patch.object(auth_profile.settings,'supabase_anon_key','chave-publica-simulada'), \
             patch.object(httpx.AsyncClient,'post',new_callable=AsyncMock,side_effect=httpx.ConnectError('offline')):
            resp=self.client.post('/auth/login',json=self.login)
        self.assertEqual(resp.status_code,502)

if __name__ == '__main__':
    unittest.main()

