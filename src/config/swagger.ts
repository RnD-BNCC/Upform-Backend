import swaggerJSDoc from 'swagger-jsdoc'

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'UpForm API',
      version: '1.0.0',
      description: 'UpForm Backend API — Events, Sections, Responses, Polls, Upload, Gallery, Email Blasts',
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
        // ─── Events ────────────────────────────────────────────────────────────
        Event: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string' },
            status: { type: 'string', enum: ['draft', 'active', 'closed'] },
            color: { type: 'string', example: '#0054a5' },
            theme: { type: 'string', example: 'light' },
            image: { type: 'string', nullable: true },
            spreadsheetId: { type: 'string', nullable: true },
            spreadsheetUrl: { type: 'string', nullable: true },
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

        // ─── Sections ──────────────────────────────────────────────────────────
        Section: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            description: { type: 'string' },
            order: { type: 'integer' },
            pageType: { type: 'string', example: 'page' },
            logicX: { type: 'number', nullable: true },
            logicY: { type: 'number', nullable: true },
            fields: { type: 'array', items: { $ref: '#/components/schemas/FormField' } },
            settings: {
              type: 'object',
              additionalProperties: true,
              example: {
                calculations: [
                  { id: 'calc-1', name: 'Score', type: 'number', initialValue: '0', rules: [] },
                ],
              },
            },
            eventId: { type: 'string', format: 'uuid' },
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
            settings: { type: 'object', additionalProperties: true },
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

        // ─── Form Fields ────────────────────────────────────────────────────────
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

        // ─── Responses ─────────────────────────────────────────────────────────
        Response: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            eventId: { type: 'string', format: 'uuid' },
            answers: {
              type: 'object',
              additionalProperties: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
            },
            respondentUuid: { type: 'string', nullable: true },
            startedAt: { type: 'string', format: 'date-time', nullable: true },
            completedAt: { type: 'string', format: 'date-time', nullable: true },
            submittedAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            deviceType: { type: 'string', nullable: true },
            userAgent: { type: 'string', nullable: true },
            sectionHistory: { type: 'array', items: { type: 'integer' } },
            currentSectionId: { type: 'string', nullable: true },
            currentSectionIndex: { type: 'integer', nullable: true },
            progressPercent: { type: 'number', nullable: true },
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
            progressId: { type: 'string', format: 'uuid', nullable: true },
            respondentUuid: { type: 'string' },
            startedAt: { type: 'string', format: 'date-time' },
            deviceType: { type: 'string' },
            userAgent: { type: 'string' },
            sectionHistory: { type: 'array', items: { type: 'integer' } },
            currentSectionId: { type: 'string', nullable: true },
            currentSectionIndex: { type: 'integer' },
            progressPercent: { type: 'number' },
          },
        },

        // ─── Response Progress ──────────────────────────────────────────────────
        ResponseProgress: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            eventId: { type: 'string', format: 'uuid' },
            answers: {
              type: 'object',
              additionalProperties: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
            },
            otherTexts: { type: 'object', additionalProperties: { type: 'string' } },
            respondentUuid: { type: 'string', nullable: true },
            startedAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            deviceType: { type: 'string', nullable: true },
            userAgent: { type: 'string', nullable: true },
            sectionHistory: { type: 'array', items: { type: 'integer' } },
            currentSectionId: { type: 'string', nullable: true },
            currentSectionIndex: { type: 'integer', nullable: true },
            progressPercent: { type: 'number', nullable: true },
          },
        },
        SaveResponseProgressBody: {
          type: 'object',
          properties: {
            answers: {
              type: 'object',
              additionalProperties: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
            },
            otherTexts: { type: 'object', additionalProperties: { type: 'string' } },
            respondentUuid: { type: 'string' },
            startedAt: { type: 'string', format: 'date-time' },
            deviceType: { type: 'string' },
            userAgent: { type: 'string' },
            sectionHistory: { type: 'array', items: { type: 'integer' } },
            currentSectionId: { type: 'string', nullable: true },
            currentSectionIndex: { type: 'integer' },
            progressPercent: { type: 'number' },
          },
        },

        // ─── Polls ─────────────────────────────────────────────────────────────
        Poll: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            code: { type: 'string', example: '12345678', description: '8-digit join code' },
            status: { type: 'string', enum: ['waiting', 'active', 'ended'] },
            currentSlide: { type: 'integer' },
            settings: { type: 'object', additionalProperties: true },
            slides: { type: 'array', items: { $ref: '#/components/schemas/PollSlide' } },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },

        // ─── Poll Slides ────────────────────────────────────────────────────────
        PollSlide: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            pollId: { type: 'string', format: 'uuid' },
            type: {
              type: 'string',
              enum: ['word_cloud', 'multiple_choice', 'open_ended', 'ranking', 'scales', 'qa'],
            },
            question: { type: 'string' },
            options: { type: 'array', items: { type: 'string' } },
            settings: { type: 'object', additionalProperties: true },
            order: { type: 'integer' },
            locked: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },

        // ─── Email Blasts ───────────────────────────────────────────────────────
        EmailBlast: {
          type: 'object',
          description: 'Summary view returned by list endpoint',
          properties: {
            id: { type: 'string', format: 'uuid' },
            eventId: { type: 'string', format: 'uuid', nullable: true },
            subject: { type: 'string' },
            status: { type: 'string', enum: ['queued', 'sending', 'completed', 'cancelled'] },
            sentCount: { type: 'integer' },
            failedCount: { type: 'integer' },
            totalCount: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        EmailBlastDetail: {
          type: 'object',
          description: 'Full blast returned by create / get-by-id (includes html, recipients, logs)',
          properties: {
            id: { type: 'string', format: 'uuid' },
            eventId: { type: 'string', format: 'uuid', nullable: true },
            subject: { type: 'string' },
            html: { type: 'string' },
            recipients: { type: 'array', items: { type: 'string', format: 'email' } },
            status: { type: 'string', enum: ['queued', 'sending', 'completed', 'cancelled'] },
            sentCount: { type: 'integer' },
            failedCount: { type: 'integer' },
            totalCount: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            logs: { type: 'array', items: { $ref: '#/components/schemas/EmailLog' } },
          },
        },
        EmailLog: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            blastId: { type: 'string', format: 'uuid' },
            recipient: { type: 'string', format: 'email' },
            status: { type: 'string', enum: ['queued', 'sent', 'failed'] },
            error: { type: 'string', nullable: true },
            attempt: { type: 'integer' },
            sentAt: { type: 'string', format: 'date-time', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        EmailComposerDraft: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            eventId: { type: 'string', format: 'uuid' },
            subject: { type: 'string' },
            emailStyle: { type: 'string', enum: ['basic', 'formatted'] },
            emailThemeValue: { type: 'string', nullable: true },
            blocks: { type: 'array', items: { type: 'object', additionalProperties: true } },
            recipientMode: { type: 'string', enum: ['field', 'manual'] },
            manualRecipients: { type: 'array', items: { type: 'string', format: 'email' } },
            selectedEmailFieldIds: { type: 'array', items: { type: 'string' } },
            excludedRecipients: { type: 'array', items: { type: 'string', format: 'email' } },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        SaveEmailComposerDraft: {
          type: 'object',
          properties: {
            subject: { type: 'string' },
            emailStyle: { type: 'string', enum: ['basic', 'formatted'] },
            emailThemeValue: { type: 'string', nullable: true },
            blocks: { type: 'array', items: { type: 'object', additionalProperties: true } },
            recipientMode: { type: 'string', enum: ['field', 'manual'] },
            manualRecipients: { type: 'array', items: { type: 'string', format: 'email' } },
            selectedEmailFieldIds: { type: 'array', items: { type: 'string' } },
            excludedRecipients: { type: 'array', items: { type: 'string', format: 'email' } },
          },
        },

        // ─── Gallery ────────────────────────────────────────────────────────────
        GalleryMediaItem: {
          type: 'object',
          properties: {
            key: { type: 'string', example: 'slides/uuid.png' },
            url: { type: 'string', format: 'uri' },
            filename: { type: 'string' },
            size: { type: 'integer', description: 'File size in bytes' },
            lastModified: { type: 'string', format: 'date-time' },
          },
        },

        // ─── Event Analytics ───────────────────────────────────────────────────
        EventAnalyticsEvent: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            eventId: { type: 'string', format: 'uuid' },
            type: {
              type: 'string',
              enum: ['view', 'start', 'section_view', 'finish'],
            },
            respondentUuid: { type: 'string', nullable: true },
            sessionUuid: { type: 'string', nullable: true },
            sectionHistory: { type: 'array', items: { type: 'integer' } },
            sectionId: { type: 'string', nullable: true },
            sectionIndex: { type: 'integer', nullable: true },
            progressPercent: { type: 'number', nullable: true },
            deviceType: { type: 'string', nullable: true },
            userAgent: { type: 'string', nullable: true },
            answers: {
              type: 'object',
              additionalProperties: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
            },
            occurredAt: { type: 'string', format: 'date-time' },
          },
        },
        TrackAnalyticsBody: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['view', 'start', 'section_view', 'finish'] },
            respondentUuid: { type: 'string' },
            sessionUuid: { type: 'string' },
            currentSectionId: { type: 'string', nullable: true },
            currentSectionIndex: { type: 'integer' },
            progressPercent: { type: 'number' },
            sectionHistory: { type: 'array', items: { type: 'integer' } },
            answers: {
              type: 'object',
              additionalProperties: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
            },
            deviceType: { type: 'string' },
            userAgent: { type: 'string' },
          },
        },

        // ─── Common ─────────────────────────────────────────────────────────────
        Meta: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            take: { type: 'integer' },
            total: { type: 'integer' },
            totalPages: { type: 'integer' },
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
  apis: ['./src/routes/**/*.ts'],
}

export const swaggerSpec = swaggerJSDoc(options)
