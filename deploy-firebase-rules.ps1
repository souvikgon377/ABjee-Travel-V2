# Firebase Realtime Database Rules - Quick Deployment

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Firebase Database Rules Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check if firebase-tools is available
Write-Host "[1/4] Checking Firebase CLI..." -ForegroundColor Yellow
Write-Host "Firebase CLI will be downloaded via npx if needed..." -ForegroundColor Gray
Write-Host ""

# Step 2: Login to Firebase
Write-Host "[2/4] Logging in to Firebase..." -ForegroundColor Yellow
Write-Host "This will open your browser for authentication." -ForegroundColor Gray
Write-Host ""
$login = Read-Host "Press Enter to continue with Firebase login (or 'skip' if already logged in)"
if ($login -ne "skip") {
    npx firebase-tools login
}

Write-Host ""

# Step 3: Select Firebase project
Write-Host "[3/4] Selecting Firebase project..." -ForegroundColor Yellow
Write-Host "Your project ID: abjee-travel-4fc38" -ForegroundColor Gray
Write-Host ""
npx firebase-tools use abjee-travel-4fc38

Write-Host ""

# Step 4: Deploy rules
Write-Host "[4/4] Deploying Realtime Database rules..." -ForegroundColor Yellow
Write-Host "Deploying from: firebase-rtdb-rules.json" -ForegroundColor Gray
Write-Host ""
npx firebase-tools deploy --only database

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✓ Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Your Firebase Realtime Database rules are now active." -ForegroundColor Green
Write-Host "Refresh your application to test the chat functionality." -ForegroundColor Gray
Write-Host ""
