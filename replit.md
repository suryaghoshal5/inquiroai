# InquiroAI - Replit.md

## Overview

InquiroAI is a web-based AI prompt management platform that enables users to create structured, role-based conversations with multiple AI models. The application allows users to bring their own API keys (BYOK) and provides an intuitive interface for managing complex AI interactions through predefined role templates.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and optimized builds
- **Styling**: Tailwind CSS with shadcn/ui component library
- **State Management**: TanStack Query for server state management
- **Routing**: Wouter for lightweight client-side routing
- **Authentication**: Replit Auth integration with session management

### Backend Architecture
- **Runtime**: Node.js with Express.js server
- **Database**: PostgreSQL with Drizzle ORM
- **Database Provider**: Neon Database (serverless PostgreSQL)
- **WebSocket**: Real-time chat communication
- **Session Storage**: PostgreSQL-based session store
- **File Processing**: Multer for file uploads with support for PDF, Excel, Word, and text files

### AI Integration
- **Multi-Provider Support**: OpenAI, Google Gemini, Anthropic Claude, and Grok
- **API Key Management**: Encrypted storage of user-provided API keys
- **Model Selection**: Dynamic model selection per chat session
- **Prompt Engineering**: Role-based prompt templates with structured inputs

## Key Components

### Authentication System
- **Replit Auth**: OpenID Connect integration for user authentication
- **Session Management**: PostgreSQL-based session storage with 7-day TTL
- **User Management**: User profiles with email, name, and profile images
- **Protected Routes**: Authentication middleware for API endpoints

### Chat Management
- **Multi-Chat Support**: Users can create and manage multiple concurrent conversations
- **Role-Based Prompting**: 5 predefined roles (Researcher, Product Manager, Developer, Content Writer, Designer) plus custom roles
- **Structured Input**: 9 configurable fields including context, task, constraints, examples, and audience
- **Real-Time Communication**: WebSocket-based chat interface with typing indicators

### Database Schema
- **Users Table**: Store user profiles and authentication data
- **Chats Table**: Store chat configurations and metadata
- **Messages Table**: Store conversation history with role-based messages
- **API Keys Table**: Encrypted storage of user API keys with validation status
- **Role Prompts Table**: Template storage for role-based prompts
- **Sessions Table**: Session management for authentication

### File Processing
- **Supported Formats**: PDF, Excel (.xlsx/.xls), Word (.docx/.doc), Markdown, and plain text
- **File Size Limit**: 10MB maximum file size
- **Content Extraction**: Automatic text extraction from uploaded files
- **Integration**: Files can be attached to input data and examples fields

## Data Flow

1. **User Authentication**: Users authenticate via Replit Auth, creating session tokens
2. **Chat Creation**: Users fill out structured form with 9 fields defining the AI interaction
3. **Prompt Generation**: Backend generates optimized prompts based on role and input data
4. **AI Communication**: Messages are sent to selected AI provider with encrypted API keys
5. **Real-Time Updates**: WebSocket connection provides live chat updates
6. **Data Persistence**: All conversations and configurations are stored in PostgreSQL

## External Dependencies

### AI Providers
- **OpenAI**: GPT-4o, GPT-4o-mini, GPT-4-turbo, GPT-3.5-turbo
- **Google Gemini**: gemini-2.0-flash-exp, gemini-1.5-pro, gemini-1.5-flash
- **Anthropic Claude**: claude-3-5-sonnet-20241022, claude-3-opus-20240229, claude-3-haiku-20240307
- **Grok**: grok-beta, grok-vision-beta

### Database
- **Neon Database**: Serverless PostgreSQL with connection pooling
- **Drizzle ORM**: Type-safe database operations with migration support

### Authentication
- **Replit Auth**: OpenID Connect authentication provider
- **Session Storage**: PostgreSQL-based session management

### Frontend Libraries
- **shadcn/ui**: Component library built on Radix UI primitives
- **TanStack Query**: Server state management with caching
- **React Hook Form**: Form handling with Zod validation
- **Wouter**: Lightweight routing library

## Deployment Strategy

### Development
- **Vite Dev Server**: Hot module replacement for rapid development
- **TypeScript**: Full type safety across frontend and backend
- **Development Scripts**: `npm run dev` for concurrent frontend/backend development

### Production Build
- **Frontend**: Vite builds optimized React bundle to `dist/public`
- **Backend**: esbuild bundles Node.js server to `dist/index.js`
- **Database**: Drizzle migrations handle schema changes
- **Environment**: Production mode with optimized assets and security headers

### Environment Variables
- `DATABASE_URL`: PostgreSQL connection string
- `SESSION_SECRET`: Session encryption key
- `ENCRYPTION_KEY`: API key encryption key
- `REPLIT_DOMAINS`: Allowed domains for Replit Auth
- `ISSUER_URL`: OpenID Connect issuer URL

## Changelog

```
Changelog:
- July 04, 2025. Initial setup
- July 07, 2025. Disabled authentication for development - using mock user to focus on core features
  - Bypassed Passport.js and setupAuth() function
  - Created mock user with id "dev-user" for all authenticated requests
  - Updated frontend useAuth hook to use server endpoint
- July 08, 2025. Core chat functionality working
  - Fixed role selector with Lucide icons and proper styling
  - Resolved database foreign key constraint by creating mock user in database
  - Chat creation, WebSocket connection, and real-time messaging operational
  - Successfully tested end-to-end flow from form submission to chat interface
  - Updated form validation from character-based to word-based limits for better UX
  - Enhanced researcher role template with comprehensive McKinsey-style consulting prompt
    - Added structured 5-level response framework with quality controls
    - Included specialized research approaches and professional standards
    - Delivers C-suite quality analysis with actionable recommendations
  - Enhanced product manager role template with SaaS 0-10 journey specialization
    - Added early-stage product development and scaling expertise
    - Included AARRR framework, growth hacking, and PMF validation approaches
    - Added decision-making frameworks and experimentation methodologies
    - Focused on rapid iteration, resource efficiency, and startup urgency
  - Enhanced developer role template with full-stack architect specialization
    - Added comprehensive technical expertise across frontend, backend, and DevOps
    - Included system architecture, microservices, and cloud platform knowledge
    - Added technology decision frameworks and quality control checklists
    - Focused on scalable, production-ready solutions with clean code principles
  - Enhanced content writer role template with professional content strategy expertise
    - Added comprehensive content strategy and audience psychology knowledge
    - Included SEO optimization, conversion copywriting, and multi-platform adaptation
    - Added content quality frameworks and performance optimization principles
    - Focused on engagement-driven content that balances creativity with results
  - Enhanced designer role template with user-centered design expertise
    - Added comprehensive UX research, information architecture, and interaction design knowledge
    - Included design systems, accessibility compliance, and cross-platform guidelines
    - Added design evaluation frameworks and quality control checklists
    - Focused on user-centered solutions that balance aesthetics with usability
  - Added comprehensive universal safety and accuracy guidelines
    - Implemented no-hallucination policy with strict accuracy requirements
    - Added information boundaries and professional confidentiality standards
    - Included content safety guidelines and appropriate response patterns
    - Created clear decline scenarios and example response templates
    - Focused on transparency, verification, and professional referrals
  - Added sixth professional role: Presales Consultant
    - McKinsey-level presales consultant and RFP response specialist
    - Comprehensive RFP analysis, strategy, and competitive differentiation
    - Complete proposal development framework with commercial excellence
    - Stakeholder management and executive presentation capabilities
    - Go/no-go decision frameworks and competitive positioning strategies
  - Fixed critical API key decryption issue that was preventing AI responses
    - Identified and resolved cryptographic errors in API key storage
    - Cleared corrupted encrypted keys and enabled fresh API key setup
    - Switched from WebSocket to HTTP POST for reliable message delivery
    - Successfully tested end-to-end chat functionality with OpenAI integration
  - Implemented automatic initial AI response generation during chat creation
    - Full structured prompt (role, context, task, constraints, etc.) now sent to AI automatically
    - AI generates comprehensive initial response based on complete chat configuration
    - Initial response immediately available when entering new chat conversations
    - Seamless integration with existing chat messaging system
  - Enhanced chat interface with improved readability and markdown support
    - Changed chat bubble colors: blue for user messages, light gray for AI responses
    - Added react-markdown library for proper formatting of AI responses
    - Supports headers, lists, code blocks, bold/italic text, and inline code
    - Fixed console errors related to markdown rendering className warnings
  - Implemented settings and share functionality for chat interface
    - Settings button opens dialog displaying complete chat configuration template
    - Share button provides export options: PDF, Markdown, and Word formats
    - Export includes chat metadata and full conversation history
    - Files automatically download with sanitized filenames
  - Enhanced document upload functionality with visual indicators
    - Fixed file processing dependencies (pdf-parse, xlsx, mammoth) for all supported formats
    - Implemented comprehensive file type validation for PDF, Excel, Word, Markdown, and text files
    - Added visual upload indicators with file-specific icons and success messages
    - Created uploaded files list showing file names, sizes, and removal options
    - Added green success indicators with checkmarks for successful uploads
    - Enhanced drag-and-drop functionality with visual feedback overlay
    - Implemented graceful error handling for PDF processing with fallback messages
    - All document upload functionality now working reliably across all supported file types
  - Updated form validation and user experience improvements
    - Increased word limits for Examples and Input Data fields from 1,000 to 10,000 words
    - Made title field optional with auto-generation based on selected role
    - Fixed Back button navigation to show proper chat home screen instead of redirecting to new chat
    - Removed "Save Template" button from new chat form for cleaner interface
    - Created comprehensive chat home screen showing existing chats with timestamps and metadata
  - Enhanced AI model selection and researcher mode optimization
    - Added Grok3 and Grok4 models to available model list
    - Updated researcher role to automatically recommend deep research models
    - Configured researcher mode to prioritize: GPT-4o, Gemini-1.5-Pro, Claude-3-Opus, and Grok-4
    - Enhanced model recommendation logic to consider user role in addition to task content
  - Fixed DOMException WebSocket error
    - Removed unused WebSocket server from backend that was causing browser connection errors
    - System now uses only HTTP POST requests for chat messaging
    - Eliminated WebSocket connection attempts that were failing in browser
    - Simplified server architecture by removing unnecessary real-time features
  - Implemented smart post-login redirect system
    - Users without API keys are automatically redirected to settings page after login
    - Users with existing API keys are automatically redirected to new chat page after login
    - Enhanced user experience by removing need for manual navigation after authentication
    - Added AuthenticatedHome component to handle redirect logic based on API key status
  - Fixed logout functionality to ensure complete session termination
    - Updated logout endpoint to properly destroy session data and clear cookies
    - Restored login prompt to "login consent" to force fresh authentication and consent
    - Added comprehensive cookie clearing including connect.sid, session, and auth cookies
    - Implemented proper OpenID Connect logout URL that redirects users back to app landing page
    - Enhanced logout process with logout_hint=force and prompt=login parameters
    - Added comprehensive session destruction and cookie clearing to prevent auto-login
    - Fixed logout redirect to return users to app instead of staying on Replit logout page
    - Added error handling and fallback for logout process to prevent failures
  - Fixed back button navigation in Settings page to properly navigate to new chat page (/chat/new) instead of home
- July 14, 2025. Enhanced AI model selection with latest 2025 models and dynamic refresh capability
  - Added latest AI models: GPT-4.5, GPT-4.1, Gemini 2.5 Pro, Claude 4/Opus 4/Sonnet 4, Grok 4
  - Implemented dynamic AI model fetching system with automatic daily updates
  - Added refresh button to manually update AI models list in New Chat form
  - Enhanced database schema to support unlimited text length in chat fields (task, constraints, optional, audience)
  - Updated form validation to allow 10,000 words instead of 200 characters in key fields
  - Created ModelUpdater class for automatic provider synchronization
  - Added /api/ai-providers/refresh endpoint for manual model updates
  - Fixed chat creation validation errors caused by restrictive field length limits
  - Improved model recommendation system to consider latest flagship models by default
- July 13, 2025. Fixed critical session management error preventing app startup
  - Resolved "Cannot read properties of undefined (reading 'regenerate')" error in Passport session management
  - Updated session configuration to use memory store for development, PostgreSQL for production
  - Added proper error handling for session destruction during logout
  - Fixed memorystore package import and usage for development environment
  - Enhanced session middleware configuration with proper rolling session support
  - Application now starts successfully without session-related crashes
- July 14, 2025. Fixed API key management 500 errors by restoring development authentication
  - Restored mock user authentication system for development mode as originally intended
  - Updated all API routes to use mockAuth middleware that bypasses authentication in development
  - Fixed authentication flow causing 500 errors when users attempted to add API keys
  - Mock user setup automatically creates "dev-user" for all authenticated requests in development
  - All API key functionality now working correctly with proper validation and error handling
  - Fixed critical encryption key length issue in CryptoService causing "Invalid key length" errors
  - Updated development encryption key to exactly 32 bytes as required by AES-256-GCM algorithm
  - API key encryption and decryption now working properly for secure key storage
- July 15, 2025. Fixed AI model compatibility issues across all providers
  - Updated OpenAI models to use actual working models: gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-4, gpt-3.5-turbo
  - Fixed Gemini API calls to use proper getGenerativeModel() method instead of deprecated models.generateContent()
  - Updated Claude models to use actual working models: claude-3-5-sonnet-20241022, claude-3-opus-20240229, etc.
  - Updated Grok models to use actual working models: grok-beta, grok-vision-beta
  - Fixed existing chat records in database to use valid model names
  - Added comprehensive error logging for all AI providers to help debug API issues
  - Cleared corrupted encrypted API keys - users need to re-enter API keys in settings
  - All AI providers now have proper error handling and debugging logs
  - Enhanced researcher role with automatic Deep Research mode activation
    - Added comprehensive Deep Research mode framework that activates automatically when researcher role is selected
    - Enhanced analytical capabilities including multi-dimensional analysis, pattern recognition, and strategic context awareness
    - Improved research methodologies with multi-source cross-referencing and validation
    - Added executive-level synthesis and actionable insights generation
    - Deep Research mode provides advanced critical thinking and bias detection capabilities
```

## User Preferences

```
Preferred communication style: Simple, everyday language.
```