import time
import unittest
import uuid
from unittest.mock import AsyncMock, patch

import httpx
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from jose import jwk, jwt

from backend.auth import get_current_user_id
from backend.config.config import settings


class AuthProvedorTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        key = ec.generate_private_key(ec.SECP256R1())
        self.private = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
        public = key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
        self.jwks = jwk.construct(public, 'ES256').to_dict()
        self.jwks['kid'] = 'test-key'
        self.identifier = uuid.uuid4()
        self.provider = 'https://configurado.supabase.co'

    def credentials(self, **overrides):
        payload = {'sub': str(self.identifier), 'aud': 'authenticated', 'iss': f'{self.provider}/auth/v1', 'exp': int(time.time()) + 600}
        payload.update(overrides)
        token = jwt.encode(payload, self.private, algorithm='ES256', headers={'kid': 'test-key'})
        return HTTPAuthorizationCredentials(scheme='Bearer', credentials=token)

    async def verify(self, credentials):
        response = httpx.Response(200, json={'keys': [self.jwks]}, request=httpx.Request('GET', self.provider))
        with patch.object(settings, 'supabase_url', self.provider), patch('backend.auth.httpx.AsyncClient') as constructor:
            client = constructor.return_value.__aenter__.return_value
            client.get = AsyncMock(return_value=response)
            result = await get_current_user_id(credentials)
            client.get.assert_awaited_once_with(f'{self.provider}/auth/v1/.well-known/jwks.json')
            return result

    async def test_usa_provedor_configurado_e_verifica_assinatura(self):
        self.assertEqual(await self.verify(self.credentials()), self.identifier)

    async def test_recusa_token_de_outro_projeto(self):
        with self.assertRaises(HTTPException) as caught:
            await self.verify(self.credentials(iss='https://outro.supabase.co/auth/v1'))
        self.assertEqual(caught.exception.status_code, 401)

    async def test_recusa_token_expirado(self):
        with self.assertRaises(HTTPException) as caught:
            await self.verify(self.credentials(exp=int(time.time()) - 60))
        self.assertEqual(caught.exception.status_code, 401)

    async def test_falta_de_configuracao_e_de_token(self):
        with patch.object(settings, 'supabase_url', None):
            with self.assertRaises(HTTPException) as caught:
                await get_current_user_id(self.credentials())
            self.assertEqual(caught.exception.status_code, 503)
        with self.assertRaises(HTTPException) as caught:
            await get_current_user_id(None)
        self.assertEqual(caught.exception.status_code, 401)
