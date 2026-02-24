import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

console.log("https://rvvzbvcluzgclladgely.supabase.co", import.meta.env.VITE_SUPABASE_URL);
console.log("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2dnpidmNsdXpnY2xsYWRnZWx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3MDI0NTYsImV4cCI6MjA4NzI3ODQ1Nn0.KkoF7TdTc0p130zB2iBv3Ktw1OeMZu87z74odFkclo0", import.meta.env.VITE_SUPABASE_ANON_KEY);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
