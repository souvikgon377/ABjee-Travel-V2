# ============================================
# FIREBASE REALTIME DATABASE RULES DEPLOYMENT
# ============================================

## Run these commands in your PowerShell terminal:

# 1. Login to Firebase (opens browser)
npx firebase-tools login

# 2. Select your Firebase project
npx firebase-tools use abjee-travel-4fc38

# 3. Deploy the database rules
npx firebase-tools deploy --only database

## That's it! Your rules will be deployed from firebase-rtdb-rules.json

## Expected Output:
# === Deploying to 'abjee-travel-4fc38'...
# ✔  Deploy complete!

## After deployment, refresh your application and the permission errors should be gone.
