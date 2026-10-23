# Module: auth
#
# Cognito user pool, groups mapped to archive roles, and the guest demo path.
#
# Resources owned by this module:
#   - User pool (email sign-in, MFA optional, advanced security mode)
#   - hosted UI domain
#   - app client for the API (confidential: the API signs in on the user's behalf)
#   - app client for machine-to-machine (client credentials, for the OAI-PMH harvester)
#   - groups: admin, archivist, reviewer, operator, reader, guest
#   - pre-token-generation Lambda hook injecting tenant_id into the JWT
#   - the guest credential for "Als Gast demo starten" (the user itself is
#     seeded by apps/api/scripts/seed_demo.py, which knows the tenant id)
#
# The API already codes against this module. What it requires, concretely
# (apps/api/README.md repeats the list, and apps/api/src/zeitzeuge_api/
# integrations/aws/cognito.py is the code that depends on it):
#
#   user pool     username_attributes    = ["email"]
#                 auto_verified_attributes = ["email"]
#                 password policy: min 8, upper + lower + digit + symbol
#                   — must equal apps/api/src/zeitzeuge_api/schemas/password.py
#                   and apps/web/src/lib/auth/password.ts
#                 custom attributes: `tenant_id` (String, mutable),
#                   `role` (String, mutable)  ← the pre-token hook reads these
#
#   web client    generate_secret = true      (the API is confidential)
#                 explicit_auth_flows = [
#                   "ALLOW_ADMIN_USER_PASSWORD_AUTH",  # the API signs in for the user
#                   "ALLOW_REFRESH_TOKEN_AUTH",
#                 ]
#                 prevent_user_existence_errors = "ENABLED"   # no enumeration
#                 enable_token_revocation = true              # POST /auth/logout
#
#   groups        admin · archivist · reviewer · operator · reader · guest
#                   — the names are the values of UserRole in
#                     apps/api/src/zeitzeuge_api/db/models/enums.py
#
#   outputs       user_pool_id, user_pool_arn, web_client_id,
#                 web_client_secret_arn (Secrets Manager, not a plain output)
#
data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  name = "${var.project}-${var.env}"

  # UserRole in apps/api/src/zeitzeuge_api/db/models/enums.py, most to least
  # privileged. Precedence decides which group's role wins for a multi-group user.
  groups = ["admin", "archivist", "reviewer", "operator", "reader", "guest"]
}

# ---------------------------------------------------------------------------
# Pre-token hook
# ---------------------------------------------------------------------------

data "archive_file" "pre_token" {
  type        = "zip"
  source_file = "${path.module}/lambda/pre_token.py"
  output_path = "${path.module}/.build/pre_token.zip"
}

resource "aws_cloudwatch_log_group" "pre_token" {
  name              = "/aws/lambda/${local.name}-cognito-pre-token"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.logs_kms_key_arn
  tags              = var.tags
}

resource "aws_lambda_function" "pre_token" {
  function_name    = "${local.name}-cognito-pre-token"
  description      = "Copies custom:tenant_id and custom:role into the access token (RLS)."
  role             = var.pre_token_role_arn
  runtime          = "python3.13"
  architectures    = ["arm64"]
  handler          = "pre_token.handler"
  filename         = data.archive_file.pre_token.output_path
  source_code_hash = data.archive_file.pre_token.output_base64sha256
  memory_size      = 128
  timeout          = 5 # Cognito gives a trigger 5 s

  logging_config {
    log_format = "JSON"
    log_group  = aws_cloudwatch_log_group.pre_token.name
  }

  tags = var.tags
}

resource "aws_lambda_permission" "cognito" {
  statement_id  = "AllowCognitoInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.pre_token.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.this.arn
}

# ---------------------------------------------------------------------------
# User pool
# ---------------------------------------------------------------------------

resource "aws_cognito_user_pool" "this" {
  name = local.name

  # Plus: threat protection (adaptive auth, compromised-credential checks) and
  # the V2 pre-token trigger that can write access-token claims. USD 0.02/MAU.
  user_pool_tier      = "PLUS"
  deletion_protection = var.deletion_protection ? "ACTIVE" : "INACTIVE"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  username_configuration {
    case_sensitive = false
  }

  # Must equal apps/api/src/zeitzeuge_api/schemas/password.py and
  # apps/web/src/lib/auth/password.ts — the three are one policy.
  password_policy {
    minimum_length                   = 8
    require_uppercase                = true
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 3
    password_history_size            = 5
  }

  mfa_configuration = "OPTIONAL"

  software_token_mfa_configuration {
    enabled = true
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  user_pool_add_ons {
    advanced_security_mode = "ENFORCED"
  }

  admin_create_user_config {
    allow_admin_create_user_only = false # the API's /auth/register signs users up
  }

  # 50 mails/day on the Cognito sender. Enough for verification and resets in
  # a demo; the guest path sends none. Move to SES before real onboarding.
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  schema {
    name                     = "tenant_id"
    attribute_data_type      = "String"
    mutable                  = true
    developer_only_attribute = false
    string_attribute_constraints {
      min_length = 0
      max_length = 64
    }
  }

  schema {
    name                     = "role"
    attribute_data_type      = "String"
    mutable                  = true
    developer_only_attribute = false
    string_attribute_constraints {
      min_length = 0
      max_length = 32
    }
  }

  lambda_config {
    pre_token_generation_config {
      lambda_arn     = aws_lambda_function.pre_token.arn
      lambda_version = "V2_0"
    }
  }

  tags = var.tags
}

resource "aws_cognito_user_group" "this" {
  for_each = { for i, g in local.groups : g => i }

  name         = each.key
  user_pool_id = aws_cognito_user_pool.this.id
  precedence   = each.value
  description  = "UserRole.${upper(each.key)}"
}

# ---------------------------------------------------------------------------
# App clients
# ---------------------------------------------------------------------------

# The API is a confidential server-side client: it runs AdminInitiateAuth for
# the browser, so the secret never reaches a device.
resource "aws_cognito_user_pool_client" "web" {
  name         = "${local.name}-web"
  user_pool_id = aws_cognito_user_pool.this.id

  generate_secret = true
  explicit_auth_flows = [
    "ALLOW_ADMIN_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  prevent_user_existence_errors = "ENABLED" # no account enumeration
  enable_token_revocation       = true      # POST /auth/logout

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = var.session_idle_days
  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  read_attributes = ["email", "email_verified", "name", "custom:tenant_id", "custom:role"]

  # Deliberately excludes custom:tenant_id and custom:role. If a user could
  # write their own tenant, RLS would isolate nothing.
  write_attributes = ["email", "name"]
}

# Machine-to-machine: the OAI-PMH harvester and other archive systems.
resource "aws_cognito_resource_server" "api" {
  identifier   = "${local.name}-api"
  name         = "ZEITZEUGE API"
  user_pool_id = aws_cognito_user_pool.this.id

  scope {
    scope_name        = "harvest.read"
    scope_description = "Read published records over OAI-PMH."
  }
}

resource "aws_cognito_user_pool_domain" "this" {
  domain       = "${local.name}-${data.aws_caller_identity.current.account_id}"
  user_pool_id = aws_cognito_user_pool.this.id
}

resource "aws_cognito_user_pool_client" "harvester" {
  name         = "${local.name}-harvester"
  user_pool_id = aws_cognito_user_pool.this.id

  generate_secret                      = true
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["client_credentials"]
  allowed_oauth_scopes                 = ["${aws_cognito_resource_server.api.identifier}/harvest.read"]
  supported_identity_providers         = ["COGNITO"]
  explicit_auth_flows                  = ["ALLOW_REFRESH_TOKEN_AUTH"]
  access_token_validity                = 60
  token_validity_units {
    access_token = "minutes"
  }
}

# ---------------------------------------------------------------------------
# Secrets the API reads by reference (secretsmanager://arn#key)
# ---------------------------------------------------------------------------
#
# Client secrets are already in Terraform state (Cognito returns them on
# create); writing them to Secrets Manager adds no exposure and means the task
# definition carries only ARNs.

resource "random_password" "guest" {
  length           = 32
  special          = true
  override_special = "!#%*-_=+"
  min_upper        = 2
  min_lower        = 2
  min_numeric      = 2
  min_special      = 2
}

locals {
  secrets = {
    web = {
      description = "API app client: ZZ_COGNITO_CLIENT_SECRET_REF=secretsmanager://<arn>#client_secret"
      value = {
        client_id     = aws_cognito_user_pool_client.web.id
        client_secret = aws_cognito_user_pool_client.web.client_secret
      }
    }
    guest = {
      description = "Guest identity behind 'Als Gast demo starten': ZZ_GUEST_PASSWORD_REF=secretsmanager://<arn>#password"
      value = {
        username = var.guest_username
        password = random_password.guest.result
      }
    }
    harvester = {
      description = "Machine client for OAI-PMH harvesting (client_credentials)."
      value = {
        client_id     = aws_cognito_user_pool_client.harvester.id
        client_secret = aws_cognito_user_pool_client.harvester.client_secret
        token_url     = "https://${aws_cognito_user_pool_domain.this.domain}.auth.${data.aws_region.current.region}.amazoncognito.com/oauth2/token"
        scope         = "${aws_cognito_resource_server.api.identifier}/harvest.read"
      }
    }
  }
}

resource "aws_secretsmanager_secret" "this" {
  for_each = local.secrets

  name                    = "${var.project}/${var.env}/cognito/${each.key}"
  description             = each.value.description
  kms_key_id              = var.secrets_kms_key_arn
  recovery_window_in_days = var.secret_recovery_window_days
  tags                    = var.tags
}

resource "aws_secretsmanager_secret_version" "this" {
  for_each = local.secrets

  secret_id     = aws_secretsmanager_secret.this[each.key].id
  secret_string = jsonencode(each.value.value)
}
