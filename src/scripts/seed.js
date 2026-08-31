import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { faker } from '@faker-js/faker';
import connectToDatabase from '../config/db.js';

// Import all models
import User from '../models/User.js';
import Category from '../models/Category.js';
import Post from '../models/Post.js';
import Comment from '../models/Comment.js';
import Like from '../models/Like.js';
import Follow from '../models/Follow.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import Offer from '../models/Offer.js';
import SavedPost from '../models/SavedPost.js';
import Notification from '../models/Notification.js';
import Payment from '../models/Payment.js';
import Report from '../models/Report.js';
import AuditLog from '../models/AuditLog.js';
import { slugify } from '../utils/slugify.js';

// Parse command line arguments
const args = process.argv.slice(2);
const isClean = args.includes('--clean') || args.includes('--fresh');

const getUserCount = () => {
    const idx = args.indexOf('--users');
    if (idx !== -1 && args[idx + 1]) {
        const count = parseInt(args[idx + 1], 10);
        return isNaN(count) ? 25 : count;
    }
    return 25;
};

const getPostCount = () => {
    const idx = args.indexOf('--posts');
    if (idx !== -1 && args[idx + 1]) {
        const count = parseInt(args[idx + 1], 10);
        return isNaN(count) ? 60 : count;
    }
    return 60;
};

const USER_COUNT = getUserCount();
const POST_COUNT = getPostCount();

// Curated high quality imagery by category
const CATEGORY_DEFINITIONS = [
    {
        name: 'Electronics & Tech',
        description: 'Computers, smartphones, audio gear, smart home devices, and gadgets.',
        images: [
            'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=1000&q=80',
            'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1000&q=80',
            'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=1000&q=80',
            'https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=1000&q=80',
            'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?auto=format&fit=crop&w=1000&q=80',
            'https://images.unsplash.com/photo-1550009158-9ebf69173e03?auto=format&fit=crop&w=1000&q=80',
        ],
        tags: ['tech', 'gadgets', 'electronics', 'hardware', 'audio', 'apple', 'smartwatch', 'gaming'],
    },
    {
        name: 'Fashion & Apparel',
        description: 'Clothing, sneakers, vintage wear, jewelry, and luxury accessories.',
        images: [
            'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1000&q=80',
            'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1000&q=80',
            'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=1000&q=80',
            'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1000&q=80',
            'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=1000&q=80',
        ],
        tags: ['fashion', 'style', 'vintage', 'sneakers', 'streetwear', 'ootd', 'shoes', 'luxury'],
    },
    {
        name: 'Art & Collectibles',
        description: 'Original artwork, prints, handcrafted items, trading cards, and antiques.',
        images: [
            'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=1000&q=80',
            'https://images.unsplash.com/photo-1582561424760-0321d75e81fa?auto=format&fit=crop&w=1000&q=80',
            'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=1000&q=80',
            'https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=1000&q=80',
        ],
        tags: ['art', 'collectibles', 'painting', 'handmade', 'sculpture', 'vintage', 'creative', 'rare'],
    },
    {
        name: 'Gaming & Esports',
        description: 'Consoles, PC parts, mechanical keyboards, retro games, and gear.',
        images: [
            'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=1000&q=80',
            'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=1000&q=80',
            'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&w=1000&q=80',
            'https://images.unsplash.com/photo-1612287232737-25e6833b3cf8?auto=format&fit=crop&w=1000&q=80',
        ],
        tags: ['gaming', 'setup', 'esports', 'pcbuild', 'playstation', 'nintendo', 'retro', 'rgb'],
    },
    {
        name: 'Home & Living',
        description: 'Furniture, decor, kitchenware, plants, and interior aesthetic items.',
        images: [
            'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1000&q=80',
            'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1000&q=80',
            'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=1000&q=80',
            'https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1000&q=80',
        ],
        tags: ['homedecor', 'interior', 'plants', 'minimalist', 'furniture', 'kitchen', 'cozy', 'design'],
    },
    {
        name: 'Photography & Video',
        description: 'Cameras, lenses, lighting, drones, and professional studio equipment.',
        images: [
            'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1000&q=80',
            'https://images.unsplash.com/photo-1502982720700-bfff97f2ecac?auto=format&fit=crop&w=1000&q=80',
            'https://images.unsplash.com/photo-1512790182412-b19e6d62bc39?auto=format&fit=crop&w=1000&q=80',
        ],
        tags: ['photography', 'camera', 'lens', 'cinematography', 'sony', 'canon', 'drone', 'filmmaking'],
    },
    {
        name: 'Sports & Outdoors',
        description: 'Bicycles, camping gear, fitness equipment, athletic apparel, and outdoor tools.',
        images: [
            'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=1000&q=80',
            'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=1000&q=80',
            'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=1000&q=80',
        ],
        tags: ['fitness', 'outdoors', 'cycling', 'workout', 'camping', 'hiking', 'adventure', 'gym'],
    },
    {
        name: 'Books, Music & Media',
        description: 'Vinyl records, rare books, musical instruments, audiobooks, and CDs.',
        images: [
            'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=1000&q=80',
            'https://images.unsplash.com/photo-1539185441755-769473a23570?auto=format&fit=crop&w=1000&q=80',
            'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1000&q=80',
        ],
        tags: ['vinyl', 'books', 'music', 'reading', 'instruments', 'guitar', 'literature', 'audio'],
    },
];

const AVATAR_URLS = [
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
    'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=300&q=80',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=300&q=80',
    'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=300&q=80',
    'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=300&q=80',
    'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=300&q=80',
    'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=300&q=80',
    'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=300&q=80',
];

/**
 * Main Seeding Routine
 */
async function seedDatabase() {
    console.log('🌱 Starting Synthetic Data Generation with @faker-js/faker...\n');

    await connectToDatabase();

    if (isClean) {
        console.log('🧹 Cleaning existing database collections...');
        await Promise.all([
            User.deleteMany({}),
            Category.deleteMany({}),
            Post.deleteMany({}),
            Comment.deleteMany({}),
            Like.deleteMany({}),
            Follow.deleteMany({}),
            Conversation.deleteMany({}),
            Message.deleteMany({}),
            Offer.deleteMany({}),
            SavedPost.deleteMany({}),
            Notification.deleteMany({}),
            Payment.deleteMany({}),
            Report.deleteMany({}),
            AuditLog.deleteMany({}),
        ]);
        console.log('✅ Collections wiped cleanly.\n');
    }

    // 1. Password Pre-hashing (for lightning-fast user generation)
    console.log('🔐 Pre-hashing default test password ("Password123!")...');
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('Password123!', salt);

    // 2. Create Standard Test Accounts + Synthetic Users
    console.log(`👥 Generating ${USER_COUNT + 3} users (including 3 standard test accounts)...`);
    
    const standardUsersData = [
        {
            firstName: 'Admin',
            lastName: 'User',
            phoneNumber: '+15550000001',
            username: 'admin',
            email: 'admin@example.com',
            password: hashedPassword,
            role: 'admin',
            status: 'active',
            isVerified: true,
            avatar: AVATAR_URLS[0],
            bio: 'Platform administrator & community guardian.',
        },
        {
            firstName: 'Moderator',
            lastName: 'User',
            phoneNumber: '+15550000002',
            username: 'moderator',
            email: 'moderator@example.com',
            password: hashedPassword,
            role: 'moderator',
            status: 'active',
            isVerified: true,
            avatar: AVATAR_URLS[1],
            bio: 'Community moderator keeping the marketplace safe and fun.',
        },
        {
            firstName: 'Test',
            lastName: 'User',
            phoneNumber: '+15550000003',
            username: 'testuser',
            email: 'testuser@example.com',
            password: hashedPassword,
            role: 'user',
            status: 'active',
            isVerified: true,
            avatar: AVATAR_URLS[2],
            bio: 'Tech enthusiast, designer, and vintage gear collector.',
        },
    ];

    const syntheticUsersData = [];
    const usedUsernames = new Set(['admin', 'moderator', 'testuser']);
    const usedEmails = new Set(['admin@example.com', 'moderator@example.com', 'testuser@example.com']);

    for (let i = 0; i < USER_COUNT; i++) {
        let username;
        do {
            username = faker.internet.username().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 25);
            if (username.length < 3) {
                username = `user_${faker.string.alphanumeric(6)}`.toLowerCase();
            }
        } while (usedUsernames.has(username));
        usedUsernames.add(username);

        let email;
        do {
            email = faker.internet.email({ firstName: username }).toLowerCase();
        } while (usedEmails.has(email));
        usedEmails.add(email);

        const firstName = faker.person.firstName();
        const lastName = faker.person.lastName();
        const phoneNumber = faker.phone.number({ style: 'international' });
        const avatar = faker.helpers.arrayElement(AVATAR_URLS);
        const bio = faker.person.bio().slice(0, 150);
        const isVerified = faker.datatype.boolean(0.65); // 65% verified
        const status = faker.helpers.weightedArrayElement([
            { weight: 90, value: 'active' },
            { weight: 7, value: 'suspended' },
            { weight: 3, value: 'banned' },
        ]);

        syntheticUsersData.push({
            firstName,
            lastName,
            phoneNumber,
            username,
            email,
            password: hashedPassword,
            role: 'user',
            status,
            isVerified,
            avatar,
            bio,
        });
    }

    const allUsers = await User.insertMany([...standardUsersData, ...syntheticUsersData]);
    const adminUser = allUsers.find((u) => u.username === 'admin');
    const testUser = allUsers.find((u) => u.username === 'testuser');
    const activeUsers = allUsers.filter((u) => u.status === 'active');
    console.log(`✅ Created ${allUsers.length} users successfully.`);

    // 3. Create Categories
    console.log('\n📂 Creating marketplace and community categories...');
    const categoryDocs = CATEGORY_DEFINITIONS.map((cat) => ({
        name: cat.name,
        slug: slugify(cat.name) || cat.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        description: cat.description,
        createdBy: adminUser._id,
    }));

    const categories = await Category.insertMany(categoryDocs);
    const categoryMap = new Map();
    categories.forEach((cat, idx) => {
        categoryMap.set(cat._id.toString(), CATEGORY_DEFINITIONS[idx]);
    });
    console.log(`✅ Created ${categories.length} categories.`);

    // 4. Create Posts & Marketplace Listings
    console.log(`\n📝 Generating ${POST_COUNT} posts and marketplace listings...`);
    const postsData = [];

    for (let i = 0; i < POST_COUNT; i++) {
        const categoryDoc = faker.helpers.arrayElement(categories);
        const categoryDef = categoryMap.get(categoryDoc._id.toString());
        const author = faker.helpers.arrayElement(activeUsers);
        const isMarketplace = faker.datatype.boolean(0.6); // 60% marketplace listings

        // Price in cents: between $10.00 (1000) and $1,500.00 (150000)
        const price = isMarketplace
            ? faker.number.int({ min: 1000, max: 150000, multipleOf: 50 })
            : undefined;

        const title = isMarketplace
            ? `${faker.commerce.productAdjective()} ${faker.commerce.productName()} - ${faker.commerce.productMaterial()}`.slice(0, 95)
            : faker.hacker.phrase().slice(0, 95);

        const content = isMarketplace
            ? `Selling my ${title}. ${faker.commerce.productDescription()}\n\nCondition: ${faker.helpers.arrayElement(['Brand New', 'Like New', 'Excellent', 'Gently Used'])}.\nIncludes original packaging and accessories. Pick up or express shipping available!`
            : `${faker.lorem.paragraphs({ min: 1, max: 3 }, '\n\n')}\n\nWhat are your thoughts on this? Drop a comment below!`;

        // Assign curated high-res media
        const mediaCount = isMarketplace
            ? faker.number.int({ min: 1, max: 3 })
            : faker.datatype.boolean(0.5)
            ? faker.number.int({ min: 1, max: 2 })
            : 0;

        const media = [];
        if (mediaCount > 0 && categoryDef?.images?.length) {
            for (let m = 0; m < mediaCount; m++) {
                media.push(faker.helpers.arrayElement(categoryDef.images));
            }
        }

        const tags = faker.helpers.arrayElements(categoryDef.tags, { min: 2, max: 5 });

        postsData.push({
            title,
            content,
            media,
            category: categoryDoc._id,
            price,
            tags,
            author: author._id,
            status: 'active',
            likesCount: 0,
            commentsCount: 0,
            createdAt: faker.date.recent({ days: 30 }),
        });
    }

    const posts = await Post.insertMany(postsData);
    console.log(`✅ Created ${posts.length} posts.`);

    // 5. Create Comments & Threaded Replies
    console.log('\n💬 Generating comments and nested discussion threads...');
    const commentsData = [];
    const topLevelComments = [];

    for (const post of posts) {
        const commentCount = faker.number.int({ min: 1, max: 6 });
        for (let c = 0; c < commentCount; c++) {
            const commentAuthor = faker.helpers.arrayElement(activeUsers);
            const isMarketplace = post.price !== undefined;

            const text = isMarketplace
                ? faker.helpers.arrayElement([
                      'Is this still available?',
                      'Would you consider trading for other gear?',
                      'What is the lowest price you would accept?',
                      'Great price! Sent you a direct message.',
                      'How long have you owned this?',
                      'Can you post more photos of the back?',
                  ])
                : faker.helpers.arrayElement([
                      'Great insight, totally agree with your point!',
                      'Thanks for sharing this, very helpful.',
                      'Interesting perspective. Had not considered that angle before.',
                      'Love this! Keep up the great work.',
                      'Could you elaborate a bit more on the second point?',
                  ]);

            const newComment = {
                _id: new mongoose.Types.ObjectId(),
                post: post._id,
                author: commentAuthor._id,
                text,
                parentComment: null,
                createdAt: faker.date.between({ from: post.createdAt, to: new Date() }),
            };

            commentsData.push(newComment);
            topLevelComments.push(newComment);

            // 40% chance of a reply to this comment
            if (faker.datatype.boolean(0.4)) {
                const replyAuthor = faker.helpers.arrayElement(
                    activeUsers.filter((u) => u._id.toString() !== commentAuthor._id.toString())
                );
                const replyText = isMarketplace
                    ? faker.helpers.arrayElement([
                          'Yes, still available! Send me an offer.',
                          'Sorry, looking for cash only at the moment.',
                          'Check your DM, I sent you the details.',
                      ])
                    : faker.helpers.arrayElement([
                          'Well said!',
                          '+1 on this.',
                          'Exactly what I was going to mention.',
                      ]);

                commentsData.push({
                    _id: new mongoose.Types.ObjectId(),
                    post: post._id,
                    author: replyAuthor._id,
                    text: replyText,
                    parentComment: newComment._id,
                    createdAt: new Date(newComment.createdAt.getTime() + 1000 * 60 * 15),
                });
            }
        }
    }

    await Comment.insertMany(commentsData);
    console.log(`✅ Created ${commentsData.length} comments.`);

    // 6. Create Likes (with unique compound index user + post)
    console.log('\n❤️ Generating likes & updating engagement counters...');
    const likesSet = new Set();
    const likesData = [];
    const postLikeCounts = new Map();
    const postCommentCounts = new Map();

    for (const post of posts) {
        const likeCount = faker.number.int({ min: 2, max: 15 });
        const postUsers = faker.helpers.arrayElements(activeUsers, Math.min(likeCount, activeUsers.length));
        
        for (const user of postUsers) {
            const key = `${user._id.toString()}_${post._id.toString()}`;
            if (!likesSet.has(key)) {
                likesSet.add(key);
                likesData.push({
                    user: user._id,
                    post: post._id,
                    createdAt: faker.date.between({ from: post.createdAt, to: new Date() }),
                });
                postLikeCounts.set(post._id.toString(), (postLikeCounts.get(post._id.toString()) || 0) + 1);
            }
        }
    }

    await Like.insertMany(likesData);
    console.log(`✅ Created ${likesData.length} unique likes.`);

    // Compute comments count per post
    for (const comm of commentsData) {
        const pId = comm.post.toString();
        postCommentCounts.set(pId, (postCommentCounts.get(pId) || 0) + 1);
    }

    // Bulk update posts with accurate counters
    const bulkPostUpdates = posts.map((p) => ({
        updateOne: {
            filter: { _id: p._id },
            update: {
                $set: {
                    likesCount: postLikeCounts.get(p._id.toString()) || 0,
                    commentsCount: postCommentCounts.get(p._id.toString()) || 0,
                },
            },
        },
    }));
    await Post.bulkWrite(bulkPostUpdates);
    console.log('✅ Synchronized Post likesCount and commentsCount.');

    // 7. Create Follow Relationships
    console.log('\n🤝 Generating follow graph...');
    const followSet = new Set();
    const followData = [];

    for (const user of activeUsers) {
        const otherUsers = activeUsers.filter((u) => u._id.toString() !== user._id.toString());
        const followTargets = faker.helpers.arrayElements(otherUsers, { min: 2, max: 8 });

        for (const target of followTargets) {
            const key = `${user._id.toString()}_${target._id.toString()}`;
            if (!followSet.has(key)) {
                followSet.add(key);
                followData.push({
                    follower: user._id,
                    following: target._id,
                    createdAt: faker.date.recent({ days: 45 }),
                });
            }
        }
    }

    await Follow.insertMany(followData);
    console.log(`✅ Created ${followData.length} follow relationships.`);

    // 8. Create Conversations & Messages
    console.log('\n💬 Generating conversations & chat message histories...');
    const conversationsData = [];
    const messagesData = [];

    // Ensure testUser has active conversations
    const conversationPairs = [
        [testUser._id, adminUser._id],
        ...activeUsers.slice(3, 10).map((u) => [testUser._id, u._id]),
        ...Array.from({ length: 8 }).map(() => {
            const pair = faker.helpers.arrayElements(activeUsers, 2);
            return [pair[0]._id, pair[1]._id];
        }),
    ];

    for (const [userA, userB] of conversationPairs) {
        const convId = new mongoose.Types.ObjectId();
        const msgCount = faker.number.int({ min: 3, max: 8 });
        let lastMsgId = null;

        const convMessages = [];
        let curTime = faker.date.recent({ days: 10 });

        for (let m = 0; m < msgCount; m++) {
            const sender = m % 2 === 0 ? userA : userB;
            const receiver = m % 2 === 0 ? userB : userA;
            curTime = new Date(curTime.getTime() + 1000 * 60 * faker.number.int({ min: 2, max: 60 }));

            const msgId = new mongoose.Types.ObjectId();
            lastMsgId = msgId;

            const isRead = m < msgCount - 1 || faker.datatype.boolean(0.5);

            convMessages.push({
                _id: msgId,
                conversation: convId,
                sender,
                text: faker.helpers.arrayElement([
                    'Hey there, how are you doing?',
                    'Hi! I saw your listing on the marketplace and wanted to ask about condition.',
                    'Everything is in mint condition, rarely used!',
                    'Would you be open to a slight discount if I pick it up today?',
                    'Sure thing, let us make a deal!',
                    'Sounds great. Let me know when you are available.',
                    'Thanks for the quick response!',
                ]),
                attachments: [],
                isRead,
                readBy: isRead ? [{ user: receiver, readAt: curTime }] : [],
                createdAt: curTime,
            });
        }

        messagesData.push(...convMessages);
        conversationsData.push({
            _id: convId,
            participants: [userA, userB],
            lastMessage: lastMsgId,
            title: '',
            isGroup: false,
            updatedAt: curTime,
        });
    }

    await Message.insertMany(messagesData);
    await Conversation.insertMany(conversationsData);
    console.log(`✅ Created ${conversationsData.length} conversations and ${messagesData.length} messages.`);

    // 9. Create Marketplace Offers & Negotiations
    console.log('\n🏷️ Generating marketplace offers & negotiation counter-offers...');
    const offersData = [];
    const marketplacePosts = posts.filter((p) => p.price !== undefined);

    for (let o = 0; o < Math.min(marketplacePosts.length, 20); o++) {
        const post = marketplacePosts[o];
        const sellerId = post.author;
        const buyer = activeUsers.find((u) => u._id.toString() !== sellerId.toString()) || testUser;

        // Find or associate with conversation
        const conv = conversationsData.find(
            (c) =>
                c.participants.map((id) => id.toString()).includes(sellerId.toString()) &&
                c.participants.map((id) => id.toString()).includes(buyer._id.toString())
        ) || conversationsData[0];

        const originalPrice = post.price;
        const initialOfferAmount = Math.round(originalPrice * faker.number.float({ min: 0.75, max: 0.95 }));

        const offer1Id = new mongoose.Types.ObjectId();
        const statusOutcome = faker.helpers.arrayElement(['accepted', 'countered', 'pending', 'rejected']);

        if (statusOutcome === 'countered') {
            // Initial buyer offer marked 'countered'
            offersData.push({
                _id: offer1Id,
                conversation: conv._id,
                post: post._id,
                buyer: buyer._id,
                seller: sellerId,
                proposedBy: buyer._id,
                amount: initialOfferAmount,
                status: 'countered',
                previousOffer: null,
                createdAt: faker.date.recent({ days: 5 }),
            });

            // Seller counter-offer pointing back to offer1
            const counterAmount = Math.round(originalPrice * 0.95);
            offersData.push({
                conversation: conv._id,
                post: post._id,
                buyer: buyer._id,
                seller: sellerId,
                proposedBy: sellerId,
                amount: counterAmount,
                status: 'pending',
                previousOffer: offer1Id,
                createdAt: faker.date.recent({ days: 2 }),
            });
        } else {
            offersData.push({
                _id: offer1Id,
                conversation: conv._id,
                post: post._id,
                buyer: buyer._id,
                seller: sellerId,
                proposedBy: buyer._id,
                amount: initialOfferAmount,
                status: statusOutcome,
                previousOffer: null,
                createdAt: faker.date.recent({ days: 4 }),
            });
        }
    }

    await Offer.insertMany(offersData);
    console.log(`✅ Created ${offersData.length} marketplace offers.`);

    // 10. Create Saved Posts (Bookmarks)
    console.log('\n🔖 Generating saved bookmarks...');
    const savedPostsData = [];
    const savedSet = new Set();

    for (const user of activeUsers.slice(0, 15)) {
        const bookmarked = faker.helpers.arrayElements(posts, { min: 2, max: 6 });
        for (const post of bookmarked) {
            const key = `${user._id.toString()}_${post._id.toString()}`;
            if (!savedSet.has(key)) {
                savedSet.add(key);
                savedPostsData.push({
                    user: user._id,
                    post: post._id,
                    createdAt: faker.date.recent({ days: 20 }),
                });
            }
        }
    }

    await SavedPost.insertMany(savedPostsData);
    console.log(`✅ Created ${savedPostsData.length} saved bookmarks.`);

    // 11. Create Notifications
    console.log('\n🔔 Generating user notifications...');
    const notificationsData = [];

    for (const user of activeUsers.slice(0, 10)) {
        const notifCount = faker.number.int({ min: 3, max: 7 });
        for (let n = 0; n < notifCount; n++) {
            const sender = faker.helpers.arrayElement(
                activeUsers.filter((u) => u._id.toString() !== user._id.toString())
            );
            const type = faker.helpers.arrayElement(['LIKE', 'COMMENT', 'FOLLOW', 'MESSAGE', 'NEW_POST']);
            const targetPost = faker.helpers.arrayElement(posts);

            notificationsData.push({
                recipient: user._id,
                sender: sender._id,
                type,
                isRead: faker.datatype.boolean(0.4),
                targetId: type === 'FOLLOW' ? sender._id : targetPost._id,
                metadata: {
                    postTitle: targetPost.title,
                    messagePreview: 'Sent you a new update.',
                },
                createdAt: faker.date.recent({ days: 14 }),
            });
        }
    }

    await Notification.insertMany(notificationsData);
    console.log(`✅ Created ${notificationsData.length} notifications.`);

    // 12. Create Payments & Stripe Transactions
    console.log('\n💳 Generating mock Stripe payments...');
    const paymentsData = [];

    for (let p = 0; p < Math.min(marketplacePosts.length, 12); p++) {
        const post = marketplacePosts[p];
        const buyer = activeUsers.find((u) => u._id.toString() !== post.author.toString()) || testUser;
        const status = faker.helpers.weightedArrayElement([
            { weight: 80, value: 'completed' },
            { weight: 12, value: 'pending' },
            { weight: 8, value: 'refunded' },
        ]);

        paymentsData.push({
            amount: post.price,
            currency: 'USD',
            provider: 'stripe',
            status,
            transactionId: `pi_test_${faker.string.alphanumeric(24)}`,
            buyer: buyer._id,
            seller: post.author,
            post: post._id,
            metadata: {
                postTitle: post.title,
                customerEmail: buyer.email,
            },
            createdAt: faker.date.recent({ days: 25 }),
        });
    }

    await Payment.insertMany(paymentsData);
    console.log(`✅ Created ${paymentsData.length} payment records.`);

    // 13. Create Moderation Reports & Audit Logs
    console.log('\n🛡️ Generating moderation reports and audit logs...');
    const reportsData = [];
    const auditLogsData = [];

    const reportedPosts = faker.helpers.arrayElements(posts, 4);
    for (const post of reportedPosts) {
        const reporter = faker.helpers.arrayElement(activeUsers);
        const reportStatus = faker.helpers.arrayElement(['pending', 'resolved', 'dismissed']);

        reportsData.push({
            reporter: reporter._id,
            targetType: 'post',
            targetId: post._id,
            reason: faker.helpers.arrayElement([
                'Misleading listing details or counterfeit suspicion.',
                'Inappropriate text content in listing.',
                'Duplicate spam post.',
            ]),
            status: reportStatus,
            resolutionNotes: reportStatus !== 'pending' ? 'Reviewed by moderation team. Listing verified.' : '',
            resolvedBy: reportStatus !== 'pending' ? adminUser._id : null,
            resolvedAt: reportStatus !== 'pending' ? new Date() : null,
            createdAt: faker.date.recent({ days: 7 }),
        });

        if (reportStatus === 'resolved') {
            auditLogsData.push({
                actor: adminUser._id,
                action: 'REPORT_RESOLVE',
                targetType: 'post',
                targetId: post._id,
                details: { reason: 'Reviewed and closed resolution.' },
                ipAddress: '127.0.0.1',
                userAgent: 'Admin-Dashboard/1.0',
            });
        }
    }

    // Category creation audit logs
    for (const cat of categories) {
        auditLogsData.push({
            actor: adminUser._id,
            action: 'CATEGORY_CREATE',
            targetType: 'category',
            targetId: cat._id,
            details: { categoryName: cat.name },
            ipAddress: '127.0.0.1',
            userAgent: 'Admin-Dashboard/1.0',
        });
    }

    await Report.insertMany(reportsData);
    await AuditLog.insertMany(auditLogsData);
    console.log(`✅ Created ${reportsData.length} reports and ${auditLogsData.length} audit logs.`);

    // Final Summary Printout
    console.log('\n======================================================');
    console.log('🎉 SYNTHETIC DATA GENERATION COMPLETE!');
    console.log('======================================================');
    console.log('📊 Summary of Seeded Data:');
    console.log(`   - Users:          ${allUsers.length}`);
    console.log(`   - Categories:     ${categories.length}`);
    console.log(`   - Posts/Listings: ${posts.length}`);
    console.log(`   - Comments:       ${commentsData.length}`);
    console.log(`   - Likes:          ${likesData.length}`);
    console.log(`   - Follows:        ${followData.length}`);
    console.log(`   - Conversations:  ${conversationsData.length}`);
    console.log(`   - Chat Messages:  ${messagesData.length}`);
    console.log(`   - Offers:         ${offersData.length}`);
    console.log(`   - Saved Posts:    ${savedPostsData.length}`);
    console.log(`   - Notifications:  ${notificationsData.length}`);
    console.log(`   - Payments:       ${paymentsData.length}`);
    console.log(`   - Reports:        ${reportsData.length}`);
    console.log(`   - Audit Logs:     ${auditLogsData.length}`);
    console.log('------------------------------------------------------');
    console.log('🔑 Standard Test Logins (Password for all: Password123!):');
    console.log('   - Admin:      admin@example.com');
    console.log('   - Moderator:  moderator@example.com');
    console.log('   - Test User:  testuser@example.com');
    console.log('======================================================\n');

    await mongoose.connection.close();
    console.log('🔌 Database connection closed cleanly.');
    process.exit(0);
}

seedDatabase().catch((err) => {
    console.error('❌ Seeding failed with error:', err);
    mongoose.connection.close().finally(() => process.exit(1));
});
