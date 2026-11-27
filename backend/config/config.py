from pydantic_settings import BaseSettings, SettingsConfigDict


DEFAULT_CORS_ORIGINS = "http://127.0.0.1:5173,http://localhost:5173"


class Settings(BaseSettings):
    # Obrigatória: conexão com o PostgreSQL do Supabase.
    database_url: str
    # URL do projeto Supabase (Auth, JWKS e Storage).
    supabase_url: str | None = None
    # Chave pública. Usada apenas pelo endpoint opcional POST /auth/login.
    supabase_anon_key: str | None = None
    # Chave secreta, exclusiva do backend: cadastro (Admin API) e Storage.
    supabase_service_role_key: str | None = None
    # Mantida apenas por compatibilidade com .env antigos; a validação do JWT
    # é feita pelas chaves públicas (JWKS) do projeto Supabase.
    supabase_jwt_secret: str | None = None
    # Origens autorizadas a chamar a API pelo navegador, separadas por vírgula.
    cors_origins: str = DEFAULT_CORS_ORIGINS

    model_config = SettingsConfigDict(env_file="backend/.env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origem.strip() for origem in self.cors_origins.split(",") if origem.strip()]


settings = Settings()
