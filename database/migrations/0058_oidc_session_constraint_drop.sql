-- Allow native OIDC sessions without changing password or Feishu sessions.
ALTER TABLE admin_sessions DROP CONSTRAINT IF EXISTS admin_sessions_auth_method_check;
