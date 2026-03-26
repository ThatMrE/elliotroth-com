"""
Deploy primary-website to Netlify via API.
Creates a new site and deploys all files.
"""
import os, json, hashlib, base64, subprocess, sys

# Get token from netlify CLI config
result = subprocess.run(
    ["netlify", "api", "listSites"],
    capture_output=True, text=True
)
sites = json.loads(result.stdout)
print(f"Found {len(sites)} existing sites")

# Check if primary-algae already exists
site_id = None
for s in sites:
    if "primary-algae" in s.get("name", ""):
        site_id = s["id"]
        print(f"Found existing site: {site_id}")
        break

# Get auth token by calling whoami
result2 = subprocess.run(["netlify", "api", "getCurrentUser"], capture_output=True, text=True)
user = json.loads(result2.stdout)
print(f"User: {user.get('email', user.get('full_name', 'unknown'))}")

# Use netlify deploy directly with site linking
import tempfile, shutil

site_dir = r"C:\Users\ercre\.openclaw\workspace\primary-website"

if not site_id:
    # Create new site
    print("Creating new Netlify site...")
    create_result = subprocess.run(
        ["netlify", "sites:create", "--name", "primary-algae", "--account-slug", "er-creates"],
        capture_output=True, text=True, input="\n"
    )
    print("Create stdout:", create_result.stdout)
    print("Create stderr:", create_result.stderr)

# Write netlify site link file
link_file = os.path.join(site_dir, ".netlify", "state.json")
os.makedirs(os.path.dirname(link_file), exist_ok=True)

# Find or create site
if not site_id:
    for s in json.loads(subprocess.run(["netlify", "api", "listSites"], capture_output=True, text=True).stdout):
        if "primary-algae" in s.get("name", ""):
            site_id = s["id"]
            break

if site_id:
    with open(link_file, "w") as f:
        json.dump({"siteId": site_id}, f)
    print(f"Linked to site: {site_id}")
    
    # Deploy
    deploy_result = subprocess.run(
        ["netlify", "deploy", "--dir", site_dir, "--prod"],
        capture_output=True, text=True,
        cwd=site_dir
    )
    print("Deploy stdout:", deploy_result.stdout)
    print("Deploy stderr:", deploy_result.stderr)
else:
    print("Could not find/create site. Trying direct deploy...")
    deploy_result = subprocess.run(
        ["netlify", "deploy", "--dir", site_dir, "--prod"],
        capture_output=True, text=True,
        cwd=site_dir,
        input="primary-algae\n"
    )
    print(deploy_result.stdout)
    print(deploy_result.stderr)
