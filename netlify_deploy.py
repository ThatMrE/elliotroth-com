"""
Deploy primary-website to Netlify via direct REST API.
Gets auth token from netlify CLI's keychain/config.
"""
import os, sys, json, hashlib, zipfile, requests, io
from pathlib import Path

SITE_DIR = Path(r"C:\Users\ercre\.openclaw\workspace\primary-website")

# ── Get token from netlify CLI stored config ──
# On Windows, netlify CLI stores token at various locations
import subprocess

def get_netlify_token():
    # Method 1: env var
    if os.environ.get("NETLIFY_AUTH_TOKEN"):
        return os.environ["NETLIFY_AUTH_TOKEN"]
    
    # Method 2: Parse from netlify CLI via PowerShell
    # The netlify CLI stores tokens in the OS keychain or a local file
    # Try common Windows paths
    paths_to_try = [
        Path.home() / ".config" / "netlify" / "config.json",
        Path(os.environ.get("APPDATA", "")) / "netlify" / "config.json",
        Path(os.environ.get("LOCALAPPDATA", "")) / "netlify" / "config.json",
        Path.home() / ".netlify" / "config.json",
    ]
    for p in paths_to_try:
        if p.exists():
            try:
                data = json.loads(p.read_text())
                # Structure varies; try to find token
                users = data.get("users", {})
                for uid, udata in users.items():
                    token = udata.get("auth", {}).get("token")
                    if token:
                        print(f"Found token in {p}")
                        return token
            except Exception as e:
                print(f"Error reading {p}: {e}")
    
    return None

def create_site(token, site_name):
    """Create a new Netlify site."""
    resp = requests.post(
        "https://api.netlify.com/api/v1/sites",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"name": site_name, "custom_domain": None}
    )
    if resp.status_code in (200, 201):
        return resp.json()
    else:
        print(f"Create site error {resp.status_code}: {resp.text[:500]}")
        return None

def get_sites(token):
    """List all sites."""
    resp = requests.get(
        "https://api.netlify.com/api/v1/sites",
        headers={"Authorization": f"Bearer {token}"}
    )
    if resp.status_code == 200:
        return resp.json()
    return []

def deploy_zip(token, site_id, site_dir):
    """Create a zip of site files and deploy."""
    # Build zip in memory
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for fpath in site_dir.rglob("*"):
            if fpath.is_file():
                # Skip hidden dirs and deploy scripts themselves
                parts = fpath.relative_to(site_dir).parts
                if any(p.startswith(".") for p in parts):
                    continue
                if fpath.name in ("deploy.py", "netlify_deploy.py", "build_deck.py", "build_deck_primary.py", "rebrand.py", "upload_to_slides.py"):
                    continue
                arcname = str(fpath.relative_to(site_dir))
                zf.write(fpath, arcname)
                print(f"  + {arcname}")
    
    buf.seek(0)
    zip_data = buf.read()
    print(f"\nZip size: {len(zip_data):,} bytes")
    
    # Deploy
    print(f"\nDeploying to site {site_id}...")
    resp = requests.post(
        f"https://api.netlify.com/api/v1/sites/{site_id}/deploys",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/zip"
        },
        data=zip_data
    )
    
    if resp.status_code in (200, 201):
        deploy = resp.json()
        print(f"\n✅ Deploy successful!")
        print(f"Deploy ID: {deploy.get('id')}")
        print(f"State: {deploy.get('state')}")
        url = deploy.get("deploy_ssl_url") or deploy.get("ssl_url") or deploy.get("url", "")
        print(f"URL: {url}")
        return deploy
    else:
        print(f"Deploy error {resp.status_code}: {resp.text[:1000]}")
        return None

def main():
    print("=== Primary Website → Netlify Deployer ===\n")
    
    token = get_netlify_token()
    if not token:
        print("ERROR: Could not find Netlify auth token.")
        print("Trying to extract from netlify CLI directly...")
        
        # Try extracting from netlify CLI's keytar / electron-store
        # On Windows these are sometimes stored in encrypted form
        # As a fallback, let's try to run netlify and parse the bearer token
        import subprocess
        result = subprocess.run(
            ["netlify", "api", "getCurrentUser"],
            capture_output=True, text=True, shell=True
        )
        print("CLI test:", result.stdout[:200], result.stderr[:200])
        
        print("\nPlease set NETLIFY_AUTH_TOKEN environment variable and rerun.")
        print("Get your token from: https://app.netlify.com/user/applications#personal-access-tokens")
        sys.exit(1)
    
    print(f"Token found ({len(token)} chars)")
    
    # Check current user
    user_resp = requests.get(
        "https://api.netlify.com/api/v1/user",
        headers={"Authorization": f"Bearer {token}"}
    )
    if user_resp.status_code == 200:
        user = user_resp.json()
        print(f"Authenticated as: {user.get('email', user.get('full_name', 'unknown'))}\n")
    
    # Find or create site
    sites = get_sites(token)
    site = next((s for s in sites if "primary-algae" in s.get("name", "")), None)
    
    if site:
        site_id = site["id"]
        print(f"Using existing site: {site['name']} ({site_id})")
        print(f"Current URL: {site.get('ssl_url', site.get('url', ''))}")
    else:
        print("Creating new site: primary-algae")
        site = create_site(token, "primary-algae")
        if not site:
            print("Failed to create site. Trying without name...")
            site = create_site(token, f"primary-algae-{os.getpid()}")
        if not site:
            print("Site creation failed completely.")
            sys.exit(1)
        site_id = site["id"]
        print(f"Created site: {site.get('name')} ({site_id})")
    
    # Deploy files
    print(f"\nBuilding deploy from: {SITE_DIR}")
    deploy = deploy_zip(token, site_id, SITE_DIR)
    
    if deploy:
        url = deploy.get("deploy_ssl_url") or deploy.get("ssl_url") or deploy.get("url", "")
        site_url = site.get("ssl_url") or site.get("url") or f"https://{site.get('name')}.netlify.app"
        print(f"\n🌐 Live at: {site_url}")
        
        # Save URL
        with open(SITE_DIR / "deployed_url.txt", "w") as f:
            f.write(site_url)
        print(f"URL saved to deployed_url.txt")

if __name__ == "__main__":
    main()
