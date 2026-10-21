#!/usr/bin/env python3
"""App Store Connect helpers for the Timia iOS TestFlight workflow.

The workflow calls subcommands of this script. `self-test` covers version
selection, signing-project edits, export options, the temporary scheme, and
ES256 JWT signing without network access or real secrets.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import plistlib
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

IOS_BUNDLE_ID = "online.timia.ios"
WIDGET_BUNDLE_ID = "online.timia.ios.widget"
ASC_APP_ID = "6796896382"
# project.yml declares xcodeVersion 26.0 (Swift 6). Deployment target is iOS 17,
# which Xcode 26.6's SDK still builds (supported range iOS 15–26.5).
MIN_XCODE = "26.0"
MIN_IOS_SDK = "17.0"
ASC_API = "https://api.appstoreconnect.apple.com"
SIGNED_BUNDLE_IDS = (IOS_BUNDLE_ID, WIDGET_BUNDLE_ID)
IOS_PROFILE_ENTITLEMENTS = (
    "com.apple.developer.healthkit",
    "com.apple.developer.healthkit.background-delivery",
)

REPO_ROOT = Path(__file__).resolve().parents[2]
PBXPROJ = REPO_ROOT / "codes/mobile/ios/Timia.xcodeproj/project.pbxproj"
IPHONE_PLIST = REPO_ROOT / "codes/mobile/ios/Timia/Resources/Info.plist"
WIDGET_PLIST = REPO_ROOT / "codes/mobile/ios/TimiaWidget/Info.plist"
WORKFLOW = REPO_ROOT / ".github/workflows/ios-testflight.yml"

REQUIRED_SECRETS = (
    "ASC_ISSUER_ID",
    "ASC_KEY_ID",
    "ASC_API_KEY_P8",
    "BUILD_CERTIFICATE_BASE64",
    "P12_PASSWORD",
    "BUILD_PROVISION_PROFILE_BASE64",
    "BUILD_PROVISION_PROFILE_WIDGET_BASE64",
    "APPLE_TEAM_ID",
)

PROFILE_DIRS = (
    Path.home() / "Library/MobileDevice/Provisioning Profiles",
    Path.home() / "Library/Developer/Xcode/UserData/Provisioning Profiles",
)


class AscError(RuntimeError):
    def __init__(self, message: str, *, auth: bool = False, transient: bool = False):
        super().__init__(message)
        self.auth = auth
        self.transient = transient


def eprint(message: str) -> None:
    print(message, file=sys.stderr)


def parse_dotted(value: str) -> tuple[int, ...] | None:
    text = value.strip()
    if not text or not re.fullmatch(r"[0-9]+(\.[0-9]+)*", text):
        return None
    return tuple(int(part) for part in text.split("."))


def format_dotted(parts: tuple[int, ...]) -> str:
    return ".".join(str(part) for part in parts)


def higher_version(versions: list[str]) -> str:
    """Keep the highest marketing version. CI does not invent a new one."""
    parsed: list[tuple[tuple[int, ...], str]] = []
    for version in versions:
        key = parse_dotted(version)
        if key is None:
            raise ValueError(f"marketing version is not numeric: {version!r}")
        parsed.append((key, version))
    if not parsed:
        raise ValueError("no marketing version")
    return max(parsed, key=lambda item: item[0])[1]


def next_build_number(versions: list[str]) -> str | None:
    """Return max+1. Empty input means there is no build yet (caller uses '1').

    Unparseable strings are ignored. If nothing parses, return None so the
    caller can fall back instead of guessing 1 over a real upload.
    """
    parsed = [key for version in versions if (key := parse_dotted(version.strip()))]
    if not parsed:
        return None
    best = list(max(parsed))
    best[-1] += 1
    return format_dotted(tuple(best))


def choose_build_number(versions: list[str] | None, fallback: str) -> str:
    """versions is None when the API could not be queried."""
    if versions is None:
        if parse_dotted(fallback) is None:
            raise ValueError("fallback build number is not numeric")
        return fallback.strip()
    if not versions:
        return "1"
    chosen = next_build_number(versions)
    if chosen is None:
        if parse_dotted(fallback) is None:
            raise ValueError("fallback build number is not numeric")
        return fallback.strip()
    return chosen


def b64decode_relaxed(value: str) -> bytes:
    compact = "".join(value.split())
    return base64.b64decode(compact, validate=True)


def missing_secrets(env: dict[str, str]) -> list[str]:
    return [name for name in REQUIRED_SECRETS if not env.get(name, "").strip()]


def normalize_pem(value: str) -> str:
    text = value.strip()
    if "PRIVATE KEY" not in text:
        raise AscError("ASC_API_KEY_P8 does not look like a PEM private key.")
    return text + "\n"


def validate_key_id(key_id: str) -> str:
    key_id = key_id.strip()
    if not re.fullmatch(r"[A-Za-z0-9]+", key_id):
        raise AscError("ASC_KEY_ID contains unexpected characters; refusing to build a key path.")
    return key_id


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def der_ecdsa_to_raw(der: bytes) -> bytes:
    """Convert an OpenSSL ECDSA DER signature to the 64-byte JOSE form."""
    if len(der) < 8 or der[0] != 0x30:
        raise AscError("OpenSSL did not return an ECDSA DER signature.")
    index = 2
    if der[1] & 0x80:
        length_octets = der[1] & 0x7F
        index = 2 + length_octets
    integers: list[bytes] = []
    for _ in range(2):
        if index >= len(der) or der[index] != 0x02:
            raise AscError("ECDSA signature is missing an integer.")
        length = der[index + 1]
        start = index + 2
        integers.append(der[start : start + length])
        index = start + length
    raw = b"".join(part[-32:].rjust(32, b"\x00") for part in integers)
    if len(raw) != 64:
        raise AscError("ECDSA signature is not P-256.")
    return raw


def raw_ecdsa_to_der(raw: bytes) -> bytes:
    if len(raw) != 64:
        raise ValueError("raw signature must be 64 bytes")

    def encode_int(value: bytes) -> bytes:
        value = value.lstrip(b"\x00") or b"\x00"
        if value[0] & 0x80:
            value = b"\x00" + value
        return bytes([0x02, len(value)]) + value

    body = encode_int(raw[:32]) + encode_int(raw[32:])
    if len(body) > 127:
        raise ValueError("DER signature is unexpectedly long")
    return bytes([0x30, len(body)]) + body


def es256_sign(message: bytes, key_path: Path) -> bytes:
    proc = subprocess.run(
        ["openssl", "dgst", "-sha256", "-sign", str(key_path)],
        input=message,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        detail = proc.stderr.decode("utf-8", "replace")
        if "PRIVATE" in detail or "BEGIN" in detail:
            detail = "openssl refused the API key"
        raise AscError(f"Could not sign the App Store Connect token ({detail.strip()[:200]}).")
    return der_ecdsa_to_raw(proc.stdout)


def make_asc_jwt(key_id: str, issuer_id: str, key_path: Path, now: int | None = None) -> str:
    issued = int(time.time() if now is None else now)
    header = {"alg": "ES256", "kid": key_id, "typ": "JWT"}
    payload = {
        "iss": issuer_id.strip(),
        "iat": issued,
        "exp": issued + 15 * 60,
        "aud": "appstoreconnect-v1",
    }
    signing_input = ".".join(
        [
            b64url(json.dumps(header, separators=(",", ":")).encode()),
            b64url(json.dumps(payload, separators=(",", ":")).encode()),
        ]
    )
    signature = es256_sign(signing_input.encode(), key_path)
    return f"{signing_input}.{b64url(signature)}"


class Transport:
    def __init__(self, token: str):
        self.token = token

    def request(self, method: str, url: str, body: dict | None = None) -> tuple[int, dict]:
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(
            url,
            data=data,
            method=method,
            headers={
                "Authorization": f"Bearer {self.token}",
                "Accept": "application/json",
                "Content-Type": "application/json",
                "User-Agent": "timia-testflight-ci",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                raw = response.read()
                status = response.status
        except urllib.error.HTTPError as exc:
            raw = exc.read()
            status = exc.code
        except urllib.error.URLError as exc:
            raise AscError(f"App Store Connect network error: {exc.reason}", transient=True) from exc
        parsed: dict = {}
        if raw:
            try:
                loaded = json.loads(raw.decode())
            except json.JSONDecodeError as exc:
                raise AscError(
                    f"App Store Connect returned non-JSON (HTTP {status}).",
                    transient=status >= 500,
                    auth=status in (401, 403),
                ) from exc
            if isinstance(loaded, dict):
                parsed = loaded
        if status in (401, 403):
            raise AscError(
                "App Store Connect rejected the API token (HTTP "
                f"{status}). Check ASC_KEY_ID, ASC_ISSUER_ID, and ASC_API_KEY_P8.",
                auth=True,
            )
        if status >= 500:
            raise AscError(f"App Store Connect returned HTTP {status}.", transient=True)
        return status, parsed


def _error_detail(payload: dict) -> str:
    errors = payload.get("errors") or []
    if not errors:
        return ""
    first = errors[0]
    title = str(first.get("title") or "")
    detail = str(first.get("detail") or "")
    text = f"{title}: {detail}".strip(": ")
    return text[:300]


def api_key_path() -> Path:
    key_id = validate_key_id(require_env("ASC_KEY_ID"))
    return Path.home() / "private_keys" / f"AuthKey_{key_id}.p8"


def write_api_key() -> Path:
    path = api_key_path()
    path.parent.mkdir(mode=0o700, exist_ok=True)
    pem = normalize_pem(require_env("ASC_API_KEY_P8"))
    path.write_text(pem)
    path.chmod(0o600)
    eprint(f"Wrote App Store Connect API key ({path.stat().st_size} bytes) under private_keys.")
    return path


def require_env(name: str) -> str:
    value = os.environ.get(name, "")
    if not value.strip():
        raise AscError(f"Missing required environment variable {name}.")
    return value


def token_from_env() -> str:
    key_path = write_api_key()
    return make_asc_jwt(
        validate_key_id(require_env("ASC_KEY_ID")),
        require_env("ASC_ISSUER_ID"),
        key_path,
    )


def resolve_app_id(transport: Transport) -> str:
    status, payload = transport.request(
        "GET",
        f"{ASC_API}/v1/apps?filter[bundleId]={IOS_BUNDLE_ID}&limit=5&fields[apps]=bundleId",
    )
    if status != 200:
        raise AscError(
            f"App lookup failed (HTTP {status}) {_error_detail(payload)}".strip(),
            transient=status >= 500,
        )
    matches = [
        item
        for item in payload.get("data") or []
        if (item.get("attributes") or {}).get("bundleId") == IOS_BUNDLE_ID
    ]
    if matches:
        app_id = str(matches[0]["id"])
        if app_id != ASC_APP_ID:
            eprint(
                f"Bundle id {IOS_BUNDLE_ID} resolved to app {app_id}, "
                f"which differs from the expected id {ASC_APP_ID}. Using the bundle-id match."
            )
        return app_id
    status, payload = transport.request(
        "GET",
        f"{ASC_API}/v1/apps/{ASC_APP_ID}?fields[apps]=bundleId",
    )
    bundle = ((payload.get("data") or {}).get("attributes") or {}).get("bundleId")
    if status == 200 and bundle == IOS_BUNDLE_ID:
        return ASC_APP_ID
    raise AscError(
        f"No App Store Connect app with bundle id {IOS_BUNDLE_ID} (HTTP {status})."
    )


def _build_versions_from_page(payload: dict) -> list[str]:
    versions: list[str] = []
    for item in payload.get("data") or []:
        version = (item.get("attributes") or {}).get("version")
        if version is not None:
            versions.append(str(version))
    return versions


def paginate(transport: Transport, url: str) -> list[dict]:
    pages: list[dict] = []
    seen: set[str] = set()
    while url and len(pages) < 20:
        if url in seen:
            break
        seen.add(url)
        status, payload = transport.request("GET", url)
        if status != 200:
            raise AscError(
                f"Build query failed (HTTP {status}) {_error_detail(payload)}".strip(),
                transient=status >= 500,
            )
        pages.append(payload)
        url = str((payload.get("links") or {}).get("next") or "")
    return pages


def fetch_build_versions(transport: Transport, app_id: str, marketing: str) -> list[str]:
    quoted = urllib.request.quote(marketing)
    pre_url = (
        f"{ASC_API}/v1/preReleaseVersions?filter[app]={app_id}"
        f"&filter[platform]=IOS&filter[version]={quoted}&limit=10"
    )
    pages = paginate(transport, pre_url)
    versions: list[str] = []
    found_train = False
    for page in pages:
        for item in page.get("data") or []:
            attributes = item.get("attributes") or {}
            if not versions_equal(str(attributes.get("version") or ""), marketing):
                continue
            found_train = True
            related = (
                ((item.get("relationships") or {}).get("builds") or {})
                .get("links", {})
                .get("related")
            )
            if related:
                builds_url = str(related)
                if "fields[builds]" not in builds_url:
                    join = "&" if "?" in builds_url else "?"
                    builds_url = f"{builds_url}{join}fields[builds]=version"
            else:
                builds_url = (
                    f"{ASC_API}/v1/preReleaseVersions/{item['id']}/builds"
                    "?limit=200&fields[builds]=version"
                )
            for build_page in paginate(transport, builds_url):
                versions.extend(_build_versions_from_page(build_page))
    if found_train:
        return versions

    scan_url = (
        f"{ASC_API}/v1/builds?filter[app]={app_id}&limit=200&sort=-uploadedDate"
        "&include=preReleaseVersion&fields[builds]=version"
        "&fields[preReleaseVersions]=version,platform"
    )
    included_versions: dict[str, str] = {}
    matched: list[str] = []
    for page in paginate(transport, scan_url):
        for item in page.get("included") or []:
            if item.get("type") != "preReleaseVersions":
                continue
            attributes = item.get("attributes") or {}
            if attributes.get("platform") not in (None, "IOS"):
                continue
            included_versions[str(item.get("id"))] = str(attributes.get("version") or "")
        for item in page.get("data") or []:
            relation = (
                ((item.get("relationships") or {}).get("preReleaseVersion") or {})
                .get("data")
                or {}
            )
            marketing_version = included_versions.get(str(relation.get("id")))
            if marketing_version and versions_equal(marketing_version, marketing):
                version = (item.get("attributes") or {}).get("version")
                if version is not None:
                    matched.append(str(version))
    return matched


def versions_equal(left: str, right: str) -> bool:
    left_key = parse_dotted(left)
    right_key = parse_dotted(right)
    if left_key is None or right_key is None:
        return left.strip() == right.strip()
    width = max(len(left_key), len(right_key))
    return left_key + (0,) * (width - len(left_key)) == right_key + (0,) * (width - len(right_key))


def query_next_build(marketing: str, fallback: str) -> str:
    try:
        transport = Transport(token_from_env())
        app_id = resolve_app_id(transport)
        versions = fetch_build_versions(transport, app_id, marketing)
    except AscError as exc:
        if exc.auth or not exc.transient:
            raise
        eprint(f"ASC build query failed ({exc}). Falling back to github.run_number.")
        return choose_build_number(None, fallback)
    if not versions:
        eprint(f"No ASC builds for marketing version {marketing}; using build 1.")
        return "1"
    chosen = choose_build_number(versions, fallback)
    numeric = [version for version in versions if parse_dotted(version)]
    eprint(
        f"ASC builds for {marketing}: {', '.join(sorted(numeric, key=parse_dotted)[:12])}. "
        f"Next build is {chosen}."
    )
    return chosen


def decode_base64_file(env_name: str, dest: Path) -> None:
    try:
        data = b64decode_relaxed(require_env(env_name))
    except Exception as exc:
        raise AscError(f"{env_name} is not valid base64.") from exc
    if len(data) < 64:
        raise AscError(f"{env_name} decoded to only {len(data)} bytes.")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    dest.chmod(0o600)
    eprint(f"Decoded {env_name} ({len(data)} bytes).")


def bundle_id_from_application_identifier(application_id: str, team_id: str) -> str:
    prefix = team_id + "."
    if application_id.startswith(prefix):
        bundle_id = application_id[len(prefix) :]
    else:
        bundle_id = application_id.split(".", 1)[-1]
    if "*" in bundle_id:
        raise AscError(
            "Provisioning profile uses a wildcard bundle id. "
            "App Store profiles for this app must be explicit."
        )
    return bundle_id


def assert_app_store_profile(profile: dict, expected_bundle: str, team_id: str) -> dict[str, str]:
    entitlements = profile.get("Entitlements") or {}
    application_id = str(entitlements.get("application-identifier") or "")
    if not application_id:
        raise AscError("Provisioning profile has no application-identifier.")
    teams = [str(item) for item in profile.get("TeamIdentifier") or []]
    if team_id not in teams:
        raise AscError(
            f"Provisioning profile team {', '.join(teams) or '(none)'} "
            f"does not include {team_id}."
        )
    bundle_id = bundle_id_from_application_identifier(application_id, team_id)
    if bundle_id != expected_bundle:
        raise AscError(
            f"Provisioning profile bundle id is {bundle_id}, expected {expected_bundle}."
        )
    if profile.get("ProvisionedDevices") or profile.get("ProvisionsAllDevices"):
        raise AscError(
            f"Profile {profile.get('Name', '')!r} is not an App Store profile "
            "(it lists devices or is an enterprise profile)."
        )
    if entitlements.get("get-task-allow") is True:
        raise AscError(
            f"Profile {profile.get('Name', '')!r} is a development profile (get-task-allow)."
        )
    expiration = profile.get("ExpirationDate")
    if hasattr(expiration, "timestamp") and expiration.timestamp() < time.time():
        raise AscError(f"Provisioning profile {profile.get('Name', '')!r} is expired.")
    name = str(profile.get("Name") or "")
    uuid = str(profile.get("UUID") or "")
    if not name or not uuid:
        raise AscError("Provisioning profile is missing Name or UUID.")
    return {"name": name, "uuid": uuid, "bundle_id": bundle_id}


def assert_profile_entitlements(profile: dict, keys: tuple[str, ...]) -> None:
    entitlements = profile.get("Entitlements") or {}
    missing = [key for key in keys if not entitlements.get(key)]
    if missing:
        raise AscError(
            f"Provisioning profile {profile.get('Name', '')!r} is missing {', '.join(missing)}. "
            "Enable those capabilities on the App ID and regenerate the App Store profile."
        )


def decode_mobileprovision(path: Path) -> dict:
    proc = subprocess.run(
        ["security", "cms", "-D", "-i", str(path)],
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        raise AscError(f"Could not decode provisioning profile {path.name}.")
    try:
        loaded = plistlib.loads(proc.stdout)
    except Exception as exc:
        raise AscError(f"Decoded provisioning profile {path.name} is not a plist.") from exc
    if not isinstance(loaded, dict):
        raise AscError(f"Decoded provisioning profile {path.name} is not a dictionary.")
    return loaded


def install_profile(profile: dict, source: Path) -> None:
    uuid = str(profile["UUID"])
    for directory in PROFILE_DIRS:
        directory.mkdir(parents=True, exist_ok=True)
        dest = directory / f"{uuid}.mobileprovision"
        shutil.copyfile(source, dest)
        dest.chmod(0o644)
    eprint(
        f"Installed profile {profile['Name']!r} ({profile['UUID']}) "
        "under ~/Library/MobileDevice/Provisioning Profiles/."
    )


def pick_identity(text: str) -> str:
    names = re.findall(r'"([^"]+)"', text)
    for prefix in ("Apple Distribution", "iPhone Distribution"):
        for name in names:
            if name.startswith(prefix):
                return name
    found = ", ".join(names) if names else "(none)"
    raise AscError(
        "Imported p12 has no Apple Distribution identity. "
        f"Codesigning names found: {found}. Export an Apple Distribution certificate."
    )


def pbx_quote(value: str) -> str:
    if re.fullmatch(r"[A-Za-z0-9._/$()+-]+", value):
        return value
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def upsert_setting(settings: str, key: str, literal: str) -> str:
    pattern = re.compile(rf"^(\t+){re.escape(key)} = .*;$", re.MULTILINE)
    match = pattern.search(settings)
    if match:
        indent = match.group(1)
        return pattern.sub(lambda _m: f"{indent}{key} = {literal};", settings, count=1)
    indent_match = re.search(r"^(\t+)CODE_SIGN_STYLE = .*;\n", settings, re.MULTILINE)
    indent = indent_match.group(1) if indent_match else "\t\t\t\t"
    insertion = f"{indent}{key} = {literal};\n"
    if indent_match:
        return settings[: indent_match.end()] + insertion + settings[indent_match.end() :]
    if settings and not settings.endswith("\n"):
        settings += "\n"
    return settings + insertion


BLOCK_RE = re.compile(
    r"/\* (?P<label>Debug|Release) \*/ = \{\n"
    r"\t\t\tisa = XCBuildConfiguration;\n"
    r"(?:\t\t\tbaseConfigurationReference = [^\n]*;\n)?"
    r"\t\t\tbuildSettings = \{\n"
    r"(?P<settings>.*?)\n"
    r"\t\t\t\};\n"
    r"\t\t\tname = (?P<config>Debug|Release);\n"
    r"\t\t\};",
    re.DOTALL,
)


def _bundle_id(settings: str) -> str | None:
    match = re.search(r'PRODUCT_BUNDLE_IDENTIFIER = "?([^";]+)"?;', settings)
    return match.group(1) if match else None


def _setting_value(settings: str, key: str) -> str | None:
    match = re.search(rf"{re.escape(key)} = \"?([^;\"]+)\"?;", settings)
    return match.group(1) if match else None


def _replace_settings(match: re.Match[str], settings: str) -> str:
    return (
        match.group(0)[: match.start("settings") - match.start(0)]
        + settings
        + match.group(0)[match.end("settings") - match.start(0) :]
    )


def release_marketing_versions(text: str) -> dict[str, str]:
    """Marketing version for the app and widget.

    Target Release blocks inherit MARKETING_VERSION from the project-level
    Release configuration when they do not set it themselves.
    """
    found: dict[str, str] = {}
    project_version: str | None = None
    for match in BLOCK_RE.finditer(text):
        if match.group("config") != "Release":
            continue
        settings = match.group("settings")
        bundle_id = _bundle_id(settings)
        marketing = _setting_value(settings, "MARKETING_VERSION")
        if bundle_id in SIGNED_BUNDLE_IDS and marketing:
            found[bundle_id] = marketing
        elif bundle_id is None and marketing:
            project_version = marketing
    if project_version:
        for bundle_id in SIGNED_BUNDLE_IDS:
            found.setdefault(bundle_id, project_version)
    missing = set(SIGNED_BUNDLE_IDS) - set(found)
    if missing:
        raise AscError(f"MARKETING_VERSION not found for: {', '.join(sorted(missing))}")
    return found


def patch_pbxproj(
    text: str,
    *,
    ios_profile: str,
    widget_profile: str,
    ios_profile_uuid: str,
    widget_profile_uuid: str,
    identity: str,
    team_id: str,
    build_number: str,
    marketing_version: str,
) -> str:
    if parse_dotted(build_number) is None:
        raise AscError(f"Refusing non-numeric build number {build_number!r}.")
    if parse_dotted(marketing_version) is None:
        raise AscError(f"Refusing non-numeric marketing version {marketing_version!r}.")
    if not re.fullmatch(r"[A-Z0-9]+", team_id):
        raise AscError("APPLE_TEAM_ID has unexpected characters.")
    profiles = {
        IOS_BUNDLE_ID: (ios_profile, ios_profile_uuid),
        WIDGET_BUNDLE_ID: (widget_profile, widget_profile_uuid),
    }
    updated: list[str] = []
    project_release_updated = False

    def replace(match: re.Match[str]) -> str:
        nonlocal project_release_updated
        settings = match.group("settings")
        config = match.group("config")
        if config != "Release":
            return match.group(0)
        bundle_id = _bundle_id(settings)
        if bundle_id in profiles:
            profile_name, profile_uuid = profiles[bundle_id]
            settings = upsert_setting(settings, "CODE_SIGN_STYLE", "Manual")
            settings = upsert_setting(settings, "CODE_SIGN_IDENTITY", pbx_quote(identity))
            settings = upsert_setting(
                settings, "PROVISIONING_PROFILE_SPECIFIER", pbx_quote(profile_name)
            )
            settings = upsert_setting(settings, "PROVISIONING_PROFILE", pbx_quote(profile_uuid))
            settings = upsert_setting(settings, "DEVELOPMENT_TEAM", team_id)
            settings = upsert_setting(settings, "CURRENT_PROJECT_VERSION", build_number)
            settings = upsert_setting(settings, "MARKETING_VERSION", marketing_version)
            updated.append(bundle_id)
            return _replace_settings(match, settings)
        if bundle_id is None and _setting_value(settings, "MARKETING_VERSION"):
            settings = upsert_setting(settings, "CURRENT_PROJECT_VERSION", build_number)
            settings = upsert_setting(settings, "MARKETING_VERSION", marketing_version)
            project_release_updated = True
            return _replace_settings(match, settings)
        return match.group(0)

    patched = BLOCK_RE.sub(replace, text)
    if sorted(set(updated)) != sorted(profiles):
        raise AscError(
            "Could not patch both Release targets. Updated: " + ", ".join(updated or ["none"])
        )
    if not project_release_updated:
        raise AscError("Could not patch the project-level Release version.")
    return patched


def write_export_options(
    path: Path,
    *,
    team_id: str,
    identity: str,
    ios_profile: str,
    widget_profile: str,
) -> None:
    payload = {
        "method": "app-store-connect",
        "destination": "export",
        "teamID": team_id,
        "signingStyle": "manual",
        "signingCertificate": identity,
        "uploadSymbols": True,
        "manageAppVersionAndBuildNumber": False,
        "provisioningProfiles": {
            IOS_BUNDLE_ID: ios_profile,
            WIDGET_BUNDLE_ID: widget_profile,
        },
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as handle:
        plistlib.dump(payload, handle, fmt=plistlib.FMT_XML)


def load_signing_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text().splitlines():
        if not line.strip() or line.startswith("#") or "=" not in line:
            continue
        key, raw = line.split("=", 1)
        parsed = shlex.split(raw)
        if len(parsed) != 1:
            raise AscError(f"Could not parse signing env entry {key}.")
        values[key] = parsed[0]
    return values


def write_signing_env(path: Path, values: dict[str, str]) -> None:
    lines = [f"{key}={shlex.quote(value)}" for key, value in values.items()]
    path.write_text("\n".join(lines) + "\n")
    path.chmod(0o600)


def newest_ios_sdk(showsdks: str) -> tuple[int, ...]:
    found = [
        key
        for match in re.finditer(r"-sdk iphoneos(\d+(?:\.\d+)*)", showsdks)
        if (key := parse_dotted(match.group(1)))
    ]
    if not found:
        raise AscError("xcodebuild -showsdks did not list an iphoneos SDK.")
    return max(found)


def xcode_apps(root: Path) -> list[tuple[Path, str, bool]]:
    apps: list[tuple[Path, str, bool]] = []
    if not root.is_dir():
        return apps
    for app in sorted(root.glob("Xcode*.app")):
        info_path = app / "Contents" / "Info.plist"
        if not info_path.is_file():
            continue
        try:
            info = plistlib.loads(info_path.read_bytes())
        except Exception:
            continue
        version = str(info.get("CFBundleShortVersionString") or "")
        if parse_dotted(version) is None:
            continue
        beta = "beta" in app.name.lower()
        apps.append((app, version, beta))
    return apps


def choose_xcode(apps: list[tuple[Path, str, bool]]) -> Path:
    eligible = [
        (path, version)
        for path, version, beta in apps
        if not beta and (parse_dotted(version) or ()) >= (parse_dotted(MIN_XCODE) or ())
    ]
    if not eligible:
        found = ", ".join(
            f"{path.name} {version}{' beta' if beta else ''}" for path, version, beta in apps
        ) or "(none)"
        raise AscError(
            "This GitHub-hosted image has no non-beta Xcode "
            f"{MIN_XCODE} or newer. Timia sets xcodeVersion {MIN_XCODE} (Swift 6) and "
            f"deploys to iOS {MIN_IOS_SDK}, which Xcode 26.6 can build "
            "(supported iOS range 15–26.5). "
            "macos-latest as of 2026-10 is macOS 26 with Xcode 26.6 (iOS 26.5 SDK); "
            "if you see this, the runner Xcode is too old. "
            f"Found: {found}."
        )
    path, version = max(eligible, key=lambda item: parse_dotted(item[1]) or ())
    eprint(f"Selected Xcode {version} at {path.name}.")
    developer = path / "Contents" / "Developer"
    return developer if developer.is_dir() else path


def assert_sdk_new_enough(showsdks: str, minimum: str = MIN_IOS_SDK) -> str:
    current = newest_ios_sdk(showsdks)
    minimum_key = parse_dotted(minimum)
    if minimum_key is None:
        raise AscError(f"Invalid minimum iOS SDK {minimum!r}.")
    pretty = format_dotted(current)
    if current < minimum_key:
        raise AscError(
            f"Selected Xcode iOS SDK is {pretty}, which is too old to build "
            f"IPHONEOS_DEPLOYMENT_TARGET {minimum}. Timia deploys to iOS {MIN_IOS_SDK}. "
            "macos-latest in 2026-10 provides Xcode 26.6 / iOS 26.5 SDK."
        )
    return pretty


def native_target_id(text: str, name: str) -> str | None:
    match = re.search(
        rf"\t\t([A-Fa-f0-9]{{24}}) /\* {re.escape(name)} \*/ = \{{\n\t\t\tisa = PBXNativeTarget;",
        text,
    )
    return match.group(1) if match else None


def scheme_contents(app_id: str, widget_id: str | None) -> str:
    def reference(blueprint: str, name: str, product: str) -> str:
        return (
            "               <BuildableReference\n"
            '                  BuildableIdentifier = "primary"\n'
            f'                  BlueprintIdentifier = "{blueprint}"\n'
            f'                  BuildableName = "{product}"\n'
            f'                  BlueprintName = "{name}"\n'
            '                  ReferencedContainer = "container:Timia.xcodeproj">\n'
            "               </BuildableReference>\n"
        )

    def entry(blueprint: str, name: str, product: str, *, archive: bool) -> str:
        testing = "YES" if archive and name == "Timia" else "NO"
        running = testing
        archiving = "YES" if archive else "NO"
        return (
            "            <BuildActionEntry\n"
            f'               buildForTesting = "{testing}"\n'
            f'               buildForRunning = "{running}"\n'
            '               buildForProfiling = "YES"\n'
            f'               buildForArchiving = "{archiving}"\n'
            '               buildForAnalyzing = "YES">\n'
            f"{reference(blueprint, name, product)}"
            "            </BuildActionEntry>\n"
        )

    entries = entry(app_id, "Timia", "Timia.app", archive=True)
    if widget_id:
        entries += entry(widget_id, "TimiaWidget", "TimiaWidget.appex", archive=True)
    app_ref = reference(app_id, "Timia", "Timia.app")
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        "<Scheme\n"
        '   LastUpgradeVersion = "2600"\n'
        '   version = "1.7">\n'
        "   <BuildAction\n"
        '      parallelizeBuildables = "YES"\n'
        '      buildImplicitDependencies = "YES">\n'
        "      <BuildActionEntries>\n"
        f"{entries}"
        "      </BuildActionEntries>\n"
        "   </BuildAction>\n"
        "   <TestAction\n"
        '      buildConfiguration = "Debug"\n'
        '      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"\n'
        '      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"\n'
        '      shouldUseLaunchSchemeArgsEnv = "YES">\n'
        "   </TestAction>\n"
        "   <LaunchAction\n"
        '      buildConfiguration = "Debug"\n'
        '      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"\n'
        '      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"\n'
        '      launchStyle = "0"\n'
        '      useCustomWorkingDirectory = "NO"\n'
        '      ignoresPersistentStateOnLaunch = "NO"\n'
        '      debugDocumentVersioning = "YES"\n'
        '      debugServiceExtension = "internal"\n'
        '      allowLocationSimulation = "YES">\n'
        "      <BuildableProductRunnable\n"
        '         runnableDebuggingMode = "0">\n'
        f"{app_ref}"
        "      </BuildableProductRunnable>\n"
        "   </LaunchAction>\n"
        "   <ProfileAction\n"
        '      buildConfiguration = "Release"\n'
        '      shouldUseLaunchSchemeArgsEnv = "YES"\n'
        '      savedToolIdentifier = ""\n'
        '      useCustomWorkingDirectory = "NO"\n'
        '      debugDocumentVersioning = "YES">\n'
        "      <BuildableProductRunnable\n"
        '         runnableDebuggingMode = "0">\n'
        f"{app_ref}"
        "      </BuildableProductRunnable>\n"
        "   </ProfileAction>\n"
        "   <AnalyzeAction\n"
        '      buildConfiguration = "Debug">\n'
        "   </AnalyzeAction>\n"
        "   <ArchiveAction\n"
        '      buildConfiguration = "Release"\n'
        '      revealArchiveInOrganizer = "YES">\n'
        "   </ArchiveAction>\n"
        "</Scheme>\n"
    )


def write_scheme(project_path: Path) -> Path:
    text = project_path.read_text()
    app_id = native_target_id(text, "Timia")
    if not app_id:
        raise AscError("Could not find PBXNativeTarget Timia in the Xcode project.")
    widget_id = native_target_id(text, "TimiaWidget")
    dest = project_path.parent / "xcshareddata" / "xcschemes" / "Timia.xcscheme"
    dest.parent.mkdir(parents=True, exist_ok=True)
    xml = scheme_contents(app_id, widget_id)
    ET.fromstring(xml)
    dest.write_text(xml)
    if widget_id:
        eprint(
            f"Wrote shared scheme Timia ({app_id}) including TimiaWidget ({widget_id}). "
            "This file is gitignored and is removed at the end of the job."
        )
    else:
        eprint(f"Wrote shared scheme Timia ({app_id}) without a widget target.")
    return dest


def find_uploaded_build(transport: Transport, app_id: str, build_number: str) -> str | None:
    quoted = urllib.request.quote(build_number)
    url = (
        f"{ASC_API}/v1/builds?filter[app]={app_id}&filter[version]={quoted}"
        "&limit=5&sort=-uploadedDate&fields[builds]=version,processingState,usesNonExemptEncryption"
    )
    status, payload = transport.request("GET", url)
    if status != 200:
        raise AscError(
            f"Build lookup failed (HTTP {status}) {_error_detail(payload)}".strip(),
            transient=status >= 500,
        )
    for item in payload.get("data") or []:
        version = str((item.get("attributes") or {}).get("version") or "")
        if version == build_number:
            return str(item["id"])
    return None


def set_encryption(build_number: str, wait_seconds: int) -> bool:
    transport = Transport(token_from_env())
    app_id = resolve_app_id(transport)
    deadline = time.time() + wait_seconds
    build_id = None
    while True:
        build_id = find_uploaded_build(transport, app_id, build_number)
        if build_id:
            break
        if time.time() >= deadline:
            eprint(
                f"Build {build_number} is not visible in App Store Connect yet. "
                "The IPA upload already finished. Set export compliance in App Store Connect "
                "if TestFlight still asks (usesNonExemptEncryption=false)."
            )
            return False
        eprint("Uploaded build is not queryable yet; waiting 15s.")
        time.sleep(15)
    body = {
        "data": {
            "type": "builds",
            "id": build_id,
            "attributes": {"usesNonExemptEncryption": False},
        }
    }
    while True:
        status, payload = transport.request("PATCH", f"{ASC_API}/v1/builds/{build_id}", body)
        if status in (200, 204):
            eprint(f"Set usesNonExemptEncryption=false on build {build_number}.")
            return True
        detail = _error_detail(payload)
        if status in (409, 422) and time.time() < deadline:
            eprint(f"Export-compliance patch is not ready (HTTP {status}). Waiting 15s.")
            time.sleep(15)
            continue
        eprint(
            f"Could not set usesNonExemptEncryption (HTTP {status}) {detail}. "
            "The IPA is already uploaded."
        )
        return False


def cmd_self_test(_args: argparse.Namespace) -> None:
    assert higher_version(["0.1.0", "0.1.0"]) == "0.1.0"
    assert higher_version(["0.1.0", "0.2", "0.1.5"]) == "0.2"
    assert versions_equal("0.1.0", "0.1")
    assert next_build_number(["46"]) == "47"
    assert next_build_number(["9", "10", "2"]) == "11"
    assert next_build_number(["1.2.9", "1.2.10"]) == "1.2.11"
    assert choose_build_number([], "99") == "1"
    assert choose_build_number(None, "17") == "17"
    assert choose_build_number(["46", "4"], "17") == "47"
    assert choose_build_number(["beta"], "17") == "17"

    raw = bytes([0x80]) + bytes(31) + bytes([0x00]) + bytes(31)
    assert der_ecdsa_to_raw(raw_ecdsa_to_der(raw)) == raw
    raw = bytes([0x01]) + bytes(31) + bytes([0x7F]) + bytes(31)
    assert der_ecdsa_to_raw(raw_ecdsa_to_der(raw)) == raw

    with tempfile.TemporaryDirectory() as tmp:
        key = Path(tmp) / "key.pem"
        subprocess.run(
            ["openssl", "ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", str(key)],
            check=True,
            capture_output=True,
        )
        token = make_asc_jwt("KEYID123456", "issuer-id", key, now=1_700_000_000)
        header_b64, payload_b64, sig_b64 = token.split(".")

        def b64url_decode(data: str) -> bytes:
            return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))

        header = json.loads(b64url_decode(header_b64))
        payload = json.loads(b64url_decode(payload_b64))
        assert header["alg"] == "ES256" and header["kid"] == "KEYID123456"
        assert payload["aud"] == "appstoreconnect-v1"
        assert payload["exp"] - payload["iat"] <= 20 * 60
        signature = b64url_decode(sig_b64)
        assert len(signature) == 64
        pub = Path(tmp) / "pub.pem"
        message = Path(tmp) / "msg"
        der = Path(tmp) / "sig.der"
        message.write_bytes(f"{header_b64}.{payload_b64}".encode())
        der.write_bytes(raw_ecdsa_to_der(signature))
        subprocess.run(
            ["openssl", "ec", "-in", str(key), "-pubout", "-out", str(pub)],
            check=True,
            capture_output=True,
        )
        verify = subprocess.run(
            [
                "openssl",
                "dgst",
                "-sha256",
                "-verify",
                str(pub),
                "-signature",
                str(der),
                str(message),
            ],
            capture_output=True,
            check=False,
        )
        if verify.returncode != 0:
            raise SystemExit("ES256 JWT signature did not verify")

        root = Path(tmp) / "Applications"
        for name, version in (
            ("Xcode_16.4.app", "16.4"),
            ("Xcode_26.5.app", "26.5"),
            ("Xcode_26.6.app", "26.6"),
            ("Xcode_27.2_beta.app", "27.2"),
        ):
            info = root / name / "Contents" / "Info.plist"
            info.parent.mkdir(parents=True)
            with info.open("wb") as handle:
                plistlib.dump({"CFBundleShortVersionString": version}, handle)
            (root / name / "Contents" / "Developer").mkdir()
        chosen = choose_xcode(xcode_apps(root))
        assert chosen.name == "Developer"
        assert "Xcode_26.6.app" in str(chosen)
        try:
            choose_xcode([])
        except AscError as exc:
            assert "too old" in str(exc)
        else:
            raise SystemExit("empty Xcode list should fail")
        try:
            choose_xcode([(root / "Xcode_16.4.app", "16.4", False)])
        except AscError as exc:
            assert "too old" in str(exc)
        else:
            raise SystemExit("Xcode 16 should be rejected")

    sdk = assert_sdk_new_enough(
        "iOS 26.5 -sdk iphoneos26.5\nSimulator -sdk iphonesimulator26.5\n"
    )
    assert sdk == "26.5"
    assert assert_sdk_new_enough("iOS 17.0 -sdk iphoneos17.0\n") == "17.0"
    try:
        assert_sdk_new_enough("iOS 16.4 -sdk iphoneos16.4\n")
    except AscError as exc:
        assert "too old" in str(exc)
    else:
        raise SystemExit("iOS 16 SDK should be rejected")

    identity = pick_identity(
        '  1) ABC "Apple Development: Dev (TEAM)"\n'
        '  2) DEF "Apple Distribution: Timia (QTV9DUCAY7)"\n'
    )
    assert identity.startswith("Apple Distribution")

    profile = {
        "Name": "Timia App Store",
        "UUID": "11111111-2222-3333-4444-555555555555",
        "TeamIdentifier": ["QTV9DUCAY7"],
        "Entitlements": {
            "application-identifier": "QTV9DUCAY7.online.timia.ios",
            "com.apple.developer.healthkit": True,
            "com.apple.developer.healthkit.background-delivery": True,
        },
        "ExpirationDate": __import__("datetime").datetime(2099, 1, 1),
    }
    info = assert_app_store_profile(profile, IOS_BUNDLE_ID, "QTV9DUCAY7")
    assert info["bundle_id"] == IOS_BUNDLE_ID
    assert_profile_entitlements(profile, IOS_PROFILE_ENTITLEMENTS)
    bare = {
        **profile,
        "Entitlements": {"application-identifier": "QTV9DUCAY7.online.timia.ios"},
    }
    try:
        assert_profile_entitlements(bare, IOS_PROFILE_ENTITLEMENTS)
    except AscError:
        pass
    else:
        raise SystemExit("profile without HealthKit should be rejected")
    dev_profile = {
        **profile,
        "Entitlements": dict(profile["Entitlements"], **{"get-task-allow": True}),
    }
    try:
        assert_app_store_profile(dev_profile, IOS_BUNDLE_ID, "QTV9DUCAY7")
    except AscError:
        pass
    else:
        raise SystemExit("development profile should be rejected")
    widget_profile = {
        "Name": "Timia Widget App Store",
        "UUID": "FFFFFFFF-BBBB-CCCC-DDDD-EEEEEEEEEEEE",
        "TeamIdentifier": ["QTV9DUCAY7"],
        "Entitlements": {
            "application-identifier": "QTV9DUCAY7.online.timia.ios.widget",
        },
        "ExpirationDate": __import__("datetime").datetime(2099, 1, 1),
    }
    widget_info = assert_app_store_profile(widget_profile, WIDGET_BUNDLE_ID, "QTV9DUCAY7")
    assert widget_info["bundle_id"] == WIDGET_BUNDLE_ID

    original = PBXPROJ.read_text()
    patched = patch_pbxproj(
        original,
        ios_profile="Timia App Store",
        widget_profile="Timia Widget App Store",
        ios_profile_uuid="AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE",
        widget_profile_uuid="FFFFFFFF-BBBB-CCCC-DDDD-EEEEEEEEEEEE",
        identity="Apple Distribution: Timia (QTV9DUCAY7)",
        team_id="QTV9DUCAY7",
        build_number="47",
        marketing_version="0.1.0",
    )
    assert patched != original
    assert original.count("CODE_SIGN_STYLE = Automatic;") == patched.count(
        "CODE_SIGN_STYLE = Automatic;"
    ) + 2
    assert 'PROVISIONING_PROFILE_SPECIFIER = "Timia App Store";' in patched
    assert 'PROVISIONING_PROFILE_SPECIFIER = "Timia Widget App Store";' in patched
    assert "CURRENT_PROJECT_VERSION = 47;" in patched
    assert patched.count('CODE_SIGN_IDENTITY = "iPhone Developer";') == 1
    assert "baseConfigurationReference" in patched
    for match in BLOCK_RE.finditer(patched):
        settings = match.group("settings")
        bundle_id = _bundle_id(settings)
        if bundle_id in (IOS_BUNDLE_ID, WIDGET_BUNDLE_ID):
            if match.group("config") == "Debug":
                assert "CODE_SIGN_STYLE = Automatic;" in settings
                assert "CURRENT_PROJECT_VERSION" not in settings
            else:
                assert "CODE_SIGN_STYLE = Manual;" in settings
                assert "CURRENT_PROJECT_VERSION = 47;" in settings
                assert "MARKETING_VERSION = 0.1.0;" in settings
        elif bundle_id is None and "MARKETING_VERSION" in settings:
            if match.group("config") == "Release":
                assert "CURRENT_PROJECT_VERSION = 47;" in settings
            else:
                assert "CURRENT_PROJECT_VERSION = 46;" in settings
    marketing = release_marketing_versions(original)
    assert higher_version(list(marketing.values())) == "0.1.0"
    assert set(marketing) == set(SIGNED_BUNDLE_IDS)

    app_id = native_target_id(original, "Timia")
    widget_target = native_target_id(original, "TimiaWidget")
    if not app_id or not widget_target:
        raise SystemExit("Timia or TimiaWidget native target id was not found")
    scheme_xml = scheme_contents(app_id, widget_target)
    scheme_root = ET.fromstring(scheme_xml)
    assert scheme_root.find("ArchiveAction").get("buildConfiguration") == "Release"
    assert app_id in scheme_xml and widget_target in scheme_xml
    assert 'BuildableName = "TimiaWidget.appex"' in scheme_xml

    with tempfile.TemporaryDirectory() as tmp:
        export_path = Path(tmp) / "ExportOptions.plist"
        write_export_options(
            export_path,
            team_id="QTV9DUCAY7",
            identity="Apple Distribution: Timia (QTV9DUCAY7)",
            ios_profile="Timia App Store",
            widget_profile="Timia Widget App Store",
        )
        export = plistlib.loads(export_path.read_bytes())
        assert export["method"] == "app-store-connect"
        assert export["destination"] == "export"
        assert export["signingStyle"] == "manual"
        assert export["teamID"] == "QTV9DUCAY7"
        assert export["manageAppVersionAndBuildNumber"] is False
        assert export["provisioningProfiles"][IOS_BUNDLE_ID] == "Timia App Store"
        assert export["provisioningProfiles"][WIDGET_BUNDLE_ID] == "Timia Widget App Store"
        assert "watch" not in {key.lower() for key in export["provisioningProfiles"]}
        env_path = Path(tmp) / "signing.env"
        write_signing_env(
            env_path,
            {"IOS_PROFILE_NAME": "Timia App Store", "WIDGET_PROFILE_NAME": "a'b"},
        )
        loaded = load_signing_env(env_path)
        assert loaded["IOS_PROFILE_NAME"] == "Timia App Store"
        assert loaded["WIDGET_PROFILE_NAME"] == "a'b"

        fake_project = Path(tmp) / "project.pbxproj"
        fake_project.write_text(original)
        scheme_path = write_scheme(fake_project)
        assert scheme_path.name == "Timia.xcscheme"
        assert app_id in scheme_path.read_text()

    iphone = plistlib.loads(IPHONE_PLIST.read_bytes())
    widget = plistlib.loads(WIDGET_PLIST.read_bytes())
    if iphone.get("CFBundleVersion") != "$(CURRENT_PROJECT_VERSION)":
        raise SystemExit("iPhone Info.plist CFBundleVersion must be $(CURRENT_PROJECT_VERSION)")
    if widget.get("CFBundleVersion") != "$(CURRENT_PROJECT_VERSION)":
        raise SystemExit("Widget Info.plist CFBundleVersion must be $(CURRENT_PROJECT_VERSION)")
    if iphone.get("CFBundleShortVersionString") != "$(MARKETING_VERSION)":
        raise SystemExit("iPhone short version must stay $(MARKETING_VERSION)")
    extension = widget.get("NSExtension") or {}
    if extension.get("NSExtensionPointIdentifier") != "com.apple.widgetkit-extension":
        raise SystemExit("Widget must stay a widgetkit extension")

    workflow = WORKFLOW.read_text()
    for snippet in (
        "codes/mobile/ios/**",
        "workflow_dispatch",
        "cancel-in-progress: false",
        "macos-latest",
        "generic/platform=iOS",
        "usesNonExemptEncryption",
        "BUILD_PROVISION_PROFILE_WIDGET_BASE64",
        "ASC_API_KEY_P8",
        "app-store-connect",
        "private_keys",
        "codes/mobile/ios/Timia.xcodeproj",
        "write-scheme",
        "online.timia.ios",
        "git checkout -- codes/mobile/ios/Timia.xcodeproj/project.pbxproj",
    ):
        if snippet not in workflow:
            raise SystemExit(f"workflow is missing {snippet}")
    if "BUILD_PROVISION_PROFILE_WATCH_BASE64" in workflow:
        raise SystemExit("Timia has no Watch target; do not require a watch profile secret")
    if "deploy.yml" in workflow:
        raise SystemExit("ios-testflight.yml must not call the server deploy workflow")
    assert missing_secrets({}) == list(REQUIRED_SECRETS)
    assert missing_secrets({name: "x" for name in REQUIRED_SECRETS}) == []

    sample_apps = {
        "data": [
            {"id": ASC_APP_ID, "attributes": {"bundleId": IOS_BUNDLE_ID}},
        ]
    }
    assert sample_apps["data"][0]["id"] == "6796896382"
    assert sample_apps["data"][0]["attributes"]["bundleId"] == IOS_BUNDLE_ID
    pages = [{"data": [{"attributes": {"version": "46"}}, {"attributes": {"version": "3"}}]}]
    assert next_build_number(_build_versions_from_page(pages[0])) == "47"
    eprint("self-test ok")


def cmd_check_secrets(_args: argparse.Namespace) -> None:
    missing = missing_secrets(dict(os.environ))
    if missing:
        eprint("缺少 GitHub Actions secrets：" + ", ".join(missing))
        eprint(
            "第一次成功上传前，需要仓库管理员按 docs/ci-testflight.md 配置这些密钥。"
            "工作流不会打印密钥内容。"
        )
        raise SystemExit(1)
    eprint("Required secrets are present (values not printed).")


def cmd_select_xcode(args: argparse.Namespace) -> None:
    chosen = choose_xcode(xcode_apps(Path(args.root)))
    print(chosen)


def cmd_assert_ios_sdk(args: argparse.Namespace) -> None:
    text = subprocess.check_output(["xcodebuild", "-showsdks"], text=True)
    pretty = assert_sdk_new_enough(text, args.minimum)
    eprint(f"iOS SDK {pretty} can build deployment target {args.minimum}.")


def cmd_print_marketing_version(args: argparse.Namespace) -> None:
    versions = release_marketing_versions(Path(args.project).read_text())
    print(higher_version(list(versions.values())))


def cmd_next_build(args: argparse.Namespace) -> None:
    print(query_next_build(args.marketing_version, args.fallback))


def cmd_write_api_key(_args: argparse.Namespace) -> None:
    write_api_key()


def cmd_write_scheme(args: argparse.Namespace) -> None:
    write_scheme(Path(args.project))


def cmd_decode_signing_assets(args: argparse.Namespace) -> None:
    decode_base64_file("BUILD_CERTIFICATE_BASE64", Path(args.p12_out))
    decode_base64_file("BUILD_PROVISION_PROFILE_BASE64", Path(args.ios_out))
    decode_base64_file("BUILD_PROVISION_PROFILE_WIDGET_BASE64", Path(args.widget_out))


def cmd_pick_identity(args: argparse.Namespace) -> None:
    identity = pick_identity(Path(args.identities).read_text())
    Path(args.out).write_text(identity + "\n")
    eprint(f"Using distribution identity: {identity}")


def cmd_install_profiles(args: argparse.Namespace) -> None:
    team_id = require_env("APPLE_TEAM_ID").strip()
    ios = decode_mobileprovision(Path(args.ios))
    widget = decode_mobileprovision(Path(args.widget))
    ios_info = assert_app_store_profile(ios, IOS_BUNDLE_ID, team_id)
    assert_profile_entitlements(ios, IOS_PROFILE_ENTITLEMENTS)
    widget_info = assert_app_store_profile(widget, WIDGET_BUNDLE_ID, team_id)
    install_profile(ios, Path(args.ios))
    install_profile(widget, Path(args.widget))
    identity = Path(args.identity_file).read_text().strip()
    write_signing_env(
        Path(args.env_out),
        {
            "IOS_PROFILE_NAME": ios_info["name"],
            "IOS_PROFILE_UUID": ios_info["uuid"],
            "WIDGET_PROFILE_NAME": widget_info["name"],
            "WIDGET_PROFILE_UUID": widget_info["uuid"],
            "SIGNING_IDENTITY": identity,
            "APPLE_TEAM_ID": team_id,
        },
    )


def cmd_patch_project(args: argparse.Namespace) -> None:
    signing = load_signing_env(Path(args.signing_env))
    project = Path(args.project)
    patched = patch_pbxproj(
        project.read_text(),
        ios_profile=signing["IOS_PROFILE_NAME"],
        widget_profile=signing["WIDGET_PROFILE_NAME"],
        ios_profile_uuid=signing["IOS_PROFILE_UUID"],
        widget_profile_uuid=signing["WIDGET_PROFILE_UUID"],
        identity=signing["SIGNING_IDENTITY"],
        team_id=signing["APPLE_TEAM_ID"],
        build_number=args.build_number,
        marketing_version=args.marketing_version,
    )
    project.write_text(patched)
    eprint("Patched Release signing in the job workspace only. This file is not committed.")


def cmd_write_export_options(args: argparse.Namespace) -> None:
    signing = load_signing_env(Path(args.signing_env))
    write_export_options(
        Path(args.out),
        team_id=signing["APPLE_TEAM_ID"],
        identity=signing["SIGNING_IDENTITY"],
        ios_profile=signing["IOS_PROFILE_NAME"],
        widget_profile=signing["WIDGET_PROFILE_NAME"],
    )
    eprint(f"Wrote ExportOptions.plist ({Path(args.out).stat().st_size} bytes).")


def cmd_set_encryption(args: argparse.Namespace) -> None:
    ok = set_encryption(args.build_number, args.wait_seconds)
    if not ok:
        raise SystemExit(1)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("self-test").set_defaults(func=cmd_self_test)
    sub.add_parser("check-secrets").set_defaults(func=cmd_check_secrets)
    sub.add_parser("write-api-key").set_defaults(func=cmd_write_api_key)

    select = sub.add_parser("select-xcode")
    select.add_argument("--root", default="/Applications")
    select.set_defaults(func=cmd_select_xcode)

    sdk = sub.add_parser("assert-ios-sdk")
    sdk.add_argument("--minimum", default=MIN_IOS_SDK)
    sdk.set_defaults(func=cmd_assert_ios_sdk)

    marketing = sub.add_parser("print-marketing-version")
    marketing.add_argument("--project", required=True)
    marketing.set_defaults(func=cmd_print_marketing_version)

    nxt = sub.add_parser("next-build")
    nxt.add_argument("--marketing-version", required=True)
    nxt.add_argument("--fallback", required=True)
    nxt.set_defaults(func=cmd_next_build)

    scheme = sub.add_parser("write-scheme")
    scheme.add_argument("--project", required=True)
    scheme.set_defaults(func=cmd_write_scheme)

    decode = sub.add_parser("decode-signing-assets")
    decode.add_argument("--p12-out", required=True)
    decode.add_argument("--ios-out", required=True)
    decode.add_argument("--widget-out", required=True)
    decode.set_defaults(func=cmd_decode_signing_assets)

    ident = sub.add_parser("pick-identity")
    ident.add_argument("--identities", required=True)
    ident.add_argument("--out", required=True)
    ident.set_defaults(func=cmd_pick_identity)

    install = sub.add_parser("install-profiles")
    install.add_argument("--ios", required=True)
    install.add_argument("--widget", required=True)
    install.add_argument("--identity-file", required=True)
    install.add_argument("--env-out", required=True)
    install.set_defaults(func=cmd_install_profiles)

    patch = sub.add_parser("patch-project")
    patch.add_argument("--project", required=True)
    patch.add_argument("--signing-env", required=True)
    patch.add_argument("--build-number", required=True)
    patch.add_argument("--marketing-version", required=True)
    patch.set_defaults(func=cmd_patch_project)

    export = sub.add_parser("write-export-options")
    export.add_argument("--out", required=True)
    export.add_argument("--signing-env", required=True)
    export.set_defaults(func=cmd_write_export_options)

    encrypt = sub.add_parser("set-encryption")
    encrypt.add_argument("--build-number", required=True)
    encrypt.add_argument("--wait-seconds", type=int, default=180)
    encrypt.set_defaults(func=cmd_set_encryption)
    return parser


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        args.func(args)
    except AscError as exc:
        eprint(str(exc))
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
