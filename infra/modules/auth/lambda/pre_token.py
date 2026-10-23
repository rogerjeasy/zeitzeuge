"""Cognito pre-token-generation hook (event version V2_0).

Copies the two custom attributes the API authorises on — `custom:tenant_id`
and `custom:role` — into the *access* token. Cognito puts custom attributes in
the ID token only; the API validates access tokens, and turns `tenant_id` into
`SET LOCAL app.tenant_id` for row-level security. Without this hook there is
nothing for RLS to enforce.

Users cannot write either attribute (the app client's write_attributes exclude
them); only the API, through the admin APIs, sets them.
"""

CLAIMS = ("custom:tenant_id", "custom:role")


def handler(event, _context):
    attributes = event["request"].get("userAttributes", {})
    claims = {name: attributes[name] for name in CLAIMS if attributes.get(name)}

    event["response"]["claimsAndScopeOverrideDetails"] = {
        "idTokenGeneration": {"claimsToAddOrOverride": claims},
        "accessTokenGeneration": {"claimsToAddOrOverride": claims},
    }
    return event
