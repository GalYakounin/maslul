import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from '@delivery/shared';
import { supabase } from './lib/supabase';
import App from './App';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider supabase={supabase}>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
