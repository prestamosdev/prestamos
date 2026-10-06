import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import {
  ClientDetailScreen, ClientFormScreen, ClientsScreen, HomeScreen, LoanDetailScreen, LoanFormScreen,
  LoginScreen, ReportsScreen,
} from './src/screens/screens';

import { Ionicons } from '@expo/vector-icons';

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

function Main() {
  return (
    <Tabs.Navigator screenOptions={({ route }) => ({
      tabBarIcon: ({ color, size }) => {
        let name = 'home';
        if (route.name === 'Clientes') name = 'people';
        if (route.name === 'Reportes') name = 'bar-chart';
        return <Ionicons name={name as any} size={size} color={color} />;
      },
      tabBarActiveTintColor: '#00B87C',
      tabBarInactiveTintColor: '#8c929e',
      headerShown: false,
      tabBarStyle: { borderTopWidth: 0, elevation: 8, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10 }
    })}>
      <Tabs.Screen name="Inicio" component={HomeScreen} />
      <Tabs.Screen name="Clientes" component={ClientsScreen} />
      <Tabs.Screen name="Reportes" component={ReportsScreen} />
    </Tabs.Navigator>
  );
}

function Root() {
  const { session, loading } = useAuth();
  if (loading) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;
  if (!session) return <LoginScreen />;
  return (
    <Stack.Navigator>
      <Stack.Screen name="Main" component={Main} options={{ headerShown: false }} />
      <Stack.Screen name="ClientForm" component={ClientFormScreen} options={{ title: 'Cliente' }} />
      <Stack.Screen name="ClientDetail" component={ClientDetailScreen} options={{ title: 'Detalle del cliente' }} />
      <Stack.Screen name="LoanForm" component={LoanFormScreen} options={{ title: 'Nuevo préstamo' }} />
      <Stack.Screen name="LoanDetail" component={LoanDetailScreen} options={{ title: 'Préstamo' }} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer><Root /></NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
