import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
import httpx
from fastapi.testclient import TestClient
from backend.main import app
from backend.auth import get_current_profile
from backend.controllers import auth_profile
from backend.models import UserRole

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

    def test_cadastro_sucesso(self):
        with self.simular_supabase(200, {"user":{"id":"id-teste"}}) as chamada:
            resp=self.client.post('/auth/register',json=self.cadastro)
        self.assertEqual(resp.status_code,201)
        self.assertTrue(resp.json()['confirmacao_email_pendente'])
        self.assertEqual(chamada.await_args.args[0], 'signup')
        self.assertNotIn('role',chamada.await_args.args[1])

    def test_cadastro_sessao_imediata(self):
        with self.simular_supabase(200,{"access_token":"token-simulado"}):
            resp=self.client.post('/auth/register',json=self.cadastro)
        self.assertEqual(resp.status_code,201)
        self.assertFalse(resp.json()['confirmacao_email_pendente'])

    def test_cadastro_senha_curta(self):
        resp=self.client.post('/auth/register',json={**self.cadastro,"senha":"123"})
        self.assertEqual(resp.status_code,422)

    def test_cadastro_nao_aceita_role_admin(self):
        resp=self.client.post('/auth/register',json={**self.cadastro,"role":"admin"})
        self.assertEqual(resp.status_code,422)

    def test_cadastro_falha_supabase(self):
        with self.simular_supabase(400,{"error":"invalid signup"}):
            resp=self.client.post('/auth/register',json=self.cadastro)
        self.assertEqual(resp.status_code,400)
        self.assertNotIn('invalid signup',resp.text)

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

