# MindfulChat - Mental Health Chatbot Mobile App

A beautiful React Native mobile application for mental health support with AI-powered chatbot capabilities, voice recognition, and cognitive load monitoring.

## Features

- **Authentication**: Secure sign-in/sign-up with JWT tokens
- **Voice Input**: Speech-to-text functionality for hands-free chatting
- **AI Chatbot**: Intelligent mental health companion with personalized responses
- **Cognitive Load Monitoring**: Real-time tracking of user's cognitive state
- **Beautiful UI**: Modern, calming design with smooth animations
- **Baseline Learning**: Adaptive personalization over time

## Prerequisites

- Node.js (v16 or higher)
- React Native development environment
- Backend API running (see backend setup instructions)
- Physical device or emulator for testing

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Backend Configuration

Update the API base URL in `services/api.js`:

```javascript
const API_BASE_URL = 'http://YOUR_BACKEND_IP:8000'; // Replace with your backend URL
```

### 3. Run the App

```bash
# Start the development server
npm start

# Run on iOS
npm run ios

# Run on Android
npm run android

# Run on Web
npm run web
```

## App Structure

```
ai-chatbot-mobile/
├── screens/
│   ├── SignInScreen.js      # User authentication
│   ├── SignUpScreen.js      # User registration
│   └── ChatScreen.js        # Main chat interface
├── services/
│   ├── api.js              # API communication
│   └── auth.js             # Authentication utilities
├── App.js                  # Main app component
└── package.json            # Dependencies
```

## Key Features Explained

### Authentication Flow
- Users can sign up with email and password
- JWT tokens are stored securely using AsyncStorage
- Automatic session persistence

### Chat Interface
- Real-time messaging with AI assistant
- Voice input support using speech recognition
- Cognitive load indicators
- Baseline learning status display

### Voice Recognition
- Tap microphone button to start recording
- Automatic speech-to-text conversion
- Visual feedback during recording

### Cognitive Load Monitoring
- Backend analyzes typing patterns and voice features
- Displays current cognitive load state
- Adapts chatbot responses based on user state

## API Integration

The app integrates with the following backend endpoints:

### Authentication
- `POST /auth/signup` - User registration
- `POST /auth/signin` - User login

### Chat
- `POST /chat/start` - Start new chat session
- `POST /chat/message` - Send message with features

### Baseline
- `GET /baseline/status` - Get baseline learning status

## Styling

The app features a calming purple and white color scheme designed for mental wellness:

- Primary color: `#667eea` (calming purple)
- Background: `#f5f5f5` (soft gray)
- Text: Dark grays and whites for readability

## Permissions Required

- **Microphone**: For voice input functionality
- **Network Access**: For API communication

## Troubleshooting

### Voice Recognition Not Working
1. Ensure microphone permissions are granted
2. Check if device supports speech recognition
3. Verify internet connection

### API Connection Issues
1. Confirm backend server is running
2. Check API_BASE_URL configuration
3. Ensure network connectivity

### Navigation Issues
1. Clear app data and restart
2. Check AsyncStorage for corrupted tokens

## Development Notes

- Uses React Navigation for screen transitions
- AsyncStorage for persistent authentication
- React Native Vector Icons for UI elements
- Voice recognition via @react-native-community/voice

## Future Enhancements

- Push notifications for check-ins
- Mood tracking and analytics
- Meditation and breathing exercises
- Emergency contact integration
- Multi-language support

## Support

For issues and feature requests, please contact the development team.
