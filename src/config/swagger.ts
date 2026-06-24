import path from 'node:path';
import { fileURLToPath } from 'node:url';
import swaggerJsdoc from 'swagger-jsdoc';
import { env } from './env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const errorResponse = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: false },
    message: { type: 'string' },
    errors: {
      type: 'object',
      additionalProperties: {
        type: 'array',
        items: { type: 'string' },
      },
    },
  },
};

const successEnvelope = (dataSchema: Record<string, unknown>) => ({
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: dataSchema,
  },
});

export const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: `${env.APP_NAME} API`,
      version: env.API_VERSION,
      description:
        'Enterprise Printing ERP API. Use **Authorize** with a JWT Bearer token from `POST /auth/login`.',
      contact: { name: 'Geeta Print Engineering' },
    },
    servers: [
      { url: `${env.APP_URL}${env.API_PREFIX}/${env.API_VERSION}`, description: 'API v1' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT access token from login or refresh',
        },
      },
      schemas: {
        ErrorResponse: errorResponse,
        ValidationErrorResponse: errorResponse,
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
          },
        },
        AuthTokens: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string' },
            role: { type: 'string' },
          },
        },
        PaginationMeta: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            limit: { type: 'integer' },
            total: { type: 'integer' },
            totalPages: { type: 'integer' },
          },
        },
      },
      responses: {
        Unauthorized: {
          description: 'Missing or invalid JWT',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        },
        Forbidden: {
          description: 'Insufficient permissions',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        },
        NotFound: {
          description: 'Resource not found',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        },
        ValidationError: {
          description: 'Request validation failed',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ValidationErrorResponse' } },
          },
        },
        ServerError: {
          description: 'Internal server error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Authentication & session' },
      { name: 'Users', description: 'User management' },
      { name: 'Vendors', description: 'Vendor portal & onboarding' },
      { name: 'Products', description: 'Product catalog' },
      { name: 'Categories', description: 'Category management' },
      { name: 'Orders', description: 'Production orders' },
      { name: 'Wallet', description: 'Vendor wallet & balance' },
      { name: 'Payments', description: 'Razorpay payments' },
      { name: 'Reports', description: 'Analytics & exports' },
      { name: 'Support', description: 'Support tickets' },
      { name: 'Notifications', description: 'In-app notifications' },
      { name: 'Slider', description: 'Homepage sliders' },
      { name: 'Settings', description: 'System & delivery settings' },
      { name: 'Health', description: 'System health probes' },
      { name: 'Monitoring', description: 'Admin observability (admin only)' },
    ],
    paths: {
      '/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Login',
          security: [],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } },
          },
          responses: {
            '200': {
              description: 'Login successful',
              content: {
                'application/json': {
                  schema: successEnvelope({
                    type: 'object',
                    properties: {
                      user: { $ref: '#/components/schemas/User' },
                      tokens: { $ref: '#/components/schemas/AuthTokens' },
                    },
                  }),
                },
              },
            },
            '400': { $ref: '#/components/responses/ValidationError' },
            '401': { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },
      '/auth/register': {
        post: {
          tags: ['Auth'],
          summary: 'Register user',
          security: [],
          responses: { '201': { description: 'User created' }, '400': { $ref: '#/components/responses/ValidationError' } },
        },
      },
      '/auth/register/vendor': {
        post: {
          tags: ['Auth'],
          summary: 'Register vendor',
          security: [],
          responses: { '201': { description: 'Vendor registered' } },
        },
      },
      '/auth/refresh': {
        post: {
          tags: ['Auth'],
          summary: 'Refresh access token',
          security: [],
          responses: { '200': { description: 'New tokens issued' } },
        },
      },
      '/auth/logout': {
        post: { tags: ['Auth'], summary: 'Logout', security: [], responses: { '200': { description: 'Logged out' } } },
      },
      '/auth/me': {
        get: {
          tags: ['Auth'],
          summary: 'Current user profile',
          responses: {
            '200': { description: 'Profile' },
            '401': { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },
      '/users': {
        get: { tags: ['Users'], summary: 'List users', responses: { '200': { description: 'User list' } } },
        post: { tags: ['Users'], summary: 'Create user', responses: { '201': { description: 'Created' } } },
      },
      '/users/{id}': {
        get: { tags: ['Users'], summary: 'Get user', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'User' } } },
        patch: { tags: ['Users'], summary: 'Update user', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Updated' } } },
      },
      '/vendors/me': {
        get: { tags: ['Vendors'], summary: 'Vendor profile (settings)', responses: { '200': { description: 'Vendor profile' } } },
      },
      '/admin/vendors': {
        get: { tags: ['Vendors'], summary: 'Admin: list vendors', responses: { '200': { description: 'Vendor list' } } },
      },
      '/admin/vendors/{id}': {
        get: { tags: ['Vendors'], summary: 'Admin: vendor detail', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Detail' } } },
      },
      '/products': {
        get: { tags: ['Products'], summary: 'List products', responses: { '200': { description: 'Products' } } },
      },
      '/public/products': {
        get: { tags: ['Products'], summary: 'Public product catalog', security: [], responses: { '200': { description: 'Catalog' } } },
      },
      '/admin/products': {
        get: { tags: ['Products'], summary: 'Admin: list products', responses: { '200': { description: 'Products' } } },
        post: { tags: ['Products'], summary: 'Admin: create product', responses: { '201': { description: 'Created' } } },
      },
      '/categories': {
        get: { tags: ['Categories'], summary: 'List categories', responses: { '200': { description: 'Categories' } } },
      },
      '/admin/categories': {
        get: { tags: ['Categories'], summary: 'Admin: categories', responses: { '200': { description: 'Categories' } } },
      },
      '/orders': {
        get: { tags: ['Orders'], summary: 'List orders', responses: { '200': { description: 'Orders' } } },
        post: { tags: ['Orders'], summary: 'Place order', responses: { '201': { description: 'Order created' } } },
      },
      '/orders/{id}': {
        get: { tags: ['Orders'], summary: 'Order detail', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Order' } } },
      },
      '/wallet/summary': {
        get: { tags: ['Wallet'], summary: 'Wallet summary', responses: { '200': { description: 'Summary' } } },
      },
      '/wallet/transactions': {
        get: { tags: ['Wallet'], summary: 'Wallet transactions', responses: { '200': { description: 'Transactions' } } },
      },
      '/admin/wallets': {
        get: { tags: ['Wallet'], summary: 'Admin: list wallets', responses: { '200': { description: 'Wallets' } } },
      },
      '/payments/create': {
        post: { tags: ['Payments'], summary: 'Create payment', responses: { '201': { description: 'Payment order' } } },
      },
      '/reports': {
        get: { tags: ['Reports'], summary: 'Reports', responses: { '200': { description: 'Report data' } } },
      },
      '/support/tickets': {
        get: { tags: ['Support'], summary: 'List tickets', responses: { '200': { description: 'Tickets' } } },
        post: { tags: ['Support'], summary: 'Create ticket', responses: { '201': { description: 'Created' } } },
      },
      '/notifications': {
        get: { tags: ['Notifications'], summary: 'List notifications', responses: { '200': { description: 'Notifications' } } },
      },
      '/sliders': {
        get: { tags: ['Slider'], summary: 'Public sliders', security: [], responses: { '200': { description: 'Sliders' } } },
      },
      '/admin/sliders': {
        get: { tags: ['Slider'], summary: 'Admin: sliders', responses: { '200': { description: 'Sliders' } } },
      },
      '/settings': {
        get: { tags: ['Settings'], summary: 'App settings', responses: { '200': { description: 'Settings' } } },
      },
      '/admin/delivery/settings': {
        get: { tags: ['Settings'], summary: 'Delivery settings', responses: { '200': { description: 'Settings' } } },
        put: { tags: ['Settings'], summary: 'Update delivery settings', responses: { '200': { description: 'Updated' } } },
      },
      '/admin/monitoring/dashboard': {
        get: {
          tags: ['Monitoring'],
          summary: 'Performance dashboard metrics',
          responses: { '200': { description: 'Dashboard data' }, '403': { $ref: '#/components/responses/Forbidden' } },
        },
      },
      '/admin/monitoring/endpoints': {
        get: { tags: ['Monitoring'], summary: 'Per-endpoint API metrics', responses: { '200': { description: 'Metrics' } } },
      },
      '/admin/monitoring/slow-requests': {
        get: { tags: ['Monitoring'], summary: 'Slow API requests', responses: { '200': { description: 'Slow requests' } } },
      },
      '/admin/monitoring/errors': {
        get: { tags: ['Monitoring'], summary: 'Tracked errors', responses: { '200': { description: 'Errors' } } },
      },
      '/admin/monitoring/database': {
        get: { tags: ['Monitoring'], summary: 'Database query metrics', responses: { '200': { description: 'DB metrics' } } },
      },
      '/admin/monitoring/timeline/{requestId}': {
        get: {
          tags: ['Monitoring'],
          summary: 'Request timeline breakdown',
          parameters: [{ name: 'requestId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Timeline' }, '404': { $ref: '#/components/responses/NotFound' } },
        },
      },
    },
  },
  apis: [
    path.join(__dirname, '../modules/**/*.routes.ts'),
    path.join(__dirname, '../modules/**/*.routes.js'),
  ],
};

export const swaggerSpec = swaggerJsdoc(swaggerOptions);
