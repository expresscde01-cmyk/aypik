# deploy-latest.ps1 - deploiement local Aypik (PC Windows uniquement)
#
# Automatise : git fetch -> checkout main -> pull -> npm run deploy -> rappel cPanel.
#
# PREREQUIS MANUEL (volontairement non automatise) :
#   La PR doit deja etre MERGEE dans main sur GitHub avant de lancer ce script.
#   Ce script ne merge pas de PR, ne checkout pas une branche feature, et ne
#   deploie pas de code non fusionne - controle manuel avant mise en production.
#
# Usage (depuis la racine du clone) :
#   .\deploy-latest.ps1
#
# Produit : aypik-deploy.zip (via npm run deploy / scripts/deploy-cpanel.mjs)

#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ZipName = 'aypik-deploy.zip'

function Write-Step {
    param([Parameter(Mandatory = $true)][string]$Message)
    Write-Host ''
    Write-Host ('-> ' + $Message) -ForegroundColor Cyan
}

function Write-Ok {
    param([Parameter(Mandatory = $true)][string]$Message)
    Write-Host ('[OK] ' + $Message) -ForegroundColor Green
}

function Write-Fail {
    param([Parameter(Mandatory = $true)][string]$Message)
    Write-Host ''
    Write-Host ('[ERREUR] ' + $Message) -ForegroundColor Red
    exit 1
}

function Invoke-Git {
    param([Parameter(Mandatory = $true)][string[]]$GitArguments)
    & git @GitArguments
    if ($LASTEXITCODE -ne 0) {
        $joined = $GitArguments -join ' '
        throw "git $joined (code $LASTEXITCODE)"
    }
}

Set-Location -LiteralPath $PSScriptRoot

Write-Host 'Aypik - deploy-latest (local -> cPanel)' -ForegroundColor White

try {
    Invoke-Git -GitArguments @('rev-parse', '--is-inside-work-tree') | Out-Null
}
catch {
    Write-Fail "Ce dossier n'est pas un depot Git. Lancez le script depuis la racine du projet Aypik."
}

$dirty = @(git status --porcelain 2>$null)
if ($dirty.Count -gt 0) {
    $dirtyMessage = @(
        'Des fichiers locaux sont modifies ou non commites.'
        'Committez, annulez ou stashez vos changements avant de deployer :'
        '  git status'
        '  git stash push -m "avant deploy"   (optionnel)'
    ) -join [Environment]::NewLine
    Write-Fail $dirtyMessage
}

Write-Step 'Recuperation des references distantes (git fetch origin)...'
try {
    Invoke-Git -GitArguments @('fetch', 'origin')
}
catch {
    Write-Fail "git fetch origin a echoue. Verifiez la connexion et l'acces au depot GitHub."
}

Write-Step 'Bascule sur main et synchronisation (git pull origin main)...'
try {
    Invoke-Git -GitArguments @('checkout', 'main')
    Invoke-Git -GitArguments @('pull', 'origin', 'main')
}
catch {
    $pullMessage = @(
        'Impossible de mettre a jour main.'
        'Causes frequentes : conflit de merge, branche locale divergente, fichiers modifies.'
        'Corrigez avec git status / git pull, puis relancez .\deploy-latest.ps1'
    ) -join [Environment]::NewLine
    Write-Fail $pullMessage
}

Write-Step 'Build production + archive cPanel (npm.cmd run deploy)...'
try {
    & npm.cmd run deploy
    if ($LASTEXITCODE -ne 0) {
        throw "npm.cmd run deploy (code $LASTEXITCODE)"
    }
}
catch {
    Write-Fail 'npm run deploy a echoue. Corrigez les erreurs de build affichees ci-dessus.'
}

$zipPath = Join-Path $PSScriptRoot $ZipName
if (-not (Test-Path -LiteralPath $zipPath)) {
    Write-Fail "$ZipName introuvable apres npm run deploy."
}

$zipInfo = Get-Item -LiteralPath $zipPath
$sizeBytes = $zipInfo.Length
$sizeKo = [math]::Round($sizeBytes / 1024, 0)

Write-Host ''
Write-Ok 'Pret pour cPanel'
Write-Host ('  Fichier : ' + $zipInfo.FullName)
Write-Host ('  Taille  : ' + $sizeKo + ' Ko (' + $sizeBytes + ' octets)')
Write-Host ('  Modifie : ' + $zipInfo.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))
Write-Host ''
Write-Host '  -> Extraire le contenu du zip dans public_html sur o2switch/cPanel,' -ForegroundColor Yellow
Write-Host '     puis Ctrl+F5 dans le navigateur.' -ForegroundColor Yellow
Write-Host ''
