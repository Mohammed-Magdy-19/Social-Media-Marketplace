import swaggerAutogen from 'swagger-autogen';

const doc = {
    openapi: '3.0.0',
    info: {
        title: 'Social Media & Community Marketplace API',
        version: '1.0.0',
        description:
            'Interactive OpenAPI 3.0 API documentation for the Social Media & Community Marketplace Backend, covering Authentication, Users, Posts/Listings, Comments, Direct Messaging, Negotiation Offers, Stripe Payments, Notifications, Media Uploads, and Admin moderation.',
        contact: {
            name: 'API Support',
        },
    },
    servers: [
        {
            url: process.env.SERVER_URL || 'https://social-media-marketplace.up.railway.app',
            description: 'Production Server (Railway)',
        },
        {
            url: `http://localhost:${process.env.PORT || 3001}`,
            description: 'Local Development Server',
        },
    ],
    tags: [
        { name: 'Auth', description: 'Authentication, registration, OTP verification, and password management' },
        { name: 'Users', description: 'User profile management, followers, and saved listings' },
        { name: 'Posts', description: 'Marketplace listings and feed post CRUD, filtering, likes, and engagement' },
        { name: 'Categories', description: 'Category taxonomy for marketplace items' },
        { name: 'Comments', description: 'Post comments and threaded replies' },
        { name: 'Conversations', description: 'Direct messaging conversation threads' },
        { name: 'Messages', description: 'Chat message retrieval and read status updates' },
        { name: 'Offers', description: 'Price negotiations and counter-offers on listings' },
        { name: 'Payments', description: 'Stripe payment intents and checkout sessions' },
        { name: 'Notifications', description: 'In-app user notifications' },
        { name: 'Uploads', description: 'Image and media upload handling (Cloudinary)' },
        { name: 'Reports', description: 'User and listing reporting for moderation' },
        { name: 'Admin', description: 'Platform administration, user management, and moderation metrics' },
        { name: 'System', description: 'Health check and diagnostic endpoints' },
    ],
    components: {
        securitySchemes: {
            bearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
                description: 'Enter your JWT access token (Bearer <token>)',
            },
            cookieAuth: {
                type: 'apiKey',
                in: 'cookie',
                name: 'refreshToken',
                description: 'HTTP-only refresh token stored in cookie',
            },
        },
        schemas: {
            ErrorResponse: {
                type: 'object',
                properties: {
                    status: { type: 'string', example: 'error' },
                    message: { type: 'string', example: 'Error description message' },
                },
            },
        },
    },
    security: [
        {
            bearerAuth: [],
        },
    ],
};

const outputFile = './swagger-output.json';
const routes = ['./src/app.js'];

/* NOTE: Generate OpenAPI 3.0 documentation */
const generateDocs = async () => {
    try {
        const autogen = swaggerAutogen({ openapi: '3.0.0' });
        await autogen(outputFile, routes, doc);
        // eslint-disable-next-line no-console
        console.log('✅ Swagger OpenAPI 3.0 documentation generated successfully at swagger-output.json');
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error('❌ Error generating swagger documentation:', error);
        process.exit(1);
    }
};

generateDocs();
