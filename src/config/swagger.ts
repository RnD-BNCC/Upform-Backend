import swaggerJSDoc from 'swagger-jsdoc'

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'UpForm API',
      version: '1.0.0',
      description: 'UpForm Backend API — Events, Sections, Responses',
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Local' },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Paste your Better Auth session token here',
        },
      },
      schemas: {
        Event: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string' },
            status: { type: 'string', enum: ['draft', 'active', 'closed'] },
            color: { type: 'string' },
            userId: { type: 'string' },
            sections: { type: 'array', items: { $ref: '#/components/schemas/Section' } },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        CreateEvent: {
          type: 'object',
          properties: {
            name: { type: 'string', example: '' },
            description: { type: 'string', example: '' },
            color: { type: 'string', example: '#0054a5' },
          },
        },
        UpdateEvent: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            status: { type: 'string', enum: ['draft', 'active', 'closed'] },
            color: { type: 'string' },
          },
        },
        Section: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            description: { type: 'string' },
            order: { type: 'integer' },
            fields: { type: 'array', items: { $ref: '#/components/schemas/FormField' } },
            eventId: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        CreateSection: {
          type: 'object',
          properties: {
            title: { type: 'string', example: '' },
            description: { type: 'string', example: '' },
          },
        },
        UpdateSection: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            order: { type: 'integer' },
            fields: { type: 'array', items: { $ref: '#/components/schemas/FormField' } },
          },
        },
        ReorderSections: {
          type: 'object',
          required: ['order'],
          properties: {
            order: {
              type: 'array',
              items: { type: 'string', format: 'uuid' },
              description: 'Array of section IDs in desired order',
              example: ['uuid-1', 'uuid-2', 'uuid-3'],
            },
          },
        },
        FormField: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            type: {
              type: 'string',
              enum: [
                'short_text', 'paragraph', 'multiple_choice', 'checkbox',
                'dropdown', 'date', 'time', 'email', 'file_upload',
                'rating', 'linear_scale', 'title_block', 'image_block',
              ],
            },
            label: { type: 'string' },
            required: { type: 'boolean' },
            placeholder: { type: 'string' },
            options: { type: 'array', items: { type: 'string' } },
            branches: { type: 'object', additionalProperties: { type: 'string' } },
            description: { type: 'string' },
            shuffleOptions: { type: 'boolean' },
            optionImages: { type: 'object', additionalProperties: { type: 'string' } },
            headerImage: { type: 'string' },
            hasOtherOption: { type: 'boolean' },
            correctAnswer: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
            scaleMin: { type: 'integer' },
            scaleMax: { type: 'integer' },
            minLabel: { type: 'string' },
            maxLabel: { type: 'string' },
            ratingIcon: { type: 'string', enum: ['star', 'heart', 'thumb'] },
            imageAlign: { type: 'string', enum: ['left', 'center', 'right'] },
            imageWidth: { type: 'number' },
            imageCaption: { type: 'string' },
            allowedFileTypes: { type: 'array', items: { type: 'string' } },
            maxFileCount: { type: 'integer' },
            maxFileSizeMb: { type: 'number' },
          },
        },
        Response: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            answers: { type: 'object', additionalProperties: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] } },
            eventId: { type: 'string' },
            submittedAt: { type: 'string', format: 'date-time' },
          },
        },
        SubmitResponse: {
          type: 'object',
          required: ['answers'],
          properties: {
            answers: {
              type: 'object',
              additionalProperties: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
              example: { 'field-id-1': 'answer text', 'field-id-2': ['option1', 'option2'] },
            },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
    security: [{ BearerAuth: [] }],
  },
  apis: ['./src/routes/*.ts'],
}

export const swaggerSpec = swaggerJSDoc(options)
