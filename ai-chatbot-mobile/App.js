import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { isAuthenticated } from './services/auth';
import SignInScreen from './screens/SignInScreen';
import SignUpScreen from './screens/SignUpScreen';
import ChatScreen from './screens/ChatScreen';

const Stack = createStackNavigator();

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

const AppStack = () => (
  <Stack.Navigator 
    screenOptions={{
      headerShown: false,
      cardStyle: { backgroundColor: '#f5f5f5' }
    }}
  >
    <Stack.Screen name="Chat" component={ChatScreen} />
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