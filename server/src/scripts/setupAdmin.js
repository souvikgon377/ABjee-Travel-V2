import admin from '../config/firebase-admin.js';

/**
 * Setup script to create an admin user in Firestore
 * Run with: node src/scripts/setupAdmin.js
 */

const setupAdminUser = async () => {
  try {
    console.log('🔧 Setting up admin user...\n');
    
    const db = admin.firestore();
    const adminsRef = db.collection('admins');
    
    // Admin user details
    const adminData = {
      email: 'admin@abjee.com',
      password: 'Admin123!', // Plain text password (as per the auth route implementation)
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    // Check if admin already exists
    console.log('📋 Checking for existing admin...');
    const existingAdmin = await adminsRef
      .where('email', '==', adminData.email.toLowerCase())
      .limit(1)
      .get();
    
    if (!existingAdmin.empty) {
      console.log('⚠️  Admin user already exists!');
      console.log('📧 Email:', adminData.email);
      console.log('\nTo update password, delete the existing admin first from Firestore.');
      return;
    }
    
    // Create new admin user
    console.log('✨ Creating new admin user...');
    const docRef = await adminsRef.add({
      ...adminData,
      email: adminData.email.toLowerCase() // Store as lowercase
    });
    
    console.log('✅ Admin user created successfully!');
    console.log('\n📝 Admin Details:');
    console.log('   ID:', docRef.id);
    console.log('   Email:', adminData.email);
    console.log('   Password:', adminData.password);
    console.log('   Role:', adminData.role);
    console.log('\n🔐 You can now login with these credentials at /auth');
    console.log('   Select "Admin" role from the dropdown');
    
    // Also create owner user
    console.log('\n🔧 Setting up owner user...');
    
    const ownerData = {
      email: 'owner@abjee.com',
      password: 'Owner123!',
      firstName: 'Owner',
      lastName: 'User',
      role: 'owner',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    const existingOwner = await adminsRef
      .where('email', '==', ownerData.email.toLowerCase())
      .limit(1)
      .get();
    
    if (!existingOwner.empty) {
      console.log('⚠️  Owner user already exists!');
    } else {
      const ownerDocRef = await adminsRef.add({
        ...ownerData,
        email: ownerData.email.toLowerCase()
      });
      
      console.log('✅ Owner user created successfully!');
      console.log('\n📝 Owner Details:');
      console.log('   ID:', ownerDocRef.id);
      console.log('   Email:', ownerData.email);
      console.log('   Password:', ownerData.password);
      console.log('   Role:', ownerData.role);
    }
    
    console.log('\n✨ Setup complete!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error setting up admin:', error);
    console.error('\nDetails:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    process.exit(1);
  }
};

// Run the setup
setupAdminUser();
