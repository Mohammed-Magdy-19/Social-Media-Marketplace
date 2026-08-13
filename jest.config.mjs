export default {
    testEnvironment: 'node',
    transform: {},
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },
    testMatch: [
        '**/tests/**/*.test.js',
    ],
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/server.js',
        '!src/app.js',
    ],
    testTimeout: 10000,
    verbose: true,
};
