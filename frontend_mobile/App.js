import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { isAuthenticated } from './services/auth';
import SignInScreen from './screens/SignInScreen';
import SignUpScreen from './screens/SignUpScreen';
import ChatScreen from './screens/ChatScreen';
import HomeScreen from './screens/ThoughtfulHomeScreen';
import BreathingScreen from './screens/BreathingScreen';
import EmergencyScreen from './screens/EmergencyScreen';
import EnhancedAnalyticsScreen from './screens/EnhancedAnalyticsScreen';
import JournalingScreen from './screens/JournalingScreen';
import ActivitiesScreen from './screens/ActivitiesScreen';
import HumanChatScreen from './screens/HumanChatScreen';
import ModernChatScreen from './screens/ModernChatScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

const AuthStack = ({ setUserAuthenticated }) => (
  <Stack.Navigator 
    initialRouteName="SignIn"
    screenOptions={{
      headerShown: false,
      cardStyle: { backgroundColor: '#f5f5f5' }
    }}
  >
    <Stack.Screen name="SignIn">
      {props => <SignInScreen {...props} setUserAuthenticated={setUserAuthenticated} />}
    </Stack.Screen>
    <Stack.Screen name="SignUp">
      {props => <SignUpScreen {...props} setUserAuthenticated={setUserAuthenticated} />}
    </Stack.Screen>
  </Stack.Navigator>
);

const MainTabs = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      tabBarIcon: ({ focused, color, size }) => {
        let iconName;

        if (route.name === 'Home') {
          iconName = focused ? 'home' : 'home-outline';
        } else if (route.name === 'Activities') {
          iconName = focused ? 'grid' : 'grid-outline';
        } else if (route.name === 'Chat') {
          iconName = focused ? 'chatbubble' : 'chatbubble-outline';
        } else if (route.name === 'Journal') {
          iconName = focused ? 'book' : 'book-outline';
        } else if (route.name === 'Analytics') {
          iconName = focused ? 'analytics' : 'analytics-outline';
        }

        return <Ionicons name={iconName} size={size} color={color} />;
      },
      tabBarActiveTintColor: '#6B46C1',
      tabBarInactiveTintColor: '#9CA3AF',
      tabBarStyle: {
        backgroundColor: 'white',
        borderTopWidth: 0,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 8,
      },
      tabBarLabelStyle: {
        fontSize: 12,
        fontWeight: '600',
      },
    })}
  >
    <Tab.Screen 
      name="Home" 
      component={HomeScreen}
      options={{ title: 'Home' }}
    />
    <Tab.Screen 
      name="Activities" 
      component={ActivitiesScreen}
      options={{ title: 'Activities' }}
    />
    <Tab.Screen 
      name="Chat" 
      component={ChatScreen}
      options={{ title: 'Chat' }}
    />
    <Tab.Screen 
      name="Journal" 
      component={JournalingScreen}
      options={{ title: 'Journal' }}
    />
    <Tab.Screen 
      name="Analytics" 
      component={EnhancedAnalyticsScreen}
      options={{ title: 'Analytics' }}
    />
  </Tab.Navigator>
);

const AppStack = () => (
  <Stack.Navigator 
    screenOptions={{
      headerShown: false,
      cardStyle: { backgroundColor: '#f5f5f5' }
    }}
  >
    <Stack.Screen name="MainTabs" component={MainTabs} />
    <Stack.Screen name="Breathing" component={BreathingScreen} />
    <Stack.Screen name="Emergency" component={EmergencyScreen} />
  </Stack.Navigator>
);

const App = () => {
  const [userAuthenticated, setUserAuthenticated] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const authenticated = await isAuthenticated();
      setUserAuthenticated(authenticated);
    } catch (error) {
      console.error('Error checking auth status:', error);
      setUserAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return null; // You could add a loading screen here
  }

  return (
    <NavigationContainer>
      <StatusBar style="light" />
      {userAuthenticated ? <AppStack /> : <AuthStack setUserAuthenticated={setUserAuthenticated} />}
    </NavigationContainer>
  );
};

export default App;