# push-to-github.ps1
# One-click: create the GitHub repo (if missing) and push the current branch.
# Run on YOUR machine (needs internet + a stored GitHub credential in ~/.git-credentials).
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/push-to-github.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/push-to-github.ps1 -Account "yourname"
#
# Options:
#   -Account <name>   GitHub username (auto-detected from stored creds if omitted)
#   -Repo <name>      Repository name (default: kore)
#   -Branch <name>    Branch to push (default: master)

param(
  [string]$Account = "",
  [string]$Repo = "kore",
  [string]$Branch = "master"
)

$ErrorActionPreference = "Stop"

# Enable the stored-credential helper so git can authenticate without prompts.
git config credential.helper store

# Detect account from stored github credentials if not provided.
if ($Account -eq "") {
  $credFile = Join-Path $env:USERPROFILE ".git-credentials"
  if (Test-Path $credFile) {
    $line = Get-Content $credFile | Where-Object { $_ -match "github.com" } | Select-Object -First 1
    if ($line -match "https://([^:]+):") { $Account = $Matches[1] }
  }
}
if ($Account -eq "") {
  $Account = Read-Host "Enter your GitHub username"
}

$remoteUrl = "https://github.com/$Account/$Repo.git"
git remote remove origin 2>$null
git remote add origin $remoteUrl
Write-Host "Remote set to: $remoteUrl"

# Read token for API calls only (never persisted, never printed).
$token = ""
$credFile = Join-Path $env:USERPROFILE ".git-credentials"
if (Test-Path $credFile) {
  $line = Get-Content $credFile | Where-Object { $_ -match "github.com" } | Select-Object -First 1
  if ($line -match "https://[^:]+:([^@]+)@") { $token = $Matches[1] }
}

# Create the repo if it does not exist yet.
$check = curl.exe -s -o /dev/null -w "%{http_code}" -u "$Account`:$token" "https://api.github.com/repos/$Account/$Repo"
if ($check -eq "404") {
  Write-Host "Creating repo $Account/$Repo ..."
  curl.exe -s -u "$Account`:$token" -X POST "https://api.github.com/user/repos" `
    -H "Content-Type: application/json" `
    -d "{`"name`":`"$Repo`",`"description`":`"Lightning-fast local Markdown editor (open source, no cloud sync)`",`"private`":false,`"license_template`":`"mit`"}" | Out-Null
  Write-Host "Repo created."
} elseif ($check -eq "200") {
  Write-Host "Repo $Account/$Repo already exists, skipping create."
} else {
  Write-Host "Repo check returned HTTP $check (continuing with push anyway)."
}

Write-Host "Pushing $Branch to origin ..."
git push -u origin $Branch
Write-Host "Done. View at https://github.com/$Account/$Repo"
