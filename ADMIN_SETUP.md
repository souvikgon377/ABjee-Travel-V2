# Admin Setup Guide

## Creating Admin Users

The admin login system uses Firestore to store admin credentials separately from regular users.

### Quick Setup

Run this command to create default admin users:

```bash
cd server
npm run setup-admin
```

This will create two users:

**Admin User:**
- Email: `admin@abjee.com`
- Password: `Admin123!`
- Role: `admin`

**Owner User:**
- Email: `owner@abjee.com`
- Password: `Owner123!`
- Role: `owner`

### How to Login as Admin

1. Navigate to `/auth` page
2. Select **"Admin"** or **"Owner"** from the role dropdown
3. Enter the email and password
4. Click **"Sign In"**
5. You will be redirected to `/admin` dashboard

### Admin Authentication Flow

1. User selects admin/owner role and enters credentials
2. Frontend calls `POST /api/auth/admin-login` with email and password
3. Backend checks Firestore `admins` collection:
   - Searches for admin with matching email (case-insensitive)
   - Verifies password (plain text comparison)
   - Creates or updates user in `users` collection with admin role
4. Backend creates a Firebase custom token with admin claims
5. Frontend signs in with the custom token
6. User is authenticated with admin privileges

### Manual Admin Creation

If you need to create additional admin users manually:

1. Go to Firebase Console → Firestore Database
2. Navigate to `admins` collection
3. Add a new document with these fields:
   ```json
   {
     "email": "your-admin@example.com",
     "password": "YourSecurePassword123!",
     "firstName": "First",
     "lastName": "Last",
     "role": "admin",
     "createdAt": [timestamp],
     "updatedAt": [timestamp]
   }
   ```
4. Make sure the email is stored in **lowercase**

### Security Notes

⚠️ **Important:** 
- Passwords are stored in **plain text** in Firestore (for demo purposes)
- In production, implement proper password hashing (bcrypt)
- Use environment variables for default admin credentials
- Implement password reset functionality
- Add rate limiting to prevent brute force attacks

### Troubleshooting

**Issue:** "Invalid email or password" error

**Solutions:**
1. Check if admin user exists in Firestore `admins` collection
2. Verify email is stored in lowercase
3. Check backend server is running (`npm run dev`)
4. Check browser console for detailed error messages
5. Check server logs for authentication errors

**Issue:** Backend server not starting

**Solutions:**
1. Ensure `firebase-service-account.json` exists in `server/` directory
2. Check Firebase Admin SDK is properly initialized
3. Verify environment variables are set correctly
4. Check port 5000 is not in use

**Issue:** Redirected to wrong page after login

**Solutions:**
1. Check `AuthPage.tsx` redirect logic
2. Verify user role is correctly set in Firestore
3. Clear browser localStorage and try again

### Testing Admin Login

```bash
# 1. Start the backend server
cd server
npm run dev

# 2. Start the frontend (in new terminal)
cd client
npm run dev

# 3. Open browser to http://localhost:5173/auth
# 4. Select "Admin" role
# 5. Login with admin@abjee.com / Admin123!
# 6. Should redirect to /admin dashboard
```

### File Locations

- **Admin Login Route:** `server/src/routes/auth.js` (line 12-145)
- **Setup Script:** `server/src/scripts/setupAdmin.js`
- **Auth Context:** `client/src/contexts/AuthContext.tsx`
- **Auth Form:** `client/src/components/auth/AuthMultiStepForm.tsx`
- **Firebase Config:** `server/src/config/firebase-admin.js`

### Future Improvements

- [ ] Hash passwords with bcrypt
- [ ] Add password reset functionality
- [ ] Implement 2FA for admin accounts
- [ ] Add admin activity logging
- [ ] Create admin management UI
- [ ] Add role-based permissions system
- [ ] Implement session timeout for admins
- [ ] Add IP whitelisting for admin access
