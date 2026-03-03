import dotenv from 'dotenv';
import { db, admin } from '../config/database.js';

dotenv.config();

const timestamp = () => admin.firestore.FieldValue.serverTimestamp();

const createDemoRooms = async () => {
  try {
    const adminEmail = 'admin@abjee.com';
    const usersRef = db.collection('users');
    const adminSnapshot = await usersRef.where('email', '==', adminEmail).limit(1).get();
    let adminUserId = null;
    
    if (adminSnapshot.empty) {
      const adminUserRef = usersRef.doc();
      await adminUserRef.set({
        firebaseUid: null,
        firstName: 'Admin',
        lastName: 'User',
        username: 'admin',
        displayName: 'Admin User',
        email: adminEmail,
        role: 'admin',
        emailVerified: true,
        address: '123 Admin St',
        city: 'Admin City',
        zipCode: '12345',
        subscription: {
          type: 'premium',
          isActive: true
        },
        isActive: true,
        createdAt: timestamp(),
        updatedAt: timestamp(),
        lastSeen: timestamp()
      });
      adminUserId = adminUserRef.id;
      console.log('✅ Created admin user');
    } else {
      adminUserId = adminSnapshot.docs[0].id;
    }

    const joinedAt = admin.firestore.Timestamp.now();

    const publicRooms = [
      {
        name: 'General Travel Chat',
        description: 'General discussion about travel experiences, tips, and advice',
        type: 'public',
        destination: { country: 'Global', region: 'Worldwide' },
        tags: ['general', 'travel', 'tips'],
        createdBy: adminUserId
      },
      {
        name: 'Europe Backpackers',
        description: 'Connect with fellow backpackers exploring Europe',
        type: 'public',
        destination: { country: 'Europe', region: 'Multiple Countries' },
        tags: ['europe', 'backpacking', 'budget'],
        createdBy: adminUserId
      },
      {
        name: 'Southeast Asia Adventures',
        description: 'Share experiences and tips for traveling in Southeast Asia',
        type: 'public',
        destination: { country: 'Thailand', city: 'Bangkok', region: 'Southeast Asia' },
        tags: ['asia', 'adventure', 'culture'],
        createdBy: adminUserId
      },
      {
        name: 'Japan Travel Guide',
        description: 'Everything about traveling in Japan - culture, food, places',
        type: 'public',
        destination: { country: 'Japan', city: 'Tokyo' },
        tags: ['japan', 'culture', 'food'],
        createdBy: adminUserId
      },
      {
        name: 'Solo Female Travelers',
        description: 'Safe space for solo female travelers to share experiences',
        type: 'public',
        destination: { country: 'Global', region: 'Worldwide' },
        tags: ['solo', 'female', 'safety'],
        createdBy: adminUserId
      },
      {
        name: 'Digital Nomads Hub',
        description: 'For remote workers and digital nomads sharing travel tips',
        type: 'public',
        destination: { country: 'Global', region: 'Worldwide' },
        tags: ['nomad', 'remote-work', 'wifi'],
        createdBy: adminUserId
      }
    ];

    const privateRooms = [
      {
        name: 'VIP Travel Lounge',
        description: 'Exclusive chat for premium travelers',
        type: 'private',
        subscriptionRequired: true,
        destination: { country: 'Global', region: 'Worldwide' },
        tags: ['vip', 'luxury', 'premium'],
        createdBy: adminUserId,
        maxMembers: 50
      },
      {
        name: 'Luxury Resort Reviews',
        description: 'Private discussions about high-end accommodations',
        type: 'private',
        subscriptionRequired: true,
        destination: { country: 'Global', region: 'Worldwide' },
        tags: ['luxury', 'resorts', 'reviews'],
        createdBy: adminUserId,
        maxMembers: 30
      }
    ];

    const travelPartnerRooms = [
      {
        name: 'Find Travel Buddies',
        description: 'Connect with potential travel companions',
        type: 'travel_partner',
        destination: { country: 'Global', region: 'Worldwide' },
        tags: ['partners', 'buddies', 'companions'],
        createdBy: adminUserId
      }
    ];

    const allRooms = [...publicRooms, ...privateRooms, ...travelPartnerRooms];
    const roomsRef = db.collection('chatRooms');

    for (const roomData of allRooms) {
      const existingRoom = await roomsRef.where('name', '==', roomData.name).limit(1).get();
      
      if (existingRoom.empty) {
        const roomRef = roomsRef.doc();
        await roomRef.set({
          ...roomData,
          id: roomRef.id,
          members: [
            {
              user: adminUserId,
              role: 'admin',
              joinedAt,
              lastReadAt: joinedAt
            }
          ],
          isActive: true,
          messageCount: 0,
          createdAt: timestamp(),
          updatedAt: timestamp(),
          lastActivity: timestamp()
        });
        console.log(`✅ Created room: ${roomData.name}`);
      } else {
        console.log(`⏭️  Room already exists: ${roomData.name}`);
      }
    }

    console.log('🎉 Demo rooms setup completed!');

  } catch (error) {
    console.error('❌ Error creating demo rooms:', error);
  }
};

const createDemoTravelRequests = async () => {
  try {
    const adminSnapshot = await db.collection('users').where('email', '==', 'admin@abjee.com').limit(1).get();
    if (adminSnapshot.empty) return;
    const adminUserId = adminSnapshot.docs[0].id;

    const requestsRef = db.collection('travelPartnerRequests');

    const demoRequests = [
      {
        requester: adminUserId,
        title: 'Looking for travel buddy to explore Japan',
        description: 'Planning a 2-week trip to Japan in spring 2024. Looking for someone to share the experience, split costs, and explore together. Interested in culture, food, and traditional sites.',
        destination: {
          country: 'Japan',
          city: 'Tokyo'
        },
        startDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        endDate: new Date(Date.now() + 44 * 24 * 60 * 60 * 1000), // 44 days from now
        budget: {
          min: 2000,
          max: 3500,
          currency: 'USD'
        },
        groupSize: {
          preferred: 2,
          maximum: 3
        },
        travelStyle: 'cultural',
        accommodation: ['hotel', 'guesthouse'],
        transportation: ['flight', 'train'],
        interests: ['culture', 'food', 'history', 'photography'],
        partnerRequirements: {
          ageRange: { min: 25, max: 40 },
          gender: 'any',
          experience: 'intermediate'
        }
      },
      {
        requester: adminUserId,
        title: 'Backpacking through Southeast Asia',
        description: 'Planning a 3-month backpacking adventure through Thailand, Vietnam, Cambodia, and Laos. Looking for adventurous travel companions who love street food and off-the-beaten-path experiences.',
        destination: {
          country: 'Thailand',
          city: 'Bangkok'
        },
        startDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days from now
        endDate: new Date(Date.now() + 150 * 24 * 60 * 60 * 1000), // 150 days from now
        budget: {
          min: 1500,
          max: 2500,
          currency: 'USD'
        },
        groupSize: {
          preferred: 3,
          maximum: 4
        },
        travelStyle: 'backpacking',
        accommodation: ['hostel', 'guesthouse'],
        transportation: ['bus', 'train', 'local_transport'],
        interests: ['adventure', 'food', 'culture', 'nature'],
        partnerRequirements: {
          ageRange: { min: 20, max: 35 },
          gender: 'any',
          experience: 'any'
        }
      }
    ];

    for (const requestData of demoRequests) {
      const existingRequest = await requestsRef.where('title', '==', requestData.title).limit(1).get();
      
      if (existingRequest.empty) {
        const requestRef = requestsRef.doc();
        await requestRef.set({
          ...requestData,
          id: requestRef.id,
          status: 'active',
          responses: [],
          matchedPartners: [],
          isPublic: true,
          allowDirectContact: true,
          views: 0,
          responseCount: 0,
          createdAt: timestamp(),
          updatedAt: timestamp()
        });
        console.log(`✅ Created travel request: ${requestData.title}`);
      } else {
        console.log(`⏭️  Travel request already exists: ${requestData.title}`);
      }
    }

    console.log('🎉 Demo travel requests setup completed!');

  } catch (error) {
    console.error('❌ Error creating demo travel requests:', error);
  }
};

const setupDemo = async () => {
  console.log('🚀 Setting up ABjee Travel demo data...');

  await createDemoRooms();
  await createDemoTravelRequests();
  
  console.log('✨ Demo setup completed successfully!');
  process.exit(0);
};

// Run the setup
setupDemo().catch((error) => {
  console.error('❌ Demo setup failed:', error);
  process.exit(1);
});
