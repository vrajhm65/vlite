import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { SocketProvider } from './context/SocketContext.jsx';
import Layout from './components/Layout.jsx';
import HomePage from './pages/HomePage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import HostDashboardPage from './pages/HostDashboardPage.jsx';
import RoomPage from './pages/RoomPage.jsx';
import JoinRoomPage from './pages/JoinRoomPage.jsx';
import RoomWaitingPage from './pages/RoomWaitingPage.jsx';
import ActiveSessionPage from './pages/ActiveSessionPage.jsx';
import ResultsPage from './pages/ResultsPage.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/join" element={<JoinRoomPage />} />
            <Route path="/room/:lrn" element={<RoomWaitingPage />} />
            <Route
              path="/host/dashboard"
              element={
                <ProtectedRoute allowedRoles={['host']}>
                  <HostDashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/host/rooms/:roomId"
              element={
                <ProtectedRoute allowedRoles={['host']}>
                  <RoomPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/session/:roomId"
              element={
                <ProtectedRoute allowedRoles={['host', 'participant']}>
                  <ActiveSessionPage />
                </ProtectedRoute>
              }
            />
            <Route path="/results/:roomId" element={<ResultsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;
