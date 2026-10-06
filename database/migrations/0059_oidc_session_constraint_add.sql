ALTER TABLE admin_sessions ADD CONSTRAINT admin_sessions_auth_method_check CHECK (auth_method IN ('password', 'feishu', 'oidc')) NOT VALID;
