# deploy-latest.ps1 — déploiement local Aypik (PC Windows uniquement)
#
# Automatise : git fetch → checkout main → pull → npm run deploy → rappel cPanel.
#
# PRÉREQUIS MANUEL (volontairement non automatisé) :
#   La PR doit déjà être MERGÉE dans `main` sur GitHub avant de lancer ce script.
#   Ce script ne merge pas de PR, ne checkout pas une branche feature, et ne
#   déploie pas de code non fusionné — contrôle manuel avant mise en production.
#
# Usage (depuis la racine du clone) :
#   .\deploy-latest.ps1
#
# Produit : aypik-deploy.zip (via npm run deploy / scripts/deploy-cpanel.mjs)

#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ZipName = 'aypik-deploy.zip'

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "→ $Message" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
    Write-Host "✓ $Message" -ForegroundColor Green
}

function Write-Fail([string]$Message) {
    Write-Host ""
    Write-Host "✗ $Message" -ForegroundColor Red
    exit 1
}

function Invoke-Git {
    param([Parameter(Mandatory = $true)][string[]]$Args)
    & git @Args
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Args -join ' ') (code $LASTEXITCODE)"
    }
}

Set-Location -LiteralPath $PSScriptRoot

Write-Host "Aypik — deploy-latest (local → cPanel)" -ForegroundColor White

try {
    Invoke-Git @('rev-parse', '--is-inside-work-tree') | Out-Null
} catch {
    Write-Fail "Ce dossier n'est pas un dépôt Git. Lancez le script depuis la racine du projet Aypik."
}

$dirty = git status --porcelain 2>$null
if ($dirty) {
    Write-Fail @(
        "Des fichiers locaux sont modifiés ou non commités.",
        "Committez, annulez ou stashez vos changements avant de déployer :",
        "  git status",
        "  git stash push -m `"avant deploy`"   (optionnel)"
    ) -join "`n"
}

Write-Step "Récupération des références distantes (git fetch origin)…"
try {
    Invoke-Git @('fetch', 'origin')
} catch {
    Write-Fail "git fetch origin a échoué. Vérifiez la connexion et l'accès au dépôt GitHub."
}

Write-Step "Bascule sur main et synchronisation (git pull origin main)…"
try {
    Invoke-Git @('checkout', 'main')
    Invoke-Git @('pull', 'origin', 'main')
} catch {
    Write-Fail @(
        "Impossible de mettre à jour main.",
        "Causes fréquentes : conflit de merge, branche locale divergente, fichiers modifiés.",
        "Corrigez avec git status / git pull, puis relancez .\deploy-latest.ps1"
    ) -join "`n"
}

Write-Step "Build production + archive cPanel (npm.cmd run deploy)…"
try {
    & npm.cmd run deploy
    if ($LASTEXITCODE -ne 0) {
        throw "npm.cmd run deploy (code $LASTEXITCODE)"
    }
} catch {
    Write-Fail "npm run deploy a échoué. Corrigez les erreurs de build affichées ci-dessus."
}

$zipPath = Join-Path $PSScriptRoot $ZipName
if (-not (Test-Path -LiteralPath $zipPath)) {
    Write-Fail "$ZipName introuvable après npm run deploy."
}

$zipInfo = Get-Item -LiteralPath $zipPath
$sizeBytes = $zipInfo.Length
$sizeKo = [math]::Round($sizeBytes / 1024, 0)

Write-Host ""
Write-Ok "Prêt pour cPanel"
Write-Host "  Fichier : $($zipInfo.FullName)"
Write-Host "  Taille  : $sizeKo Ko ($sizeBytes octets)"
Write-Host "  Modifié : $($zipInfo.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))"
Write-Host ""
Write-Host "  → Extraire le contenu du zip dans public_html sur o2switch/cPanel," -ForegroundColor Yellow
Write-Host "    puis Ctrl+F5 dans le navigateur." -ForegroundColor Yellow
Write-Host ""
